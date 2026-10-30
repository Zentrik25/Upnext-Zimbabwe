"""Production preflight (P5-03): checks that can be run without deploying anything.

Three groups: the settings the process runs with, the database role it connects as, and (optionally) a running
stack over HTTP(S). Each finding is `pass`, `warn` or `fail`. A failure is a launch blocker; a warning is
something to look at. On `local-prod-like` stacks the findings that only matter on a real deployment are
downgraded to warnings and say so, so a throwaway stack can never produce a clean pass for them.
"""

from __future__ import annotations

import socket
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

PASS, WARN, FAIL = "pass", "warn", "fail"
ONE_YEAR = 31536000


@dataclass(frozen=True)
class Finding:
    group: str
    name: str
    status: str
    detail: str = ""


class _Collector:
    def __init__(self, group: str, relaxed: bool) -> None:
        self.group = group
        self.relaxed = relaxed
        self.items: list[Finding] = []

    def check(self, name: str, ok: bool, detail: str = "", *, real_deployment_only: bool = False) -> None:
        if ok:
            self.items.append(Finding(self.group, name, PASS, ""))
        elif real_deployment_only and self.relaxed:
            self.items.append(
                Finding(
                    self.group,
                    name,
                    WARN,
                    f"{detail} (expected on a local-prod-like stack; blocks a real deployment)",
                )
            )
        else:
            self.items.append(Finding(self.group, name, FAIL, detail))

    def warn(self, name: str, ok: bool, detail: str = "") -> None:
        self.items.append(Finding(self.group, name, PASS if ok else WARN, "" if ok else detail))


def settings_findings(conf: Any, environ: dict[str, str]) -> list[Finding]:
    env = getattr(conf, "UPNEXT_ENVIRONMENT", "development")
    relaxed = env == "local-prod-like"
    c = _Collector("settings", relaxed)
    c.check(
        "environment is production",
        env in ("production", "local-prod-like"),
        f"UPNEXT_ENVIRONMENT is {env!r}",
    )
    c.check(
        "environment names a real deployment",
        env == "production",
        f"UPNEXT_ENVIRONMENT is {env!r}",
        real_deployment_only=True,
    )
    c.check("debug is off", not conf.DEBUG, "DEBUG is on")
    secret = conf.SECRET_KEY
    c.check(
        "secret key is long and not a placeholder",
        len(secret) >= 50 and not secret.startswith("django-insecure") and "placeholder" not in secret,
        "DJANGO_SECRET_KEY is short or a placeholder",
    )
    token_key = conf.UPNEXT_TOKEN_KEY
    c.check(
        "token key is separate and at least 32 characters",
        token_key != secret and len(token_key) >= 32,
        "UPNEXT_TOKEN_KEY is unset, short or equal to the secret key",
        real_deployment_only=True,
    )
    c.check(
        "allowed hosts are explicit",
        bool(conf.ALLOWED_HOSTS) and "*" not in conf.ALLOWED_HOSTS,
        "DJANGO_ALLOWED_HOSTS is empty or has a wildcard",
    )
    c.check(
        "session cookie is Secure, HttpOnly, SameSite",
        conf.SESSION_COOKIE_SECURE
        and conf.SESSION_COOKIE_HTTPONLY
        and conf.SESSION_COOKIE_SAMESITE in ("Lax", "Strict"),
        "session cookie flags are weak",
    )
    c.check(
        "CSRF cookie is Secure and SameSite",
        conf.CSRF_COOKIE_SECURE and conf.CSRF_COOKIE_SAMESITE in ("Lax", "Strict"),
        "CSRF cookie flags are weak",
    )
    c.warn(
        "cookie names use the __Host- prefix",
        conf.SESSION_COOKIE_NAME.startswith("__Host-"),
        "UPNEXT_HOST_COOKIE_PREFIX is off (optional; needs a single host, https and path /)",
    )
    c.check(
        "HSTS is at least one year",
        conf.SECURE_HSTS_SECONDS >= ONE_YEAR,
        f"DJANGO_HSTS_SECONDS is {conf.SECURE_HSTS_SECONDS}",
        real_deployment_only=True,
    )
    c.check(
        "CSRF trusted origins are https",
        bool(conf.CSRF_TRUSTED_ORIGINS) and all(o.startswith("https://") for o in conf.CSRF_TRUSTED_ORIGINS),
        "DJANGO_CSRF_TRUSTED_ORIGINS is empty or not https",
        real_deployment_only=True,
    )
    c.check(
        "public base URL is https",
        conf.UPNEXT_PUBLIC_BASE_URL.startswith("https://"),
        "UPNEXT_PUBLIC_BASE_URL is not https",
        real_deployment_only=True,
    )
    c.check(
        "proxy headers are trusted only when configured",
        bool(getattr(conf, "SECURE_PROXY_SSL_HEADER", None)) or conf.SECURE_SSL_REDIRECT is False,
        "SSL redirect is on without a trusted proxy header (redirect loop)",
    )
    c.warn(
        "proxy header trust is enabled behind TLS termination",
        bool(getattr(conf, "SECURE_PROXY_SSL_HEADER", None)),
        "UPNEXT_TRUST_PROXY_HEADERS is off; Django will see http behind the proxy",
    )
    c.check(
        "staff two-step verification is required",
        conf.UPNEXT_STAFF_MFA_REQUIRED,
        "UPNEXT_STAFF_MFA_REQUIRED is off",
    )
    c.check(
        "demo tools are off",
        environ.get("UPNEXT_DEMO_TOOLS") != "1",
        "UPNEXT_DEMO_TOOLS=1",
        real_deployment_only=True,
    )
    c.check(
        "OpenAPI schema is not exposed",
        not conf.EXPOSE_OPENAPI_SCHEMA,
        "the schema endpoint is public",
        real_deployment_only=True,
    )
    backend = conf.UPNEXT_EMAIL_BACKEND
    c.check(
        "e-mail backend is not a development one",
        backend not in ("file", "console"),
        f"UPNEXT_EMAIL_BACKEND={backend}",
        real_deployment_only=True,
    )
    c.warn(
        "an e-mail provider is configured",
        backend == "smtp",
        f"UPNEXT_EMAIL_BACKEND={backend}: no mail is sent (blocker B-01 until a provider is approved "
        "and verified)",
    )
    return c.items


