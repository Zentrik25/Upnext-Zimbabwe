"""Google API access with a service account: Indexing API, Search Console API (ADR-0027).

No Google client library is used. The OAuth flow for a service account is one signed request (a JWT bearer grant),
so this module signs the assertion with `cryptography` (RS256) and talks to the three endpoints over HTTPS with the
standard library, the same way `accounts.google` and `core.alerts` do. The HTTP layer is a plain function
(`Transport`), so tests replace it and never touch the network.

Secrets: the service-account key is read from `UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE` or `..._JSON`. It is never
logged, never put in an exception message, never stored in the database and never returned by the API; `Credentials`
hides it from `repr`. Only the account's e-mail address (not secret) is shown to administrators so they can grant it
access in Search Console.
"""

from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from django.conf import settings

SCOPE_INDEXING = "https://www.googleapis.com/auth/indexing"
SCOPE_SEARCH_CONSOLE = "https://www.googleapis.com/auth/webmasters.readonly"
TOKEN_URI = "https://oauth2.googleapis.com/token"  # noqa: S105 - a public endpoint, not a secret
PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish"
SEARCH_CONSOLE_BASE = "https://www.googleapis.com/webmasters/v3"
INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
TIMEOUT_SECONDS = 15.0

# (method, url, headers, body, timeout) -> (HTTP status, body bytes). Raises OSError-like errors on network failure.
Transport = Callable[[str, str, dict[str, str], bytes | None, float], tuple[int, bytes]]


class CredentialsError(Exception):
    """The service account is missing or unusable. The message names the problem, never the key."""


class ApiError(Exception):
    """A Google call failed. `kind` drives the caller's behaviour; `status` is the HTTP status (0 = no response)."""

    def __init__(self, kind: str, status: int, message: str) -> None:
        super().__init__(message)
        self.kind = kind  # quota | auth | permission | invalid | not_found | server | network
        self.status = status


@dataclass(frozen=True)
class Credentials:
    client_email: str
    private_key: str = field(repr=False)


def load_credentials() -> Credentials:
    """The configured service account, validated. Raises `CredentialsError` (without the key in the message)."""
    raw = ""
    path = str(settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE or "")
    if path:
        try:
            with open(path, encoding="utf-8") as handle:
                raw = handle.read()
        except OSError as exc:
            raise CredentialsError("The service-account key file cannot be read.") from exc
    else:
        raw = str(settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON or "")
    if not raw.strip():
        raise CredentialsError("No service-account key is configured.")
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise CredentialsError("The service-account key is not valid JSON.") from exc
    if not isinstance(data, dict) or data.get("type") != "service_account":
        raise CredentialsError("The key is not a Google service-account key.")
    email, key = data.get("client_email"), data.get("private_key")
    if not isinstance(email, str) or not email or not isinstance(key, str) or "PRIVATE KEY" not in key:
        raise CredentialsError("The service-account key is missing client_email or private_key.")
    try:
        loaded = serialization.load_pem_private_key(key.encode(), password=None)
    except (ValueError, TypeError) as exc:
        raise CredentialsError("The service-account private key cannot be loaded.") from exc
    if not isinstance(loaded, rsa.RSAPrivateKey):
        raise CredentialsError("The service-account private key is not an RSA key.")
    return Credentials(client_email=email, private_key=key)


def credentials_status() -> tuple[str, str | None]:
    """('ok' | 'missing' | 'invalid', service-account e-mail or None) without raising, for status screens."""
    try:
        return "ok", load_credentials().client_email
    except CredentialsError as exc:
        return ("missing" if "No service-account key" in str(exc) else "invalid"), None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def default_transport(
    method: str, url: str, headers: dict[str, str], body: bytes | None, timeout: float
) -> tuple[int, bytes]:
    if not url.startswith("https://"):
        raise ValueError("Google endpoints are https only.")
    request = urllib.request.Request(url, data=body, headers=headers, method=method)  # noqa: S310
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=timeout) as response:
            return response.status, response.read(1_000_000)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(100_000)


