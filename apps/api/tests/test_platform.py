"""API root, error shape, health probes, security headers, logging and settings guards."""

from __future__ import annotations

import io
import json
import logging
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from unittest import mock

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from core.logging import REDACTED, redact_text, redact_value

pytestmark = pytest.mark.django_db
API_DIR = Path(__file__).resolve().parents[1]


def test_api_root_responds_through_api_v1(client: APIClient) -> None:
    response = client.get("/api/v1/")
    assert response.status_code == 200
    assert response.json() == {"name": "UPNEXT API", "version": "v1", "status": "ok"}
    assert response["Content-Type"].startswith("application/json")


def test_unknown_api_paths_return_the_standard_json_error(client: APIClient) -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "not_found" and error["request_id"]
    assert client.get("/api/v1/me/").status_code == 404  # no trailing-slash redirects (contract has none)


def test_request_id_is_generated_and_echoed(client: APIClient) -> None:
    generated = client.get("/api/v1/")["X-Request-ID"]
    assert len(generated) == 32
    assert client.get("/api/v1/", HTTP_X_REQUEST_ID="trace-abc12345")["X-Request-ID"] == "trace-abc12345"
    assert (
        client.get("/api/v1/", HTTP_X_REQUEST_ID="bad id with spaces")["X-Request-ID"] != "bad id with spaces"
    )


def test_error_bodies_carry_the_request_id(client: APIClient) -> None:
    response = client.get("/api/v1/me", HTTP_X_REQUEST_ID="trace-xyz98765")
    assert response.json()["error"]["request_id"] == "trace-xyz98765"


def test_security_headers_on_api_responses(client: APIClient) -> None:
    response = client.get("/api/v1/")
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Frame-Options"] == "DENY"
    assert response["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response["Cross-Origin-Opener-Policy"] == "same-origin"
    assert (
        "Strict-Transport-Security" not in response
    )  # off unless configured; never includeSubDomains/preload


def test_hsts_never_includes_subdomains_or_preload() -> None:
    from django.conf import settings

    assert settings.SECURE_HSTS_INCLUDE_SUBDOMAINS is False and settings.SECURE_HSTS_PRELOAD is False


def test_health_live_and_ready(client: APIClient) -> None:
    assert client.get("/health/live").json() == {"status": "ok"}
    ready = client.get("/health/ready")
    assert ready.status_code == 200 and ready.json() == {"status": "ok"}
    assert "no-cache" in ready["Cache-Control"]


def test_ready_fails_closed_without_leaking_details(client: APIClient) -> None:
    with mock.patch("core.views.connection.cursor", side_effect=RuntimeError("password=hunter2 host=db")):
        response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert "hunter2" not in response.content.decode()


def test_ready_fails_when_migrations_are_pending(client: APIClient) -> None:
    with mock.patch("core.views.MigrationExecutor") as executor:
        executor.return_value.migration_plan.return_value = [("app", False)]
        response = client.get("/health/ready")
    assert response.status_code == 503


def test_health_rejects_non_get(client: APIClient) -> None:
    assert client.post("/health/live").status_code == 405


def test_redaction_removes_secrets_and_emails() -> None:
    text = "login for jane.doe@example.org password=hunter2 Authorization: Bearer abc.def token: xyz"
    cleaned = redact_text(text)
    for leaked in ("jane.doe@example.org", "hunter2", "abc.def", "xyz"):
        assert leaked not in cleaned
    value = redact_value({"user": {"email": "a@b.co", "password": "p", "id": "123", "nested": ["a@b.co"]}})
    assert value["user"]["email"] == REDACTED and value["user"]["password"] == REDACTED
    assert value["user"]["id"] == "123" and value["user"]["nested"] == [REDACTED]


def test_sec_09_logs_are_json_with_request_id_and_no_credentials(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    from tests.conftest import PASSWORD, csrf, post_json

    stream = io.StringIO()
    handler = logging.getLogger().handlers[0]
    previous = handler.setStream(stream) if hasattr(handler, "setStream") else None
    logging.getLogger().setLevel(logging.INFO)
    try:
        user = make_user()
        post_json(
            client, "/api/v1/auth/login", {"email": user.email, "password": "wrong password!!"}, csrf(client)
        )
        post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD})
        client.get("/api/v1/?secret_token=abc123")
    finally:
        handler.setStream(previous)  # type: ignore[attr-defined]
        logging.getLogger().setLevel(logging.CRITICAL)
    output = stream.getvalue()
    assert output.strip()
    records = [json.loads(line) for line in output.splitlines()]
    assert all(r["request_id"] for r in records)
    assert {"auth.login.failure", "auth.login.success"} <= {r.get("event") for r in records}
    for leaked in (user.email, PASSWORD, "wrong password!!", "abc123", "sessionid"):
        assert leaked not in output
    assert all("?" not in r.get("path", "") for r in records)  # query strings are never logged


def _run_prod(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    base = {
        "PATH": os.environ["PATH"],
        "POSTGRES_DB": "x",
        "POSTGRES_USER": "x",
        "POSTGRES_PASSWORD": "x",
        "DJANGO_SETTINGS_MODULE": "config.settings.prod",
    }
    return subprocess.run(
        [sys.executable, "-c", "import config.settings.prod"],
        env={**base, **env},
        cwd=API_DIR,
        capture_output=True,
        text=True,
        check=False,
    )


GOOD = {"DJANGO_SECRET_KEY": "k" * 64, "DJANGO_ALLOWED_HOSTS": "upnext.test", "UPNEXT_SECURE_COOKIES": "true"}


def test_production_settings_accept_a_safe_configuration() -> None:
    assert _run_prod(GOOD).returncode == 0


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"DJANGO_SECRET_KEY": "short"}, "at least 50 characters"),
        ({"DJANGO_SECRET_KEY": "django-insecure-" + "x" * 60}, "at least 50 characters"),
        ({"DJANGO_ALLOWED_HOSTS": ""}, "DJANGO_ALLOWED_HOSTS"),
        ({"UPNEXT_SECURE_COOKIES": "false"}, "UPNEXT_SECURE_COOKIES"),
    ],
)
def test_production_settings_fail_fast_on_unsafe_configuration(
    override: dict[str, str], message: str
) -> None:
    result = _run_prod({**GOOD, **override})
    assert result.returncode != 0 and message in result.stderr


def test_missing_secret_key_is_a_startup_error() -> None:
    env = {k: v for k, v in GOOD.items() if k != "DJANGO_SECRET_KEY"}
    result = _run_prod(env)
    assert result.returncode != 0 and "DJANGO_SECRET_KEY" in result.stderr


def test_staff_and_api_responses_are_marked_noindex(client: APIClient) -> None:
    for path in ("/api/v1/", "/health/live", "/staff/login/"):
        response = client.get(path)
        assert response["X-Robots-Tag"] == "noindex, nofollow", path