def _mail_hash(conf: Any) -> str:
    from notifications.verification import config_hash

    return config_hash(conf) if hasattr(conf, "UPNEXT_SMTP_HOST") else ""


def database_findings(connection: Any, conf: Any) -> list[Finding]:
    relaxed = getattr(conf, "UPNEXT_ENVIRONMENT", "development") == "local-prod-like"
    c = _Collector("database", relaxed)
    with connection.cursor() as cur:
        cur.execute(
            "SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls "
            "FROM pg_roles WHERE rolname = current_user"
        )
        user, superuser, createdb, createrole, replication, bypass = cur.fetchone()
        c.check("application role is not a superuser", not superuser, f"{user} is a superuser")
        c.check(
            "application role cannot create databases or roles",
            not (createdb or createrole or replication or bypass),
            f"{user} has CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS",
        )
        cur.execute("SELECT has_schema_privilege(current_user, 'public', 'CREATE')")
        c.check(
            "application role cannot create objects in the schema",
            not cur.fetchone()[0],
            f"{user} may create objects (DDL)",
        )
        for table, privilege in (
            ("audit_auditevent", "UPDATE"),
            ("audit_auditevent", "DELETE"),
            ("opportunities_publishingevent", "UPDATE"),
            ("opportunities_reviewdecision", "DELETE"),
            ("accounts_user", "DELETE"),
            ("django_migrations", "UPDATE"),
            ("audit_auditevent", "TRUNCATE"),
        ):
            cur.execute("SELECT has_table_privilege(current_user, %s, %s)", [f"public.{table}", privilege])
            c.check(
                f"cannot {privilege} {table}", not cur.fetchone()[0], f"{user} holds {privilege} on {table}"
            )
        cur.execute(
            "SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.audit_auditevent'::regclass"
        )
        c.check(
            "application role does not own the tables",
            cur.fetchone()[0] != user,
            f"{user} owns the tables (use a separate migrator role)",
        )
        cur.execute("SELECT count(*) FROM accounts_user WHERE email LIKE %s", ["%@demo.upnext.example"])
        demo_users = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM catalog_organisation WHERE name LIKE %s", ["Example %"])
        demo_orgs = cur.fetchone()[0]
        c.check(
            "the database holds no demonstration accounts or issuers",
            demo_users == 0 and demo_orgs == 0,
            f"{demo_users} demo account(s) and {demo_orgs} fictional issuer(s) are present",
            real_deployment_only=True,
        )
        cur.execute(
            "SELECT count(*) FROM notifications_emaildeliveryverification WHERE config_hash = %s",
            [_mail_hash(conf)],
        )
        c.warn(
            "e-mail delivery has a verification record for the live sender configuration",
            cur.fetchone()[0] > 0,
            "no record: change of e-mail stays off and launch blocker B-01 is open",
        )
        cur.execute("SHOW statement_timeout")
        c.check("statement timeout is set", cur.fetchone()[0] not in ("0", "0ms"), "no statement timeout")
    return c.items


def _fetch(
    url: str, ctx: ssl.SSLContext | None, *, follow: bool = True, timeout: float = 10.0
) -> tuple[int, dict[str, str], list[str], str]:
    class _NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a: Any, **k: Any) -> None:
            return None

    handlers: list[Any] = [urllib.request.HTTPSHandler(context=ctx)] if ctx else []
    if not follow:
        handlers.append(_NoRedirect())
    opener = urllib.request.build_opener(*handlers)
    if urlparse(url).scheme not in ("http", "https"):
        raise OSError("only http and https addresses are probed")
    try:
        with opener.open(
            urllib.request.Request(url, headers={"User-Agent": "upnext-preflight"}),  # noqa: S310
            timeout=timeout,
        ) as r:
            body = r.read(200_000).decode("utf-8", "replace")
            return (
                r.status,
                {k.lower(): v for k, v in r.headers.items()},
                r.headers.get_all("Set-Cookie") or [],
                body,
            )
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.headers.get_all("Set-Cookie") or [], ""