def _b64(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def classify(status: int) -> str:
    """The failure class of a non-2xx status."""
    if status == 429:
        return "quota"
    if status == 401:
        return "auth"
    if status == 403:
        return "permission"
    if status == 404:
        return "not_found"
    if status in (400, 409, 410, 422):
        return "invalid"
    return "server" if status >= 500 else "invalid"


class TokenSource:
    """Short-lived OAuth access tokens for a service account, cached per scope until shortly before expiry."""

    def __init__(
        self,
        credentials: Credentials,
        transport: Transport = default_transport,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._credentials = credentials
        self._transport = transport
        self._clock = clock
        self._cache: dict[str, tuple[str, float]] = {}

    def token(self, scope: str) -> str:
        cached = self._cache.get(scope)
        now = self._clock()
        if cached and cached[1] - 60 > now:
            return cached[0]
        issued = int(now)
        header = _b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
        claims = _b64(
            json.dumps(
                {
                    "iss": self._credentials.client_email,
                    "scope": scope,
                    "aud": TOKEN_URI,
                    "iat": issued,
                    "exp": issued + 3600,
                }
            ).encode()
        )
        signing_input = header + b"." + claims
        key = serialization.load_pem_private_key(self._credentials.private_key.encode(), password=None)
        assert isinstance(key, rsa.RSAPrivateKey)
        signature = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
        form = urllib.parse.urlencode(
            {
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": (signing_input + b"." + _b64(signature)).decode(),
            }
        ).encode()
        try:
            status, body = self._transport(
                "POST",
                TOKEN_URI,
                {"Content-Type": "application/x-www-form-urlencoded"},
                form,
                TIMEOUT_SECONDS,
            )
        except (OSError, ValueError) as exc:
            raise ApiError("network", 0, "The token request could not reach Google.") from exc
        if status != 200:
            # invalid_grant / invalid_client: the key was revoked or the account disabled. Config, not data.
            raise ApiError("auth", status, "Google refused the service-account key.")
        try:
            payload = json.loads(body)
            access = str(payload["access_token"])
            lifetime = float(payload.get("expires_in", 3600))
        except (ValueError, KeyError, TypeError) as exc:
            raise ApiError("auth", status, "Google's token answer could not be read.") from exc
        self._cache[scope] = (access, now + lifetime)
        return access

    def forget(self, scope: str) -> None:
        self._cache.pop(scope, None)


class _Client:
    scope = ""

    def __init__(self, tokens: TokenSource, transport: Transport = default_transport) -> None:
        self._tokens = tokens
        self._transport = transport

    def _call(self, method: str, url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode()
        for attempt in (1, 2):
            headers = {
                "Authorization": f"Bearer {self._tokens.token(self.scope)}",
                "Accept": "application/json",
            }
            if body is not None:
                headers["Content-Type"] = "application/json"
            try:
                status, raw = self._transport(method, url, headers, body, TIMEOUT_SECONDS)
            except (OSError, ValueError) as exc:
                raise ApiError("network", 0, f"The request failed: {type(exc).__name__}.") from exc
            if status == 401 and attempt == 1:  # an expired or revoked cached token: fetch a new one once
                self._tokens.forget(self.scope)
                continue
            if 200 <= status < 300:
                try:
                    parsed = json.loads(raw) if raw else {}
                except ValueError as exc:
                    raise ApiError("server", status, "Google's answer could not be read.") from exc
                return parsed if isinstance(parsed, dict) else {}
            raise ApiError(classify(status), status, _reason(raw, status))
        raise ApiError("auth", 401, "Google refused the credentials.")  # pragma: no cover


def _reason(raw: bytes, status: int) -> str:
    """Google's own short error status (e.g. RESOURCE_EXHAUSTED), never the whole body."""
    try:
        error = json.loads(raw).get("error", {})
        label = str(error.get("status") or "")[:60]
        message = str(error.get("message") or "")[:160]
        return f"HTTP {status} {label}: {message}".strip()
    except ValueError, AttributeError:
        return f"HTTP {status}"


@dataclass(frozen=True)
class PublishResult:
    http_status: int
    notify_time: datetime | None


class IndexingClient(_Client):
    scope = SCOPE_INDEXING

    def publish(self, url: str, kind: str) -> PublishResult:
        """Send one URL_UPDATED or URL_DELETED. HTTP 200 only means Google received the notification."""
        answer = self._call("POST", PUBLISH_URL, {"url": url, "type": kind})
        meta = answer.get("urlNotificationMetadata", {})
        latest = meta.get("latestUpdate") or meta.get("latestRemove") or {}
        return PublishResult(200, _parse_time(latest.get("notifyTime")))


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class SearchConsoleClient(_Client):
    scope = SCOPE_SEARCH_CONSOLE

    def analytics(
        self, site: str, *, start: str, end: str, dimensions: list[str], row_limit: int
    ) -> list[dict[str, Any]]:
        quoted = urllib.parse.quote(site, safe="")
        answer = self._call(
            "POST",
            f"{SEARCH_CONSOLE_BASE}/sites/{quoted}/searchAnalytics/query",
            {
                "startDate": start,
                "endDate": end,
                "dimensions": dimensions,
                "rowLimit": row_limit,
                "dataState": "final",
            },
        )
        rows = answer.get("rows", [])
        return rows if isinstance(rows, list) else []

    def sitemaps(self, site: str) -> list[dict[str, Any]]:
        quoted = urllib.parse.quote(site, safe="")
        answer = self._call("GET", f"{SEARCH_CONSOLE_BASE}/sites/{quoted}/sitemaps")
        rows = answer.get("sitemap", [])
        return rows if isinstance(rows, list) else []

    def inspect(self, site: str, url: str) -> dict[str, Any]:
        answer = self._call("POST", INSPECTION_URL, {"inspectionUrl": url, "siteUrl": site})
        result = answer.get("inspectionResult", {})
        return result if isinstance(result, dict) else {}
