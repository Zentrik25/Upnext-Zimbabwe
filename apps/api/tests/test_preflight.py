"""Production preflight and least-privilege database roles (P5-02, P5-03)."""

from __future__ import annotations

import os
from types import SimpleNamespace

import psycopg
import pytest
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

from core import preflight

GOOD: dict[str, object] = dict(  # noqa: C408
    UPNEXT_ENVIRONMENT="production",
    DEBUG=False,
    SECRET_KEY="k" * 60,
    UPNEXT_TOKEN_KEY="t" * 40,
    ALLOWED_HOSTS=["upnext.example"],
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_NAME="__Host-upnext_sid",
    CSRF_COOKIE_SECURE=True,
    CSRF_COOKIE_SAMESITE="Lax",
    SECURE_HSTS_SECONDS=31536000,
    CSRF_TRUSTED_ORIGINS=["https://upnext.example"],
    UPNEXT_PUBLIC_BASE_URL="https://upnext.example",
    SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
    SECURE_SSL_REDIRECT=False,
    UPNEXT_STAFF_MFA_REQUIRED=True,
    EXPOSE_OPENAPI_SCHEMA=False,
    UPNEXT_EMAIL_BACKEND="smtp",
)


def conf(**changes: object) -> SimpleNamespace:
    return SimpleNamespace(**{**GOOD, **changes})


def status(findings: list[preflight.Finding], name: str) -> str:
    return next(f.status for f in findings if f.name == name)


def test_a_good_production_configuration_has_no_failures() -> None:
    findings = preflight.settings_findings(conf(), {})
    assert [f for f in findings if f.status == preflight.FAIL] == []


@pytest.mark.parametrize(
    ("change", "name"),
    [
        ({"DEBUG": True}, "debug is off"),
        ({"SECRET_KEY": "short"}, "secret key is long and not a placeholder"),
        ({"UPNEXT_TOKEN_KEY": "k" * 60}, "token key is separate and at least 32 characters"),
        ({"ALLOWED_HOSTS": ["*"]}, "allowed hosts are explicit"),
        ({"SESSION_COOKIE_SECURE": False}, "session cookie is Secure, HttpOnly, SameSite"),
        ({"CSRF_COOKIE_SECURE": False}, "CSRF cookie is Secure and SameSite"),
        ({"SECURE_HSTS_SECONDS": 3600}, "HSTS is at least one year"),
        ({"CSRF_TRUSTED_ORIGINS": ["http://x"]}, "CSRF trusted origins are https"),
        ({"UPNEXT_PUBLIC_BASE_URL": "http://x"}, "public base URL is https"),
        ({"UPNEXT_STAFF_MFA_REQUIRED": False}, "staff two-step verification is required"),
        ({"EXPOSE_OPENAPI_SCHEMA": True}, "OpenAPI schema is not exposed"),
        ({"UPNEXT_EMAIL_BACKEND": "file"}, "e-mail backend is not a development one"),
    ],
)
def test_each_unsafe_setting_is_a_failure(change: dict[str, object], name: str) -> None:
    assert status(preflight.settings_findings(conf(**change), {}), name) == preflight.FAIL


def test_demo_tools_fail_in_production() -> None:
    assert (
        status(preflight.settings_findings(conf(), {"UPNEXT_DEMO_TOOLS": "1"}), "demo tools are off")
        == preflight.FAIL
    )


def test_a_local_prod_like_stack_gets_warnings_never_a_clean_pass() -> None:
    findings = preflight.settings_findings(
        conf(UPNEXT_ENVIRONMENT="local-prod-like", SECURE_HSTS_SECONDS=0, UPNEXT_EMAIL_BACKEND="file"),
        {"UPNEXT_DEMO_TOOLS": "1"},
    )
    for name in (
        "HSTS is at least one year",
        "demo tools are off",
        "e-mail backend is not a development one",
        "environment names a real deployment",
    ):
        assert status(findings, name) == preflight.WARN
    assert [f for f in findings if f.status == preflight.FAIL] == []
    assert all("local-prod-like" in f.detail for f in findings if f.name == "HSTS is at least one year")


def test_secret_values_never_appear_in_findings() -> None:
    text = " ".join(
        f"{f.name} {f.detail}"
        for f in preflight.settings_findings(
            conf(SECRET_KEY="s3cr3t-value", UPNEXT_TOKEN_KEY="s3cr3t-value"), {}
        )
    )
    assert "s3cr3t-value" not in text


def test_the_command_exits_non_zero_on_a_failure(db: None) -> None:
    with pytest.raises(CommandError):
        call_command("check_production_config", "--skip-database")  # the test settings are not production


# --- least-privilege roles, exercised against a real PostgreSQL role -----------------------------------------------

APP, RO = "upnext_test_app", "upnext_test_ro"
APP_PW, RO_PW = "test-app-password-0123456789", "test-ro-password-0123456789"