def http_findings(
    base_url: str, *, ca_file: str | None = None, http_url: str | None = None, relaxed: bool = False
) -> list[Finding]:
    """Checks against a running stack. `base_url` must be https for a real deployment."""
    c = _Collector("http", relaxed)
    parsed = urlparse(base_url)
    tls = parsed.scheme == "https"
    ctx = ssl.create_default_context(cafile=ca_file) if tls else None
    c.check(
        "the public address is served over https", tls, f"{base_url} is not https", real_deployment_only=True
    )
    if tls:
        try:
            with (
                socket.create_connection((parsed.hostname, parsed.port or 443), timeout=10) as raw,
                ctx.wrap_socket(raw, server_hostname=parsed.hostname) as s,  # type: ignore[union-attr]
            ):
                cert = s.getpeercert()
                version = s.version()
            not_after = str((cert or {}).get("notAfter", ""))
            expires = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=UTC)
            days = (expires - datetime.now(UTC)).days
            c.check("certificate validates and has at least 14 days left", days >= 14, f"{days} days left")
            c.check("TLS 1.2 or newer", version in ("TLSv1.2", "TLSv1.3"), f"negotiated {version}")
        except (OSError, ssl.SSLError, KeyError, ValueError) as e:
            c.check("certificate validates", False, f"{type(e).__name__}: {e}")
    pages = {
        "web": base_url.rstrip("/") + "/",
        "api": base_url.rstrip("/") + "/api/v1/opportunities?limit=1",
        # Staff sign in on the same page as everyone else (D-49); /staff no longer exists.
        "sign-in": base_url.rstrip("/") + "/sign-in",
    }
    for label, url in pages.items():
        try:
            status, headers, _, _ = _fetch(url, ctx)
        except OSError as e:
            c.check(f"{label} answers", False, f"{type(e).__name__}: {e}")
            continue
        c.check(f"{label} answers 200", status == 200, f"HTTP {status}")
        hsts = headers.get("strict-transport-security", "")
        max_age = next(
            (
                int(p.split("=")[1])
                for p in hsts.replace(" ", "").split(";")
                if p.lower().startswith("max-age=") and p.split("=")[1].isdigit()
            ),
            0,
        )
        c.check(
            f"{label} sends HSTS of at least a year",
            max_age >= ONE_YEAR,
            f"Strict-Transport-Security is {hsts or 'missing'}",
            real_deployment_only=not tls,
        )
        c.check(
            f"{label} sends nosniff",
            headers.get("x-content-type-options", "").lower() == "nosniff",
            "X-Content-Type-Options missing",
        )
        c.check(
            f"{label} sends a referrer policy",
            bool(headers.get("referrer-policy")),
            "Referrer-Policy missing",
        )
        if label != "api":
            csp = headers.get("content-security-policy", "")
            c.check(
                f"{label} sends a CSP that forbids framing and plugins",
                "frame-ancestors 'none'" in csp and "object-src 'none'" in csp and "default-src" in csp,
                "CSP is missing or incomplete",
            )
            c.check(
                f"{label} CSP allows no unsafe-eval or wildcard script source",
                "unsafe-eval" not in csp and "script-src *" not in csp,
                "CSP allows unsafe-eval or a wildcard script source",
            )
        server = headers.get("server", "")
        c.warn(
            f"{label} does not disclose a server version",
            not any(ch.isdigit() for ch in server),
            f"Server: {server}",
        )
    try:
        _, _, cookies, _ = _fetch(base_url.rstrip("/") + "/api/v1/auth/csrf", ctx)
        csrf = next((x for x in cookies if "csrf" in x.lower()), "")
        c.check(
            "CSRF cookie has Secure and SameSite",
            "secure" in csrf.lower() and "samesite" in csrf.lower(),
            f"Set-Cookie: {csrf or 'none'}",
            real_deployment_only=not tls,
        )
    except OSError as e:
        c.check("CSRF endpoint answers", False, str(e))
    for path in ("/api/schema", "/.env", "/django-admin/../.git/config"):
        try:
            status, _, _, _ = _fetch(base_url.rstrip("/") + path, ctx)
        except OSError:
            continue
        c.check(f"{path} is not served", status in (301, 302, 403, 404), f"HTTP {status}")
    if http_url:
        try:
            status, headers, _, _ = _fetch(http_url, None, follow=False)
            c.check(
                "plain http redirects to https",
                status in (301, 308) and headers.get("location", "").startswith("https://"),
                f"HTTP {status} {headers.get('location', '')}",
            )
        except OSError as e:
            c.check("plain http answers with a redirect", False, str(e))
    try:
        _, _, _, body = _fetch(base_url.rstrip("/") + "/contact", ctx)
        c.warn(
            "the contact page shows a contact address",
            "mailto:" in body,
            "no contact address is published (blocker B-03)",
        )
    except OSError:
        pass
    return c.items


def summarise(findings: list[Finding]) -> tuple[int, int, int]:
    return (
        sum(f.status == PASS for f in findings),
        sum(f.status == WARN for f in findings),
        sum(f.status == FAIL for f in findings),
    )
