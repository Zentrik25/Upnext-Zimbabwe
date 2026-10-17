"""Foundational authentication behaviour: CSRF, login/logout, /me, generic errors, throttling."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast

import pytest
from django.conf import settings
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from accounts.models import AccountStatus, User

from .conftest import PASSWORD, csrf, post_json

LOGIN = "/api/v1/auth/login"
pytestmark = pytest.mark.django_db


def test_csrf_endpoint_issues_token_and_cookie(client: APIClient) -> None:
    response = client.get("/api/v1/auth/csrf")
    assert response.status_code == 200
    assert response.json()["csrf_token"]
    cookie = response.cookies[settings.CSRF_COOKIE_NAME]
    assert cookie["samesite"] == "Lax"
    assert not cookie["httponly"]  # the SPA must echo it in X-CSRFToken
    assert "no-cache" in response["Cache-Control"] or "no-store" in response["Cache-Control"]


def test_login_requires_csrf_even_for_anonymous_requests(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    response = client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"


def test_login_success_sets_http_only_session_and_returns_user(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user(roles=("editor",))
    response = post_json(client, LOGIN, {"email": user.email.upper(), "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.pk)
    assert body["roles"] == ["editor"]
    assert body["email_verified"] is True
    assert "password" not in body
    session = response.cookies[settings.SESSION_COOKIE_NAME]
    assert session["httponly"] and session["samesite"] == "Lax"
    me = client.get("/api/v1/me")
    assert me.status_code == 200 and me.json()["email"] == user.email


def test_unknown_email_and_wrong_password_are_indistinguishable(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    wrong = post_json(client, LOGIN, {"email": user.email, "password": "definitely wrong password"})
    unknown = post_json(
        client, LOGIN, {"email": "nobody@example.org", "password": "definitely wrong password"}
    )
    assert wrong.status_code == unknown.status_code == 401
    wrong_error, unknown_error = wrong.json()["error"], unknown.json()["error"]
    assert wrong_error["code"] == unknown_error["code"] == "invalid_credentials"
    assert wrong_error["message"] == unknown_error["message"]


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (AccountStatus.PENDING_VERIFICATION, "email_not_verified"),
        (AccountStatus.SUSPENDED, "account_unavailable"),
        (AccountStatus.DEACTIVATED, "account_unavailable"),
        (AccountStatus.RESTRICTED, "account_unavailable"),  # semantics OPEN (OQ-15)
    ],
)
def test_non_active_accounts_cannot_start_a_session(
    client: APIClient, make_user: Callable[..., User], status: str, code: str
) -> None:
    user = make_user(status=status)
    response = post_json(client, LOGIN, {"email": user.email, "password": PASSWORD})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == code
    assert client.get("/api/v1/me").status_code == 401


def test_status_is_only_revealed_after_correct_credentials(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user(status=AccountStatus.SUSPENDED)
    response = post_json(client, LOGIN, {"email": user.email, "password": "definitely wrong password"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_login_rejects_unknown_fields_and_bad_input(client: APIClient) -> None:
    token = csrf(client)
    bad = post_json(client, LOGIN, {"email": "not-an-email", "password": "x", "status": "active"}, token)
    assert bad.status_code == 400
    error = bad.json()["error"]
    assert error["code"] == "validation_failed" and error["request_id"]
    assert {"email", "status"} <= set(error["fields"])


def test_per_email_failure_limit_returns_429_with_retry_after(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    token = csrf(client)
    for _ in range(settings.UPNEXT_LOGIN_FAILURES_PER_EMAIL):
        assert (
            post_json(client, LOGIN, {"email": user.email, "password": "wrong password!!"}, token).status_code
            == 401
        )
    blocked = post_json(
        client, LOGIN, {"email": user.email, "password": PASSWORD}, token
    )  # even the right password
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"
    assert int(blocked["Retry-After"]) > 0


def test_successful_login_resets_the_failure_counter(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    token = csrf(client)
    for _ in range(settings.UPNEXT_LOGIN_FAILURES_PER_EMAIL - 1):
        post_json(client, LOGIN, {"email": user.email, "password": "wrong password!!"}, token)
    assert post_json(client, LOGIN, {"email": user.email, "password": PASSWORD}, token).status_code == 200
    client.post("/api/v1/auth/logout", HTTP_X_CSRFTOKEN=csrf(client))
    for _ in range(settings.UPNEXT_LOGIN_FAILURES_PER_EMAIL - 1):
        assert (
            post_json(client, LOGIN, {"email": user.email, "password": "wrong password!!"}).status_code == 401
        )


def test_ip_throttle_applies(client: APIClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from api.throttles import LoginIpThrottle

    monkeypatch.setattr(LoginIpThrottle, "THROTTLE_RATES", {"login_ip": "3/15m"})
    token = csrf(client)
    codes = [
        post_json(
            client, LOGIN, {"email": f"u{i}@example.org", "password": "wrong password!!"}, token
        ).status_code
        for i in range(5)
    ]
    assert codes == [401, 401, 401, 429, 429]


def test_logout_destroys_the_session(client: APIClient, make_user: Callable[..., User]) -> None:
    user = make_user()
    post_json(client, LOGIN, {"email": user.email, "password": PASSWORD})
    response = client.post("/api/v1/auth/logout", HTTP_X_CSRFTOKEN=csrf(client))
    assert response.status_code == 204
    assert client.get("/api/v1/me").status_code == 401


def test_logout_and_me_require_authentication(client: APIClient) -> None:
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/me").json()["error"]["code"] == "unauthenticated"
    assert client.post("/api/v1/auth/logout", HTTP_X_CSRFTOKEN=csrf(client)).status_code == 401


def test_me_is_not_cacheable(client: APIClient, make_user: Callable[..., User]) -> None:
    user = make_user()
    post_json(client, LOGIN, {"email": user.email, "password": PASSWORD})
    assert "no-cache" in client.get("/api/v1/me")["Cache-Control"]


def test_passwords_are_hashed_with_argon2id_in_production_configuration() -> None:
    from config.settings import base

    assert base.PASSWORD_HASHERS[0] == "django.contrib.auth.hashers.Argon2PasswordHasher"
    assert make_password("a long enough password", hasher="argon2").startswith("argon2$argon2id$")
    validators = cast("list[dict[str, Any]]", base.AUTH_PASSWORD_VALIDATORS)
    assert any("MinimumLengthValidator" in v["NAME"] and v["OPTIONS"]["min_length"] == 10 for v in validators)


def test_session_and_csrf_cookie_settings() -> None:
    assert settings.SESSION_ENGINE.endswith("backends.db")  # no Redis in Release 1
    assert settings.SESSION_COOKIE_HTTPONLY is True and settings.SESSION_COOKIE_SAMESITE == "Lax"
    assert settings.CSRF_COOKIE_SAMESITE == "Lax" and settings.CSRF_COOKIE_HTTPONLY is False