@pytest.fixture
def roles(transactional_db: None, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("UPNEXT_DB_APP_PASSWORD", APP_PW)
    monkeypatch.setenv("UPNEXT_DB_READONLY_PASSWORD", RO_PW)
    call_command("provision_db_roles", "--app-user", APP, "--readonly-user", RO)
    yield
    with connection.cursor() as cur:
        for role in (APP, RO):
            cur.execute(f'DROP OWNED BY "{role}"')
            cur.execute(f'DROP ROLE IF EXISTS "{role}"')


def connect_as(user: str, password: str) -> psycopg.Connection:
    d = settings.DATABASES["default"]
    c = psycopg.connect(
        dbname=str(d["NAME"]),
        user=user,
        password=password,
        host=str(d["HOST"]),
        port=str(d["PORT"]),
        autocommit=True,
        connect_timeout=5,
        options="-c statement_timeout=15000",
    )
    return c


def denied(c: psycopg.Connection, statement: str) -> bool:
    try:
        c.execute(statement)
    except psycopg.errors.InsufficientPrivilege:
        return True
    except psycopg.Error:
        return False
    return False


def test_the_application_role_has_data_rights_only(roles: None) -> None:
    c = connect_as(APP, APP_PW)
    assert c.execute("SELECT count(*) FROM accounts_user").fetchone() is not None
    assert denied(c, "CREATE TABLE should_not_exist (a int)")
    assert denied(c, "DROP TABLE accounts_user")
    assert denied(c, "TRUNCATE audit_auditevent")
    assert denied(c, "UPDATE audit_auditevent SET action = action")
    assert denied(c, "DELETE FROM audit_auditevent")
    assert denied(c, "DELETE FROM opportunities_publishingevent")
    assert denied(c, "DELETE FROM accounts_user")
    assert denied(c, "UPDATE django_migrations SET app = app")
    assert denied(c, "ALTER TABLE accounts_user ADD COLUMN x int")
    c.close()


def test_the_application_role_still_runs_what_the_application_needs(roles: None) -> None:
    c = connect_as(APP, APP_PW)
    c.execute("SELECT 1 FROM django_migrations LIMIT 1")  # readiness probe reads the migration history
    c.execute("DELETE FROM django_session")  # session cleanup
    c.execute(  # the audit log is append-only, but appending must work (sequence rights included)
        "INSERT INTO audit_auditevent (occurred_at, actor_type, action, object_type, severity, request_id) "
        "VALUES (now(), 'system', 'preflight.test', 'test', 'info', 'x')"
    )
    c.close()


def test_the_readonly_role_can_only_read(roles: None) -> None:
    c = connect_as(RO, RO_PW)
    assert c.execute("SELECT count(*) FROM accounts_user").fetchone() is not None
    assert denied(c, "DELETE FROM django_session")
    assert denied(
        c, "INSERT INTO django_session (session_key, session_data, expire_date) VALUES ('a','b',now())"
    )
    c.close()


def test_roles_have_no_dangerous_attributes(roles: None) -> None:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname IN (%s, %s)",
            [APP, RO],
        )
        rows = cur.fetchall()
    assert len(rows) == 2
    assert all(not any(r[1:]) for r in rows)


def test_provisioning_refuses_a_missing_or_short_password(
    transactional_db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("UPNEXT_DB_APP_PASSWORD", raising=False)
    with pytest.raises(CommandError):
        call_command("provision_db_roles")
    monkeypatch.setenv("UPNEXT_DB_APP_PASSWORD", "short")
    with pytest.raises(CommandError):
        call_command("provision_db_roles")


def test_the_preflight_database_checks_pass_for_the_application_role(roles: None) -> None:
    """Run the checks over a connection made as the application role."""
    d = settings.DATABASES["default"]
    c = connect_as(APP, APP_PW)

    class Wrapper:
        def cursor(self):  # type: ignore[no-untyped-def]
            return c.cursor()

    findings = preflight.database_findings(Wrapper(), SimpleNamespace(UPNEXT_ENVIRONMENT="production"))
    failed = [f for f in findings if f.status == preflight.FAIL]
    assert failed == [], failed
    c.close()
    assert d  # silence unused


def test_the_preflight_database_checks_fail_for_an_owner_role(db: None) -> None:
    findings = preflight.database_findings(connection, SimpleNamespace(UPNEXT_ENVIRONMENT="production"))
    assert any(f.status == preflight.FAIL for f in findings)
    assert os.environ  # the test connection is the owner/superuser role


def test_demo_data_in_the_database_is_a_blocker_for_a_real_deployment(db: None, make_user: object) -> None:
    from accounts.models import User

    User.objects.create_user("someone@demo.upnext.example", "x" * 20, "Demo")
    prod = preflight.database_findings(connection, SimpleNamespace(UPNEXT_ENVIRONMENT="production"))
    local = preflight.database_findings(connection, SimpleNamespace(UPNEXT_ENVIRONMENT="local-prod-like"))
    name = "the database holds no demonstration accounts or issuers"
    assert status(prod, name) == preflight.FAIL
    assert status(local, name) == preflight.WARN


def test_demo_seeding_is_refused_without_demo_tools(
    db: None, monkeypatch: pytest.MonkeyPatch, settings: object
) -> None:
    monkeypatch.delenv("UPNEXT_DEMO_TOOLS", raising=False)
    settings.DEBUG = False  # type: ignore[attr-defined]
    with pytest.raises(CommandError, match="UPNEXT_DEMO_TOOLS"):
        call_command("seed_demo", "--force")
