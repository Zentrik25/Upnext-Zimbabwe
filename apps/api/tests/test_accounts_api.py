"""Registration, verification, reset, password change, sessions and deletion (SECURITY_ARCHITECTURE §3)."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import tokens
from accounts.models import AccountStatus, AuthToken, TokenPurpose, User, UserSession
from audit.models import AuditEvent
from notifications import services as outbox
from notifications.models import EmailKind, EmailOutbox, OutboxStatus

from .conftest import PASSWORD, csrf, post_json

pytestmark = pytest.mark.django_db
NEW_PASSWORD = "a completely different passphrase 77"


def register(client: APIClient, email: str = "new@example.org", **extra: Any) -> Any:
    body = {"email": email, "password": PASSWORD, "display_name": "Nia Moyo", **extra}
    return post_json(client, "/api/v1/auth/register", body)


def link_token(kind: str, to: str) -> str:
    """The token a user would receive: render the queued e-mail and pull the token out of the link."""
    row = EmailOutbox.objects.filter(kind=kind, to_address=to).order_by("-created_at").first()
    assert row is not None, f"no {kind} e-mail queued for {to}"
    message = outbox.build_message(row)
    assert message is not None
    match = re.search(r"token=([A-Za-z0-9_.\-]+)", message.body)
    assert match, message.body
    return match.group(1)


def login(client: APIClient, email: str, password: str = PASSWORD) -> Any:
    return post_json(client, "/api/v1/auth/login", {"email": email, "password": password})


# --- registration --------------------------------------------------------------------------------------
def test_registration_is_accepted_and_queues_a_verification_email(client: APIClient) -> None:
    response = register(client)
    assert response.status_code == 202 and response.json() == {"status": "accepted"}
    user = User.objects.get(email="new@example.org")
    assert user.status == AccountStatus.PENDING_VERIFICATION and user.email_verified_at is None
    assert user.check_password(PASSWORD)
    row = EmailOutbox.objects.get(kind=EmailKind.EMAIL_VERIFICATION)
    assert row.to_address == "new@example.org" and row.status == OutboxStatus.PENDING
    assert "password" not in str(row.payload).lower()
    assert AuditEvent.objects.filter(action="account.register", object_id=user.pk).exists()


def test_registering_an_existing_address_looks_identical_and_creates_nothing(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    make_user(email="taken@example.org")
    before = User.objects.count()
    fresh = register(client, "brand-new@example.org")
    again = register(client, "taken@example.org")
    assert (fresh.status_code, fresh.json()) == (again.status_code, again.json())
    assert User.objects.count() == before + 1
    assert (
        EmailOutbox.objects.filter(kind=EmailKind.ACCOUNT_EXISTS, to_address="taken@example.org").count() == 1
    )
    assert not EmailOutbox.objects.filter(kind=EmailKind.EMAIL_VERIFICATION, to_address="taken@example.org")


@pytest.mark.parametrize(
    ("override", "field"),
    [
        ({"password": "short"}, "password"),
        ({"password": "password1234"}, "password"),  # common
        ({"password": "1234567890123"}, "password"),  # numeric only
        ({"password": "nia.moyo@example.org"}, "password"),  # similar to e-mail
        ({"display_name": "visit www.spam.example"}, "display_name"),
        ({"display_name": "me@spam.example"}, "display_name"),
        ({"display_name": "bad\u0007name"}, "display_name"),
        ({"email": '"quoted"@example.org'}, "email"),
        ({"email": "double..dot@example.org"}, "email"),
        ({"email": "not-an-email"}, "email"),
    ],
)
def test_registration_validates_each_field(client: APIClient, override: dict[str, str], field: str) -> None:
    email = override.get("email", "nia.moyo@example.org")
    response = register(client, email, **{k: v for k, v in override.items() if k != "email"})
    assert response.status_code == 400
    assert field in response.json()["error"]["fields"]
    assert not User.objects.filter(email__iexact=email).exists() or field == "email"


def test_registration_rejects_unknown_fields_and_requires_csrf(client: APIClient) -> None:
    response = register(client, role="administrator")
    assert response.status_code == 400 and "role" in response.json()["error"]["fields"]
    bare = client.post(
        "/api/v1/auth/register",
        {"email": "x@example.org", "password": PASSWORD, "display_name": "X"},
        format="json",
    )
    assert bare.status_code == 403 and bare.json()["error"]["code"] == "csrf_failed"


def test_password_is_nfkc_normalised_and_argon2_is_the_production_hasher(client: APIClient) -> None:
    from django.conf import settings

    assert settings.PASSWORD_HASHERS[-2].endswith("Argon2PasswordHasher")
    fullwidth = "".join(chr(ord(c) + 0xFEE0) for c in "fullwidth")  # full-width letters, NFKC-equivalent
    register(client, password=f"{fullwidth} passphrase 99")
    user = User.objects.get(email="new@example.org")
    assert user.check_password("fullwidth passphrase 99")


def test_registration_is_throttled_per_ip(client: APIClient) -> None:
    codes = [register(client, f"user{i}@example.org").status_code for i in range(6)]
    assert codes[:5] == [202] * 5 and codes[5] == 429


# --- verification --------------------------------------------------------------------------------------
def test_verification_activates_the_account_without_signing_in(client: APIClient) -> None:
    register(client)
    token = link_token(EmailKind.EMAIL_VERIFICATION, "new@example.org")
    assert login(client, "new@example.org").status_code == 403
    response = post_json(client, "/api/v1/auth/email/verify", {"token": token})
    assert response.status_code == 204 and "sessionid" not in str(response.cookies).lower()
    assert client.get("/api/v1/me").status_code == 401  # no automatic sign-in
    user = User.objects.get(email="new@example.org")
    assert user.status == AccountStatus.ACTIVE and user.email_verified_at is not None
    assert login(client, "new@example.org").status_code == 200
    assert post_json(client, "/api/v1/auth/email/verify", {"token": token}).status_code == 400  # single use


def test_unverified_login_is_refused_only_after_correct_credentials(client: APIClient) -> None:
    register(client)
    wrong = login(client, "new@example.org", "wrong wrong wrong wrong")
    right = login(client, "new@example.org")
    assert wrong.status_code == 401 and right.status_code == 403
    assert right.json()["error"]["code"] == "email_not_verified"


@pytest.mark.parametrize(
    "mutate", ["garbage", "tampered", "wrong_purpose", "expired", "other_user_mac", "empty"]
)
def test_bad_tokens_all_fail_the_same_way(client: APIClient, mutate: str) -> None:
    register(client)
    good = link_token(EmailKind.EMAIL_VERIFICATION, "new@example.org")
    selector, mac = good.split(".")
    value = {
        "garbage": "not.a.token",
        "tampered": f"{selector}.{mac[:-2]}AA",
        "wrong_purpose": good,
        "expired": good,
        "other_user_mac": f"{selector}.{'A' * len(mac)}",
        "empty": "",
    }[mutate]
    if mutate == "wrong_purpose":
        response = post_json(
            client, "/api/v1/auth/password-reset/confirm", {"token": value, "new_password": NEW_PASSWORD}
        )
    else:
        if mutate == "expired":
            AuthToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        response = post_json(client, "/api/v1/auth/email/verify", {"token": value})
    assert response.status_code == 400
    if mutate != "empty":
        assert response.json()["error"]["code"] == "invalid_token"
    assert User.objects.get(email="new@example.org").status == AccountStatus.PENDING_VERIFICATION


def test_rotating_the_token_key_invalidates_outstanding_tokens(client: APIClient, settings: Any) -> None:
    register(client)
    token = link_token(EmailKind.EMAIL_VERIFICATION, "new@example.org")
    settings.UPNEXT_TOKEN_KEY = "a-different-key-" * 4
    assert post_json(client, "/api/v1/auth/email/verify", {"token": token}).status_code == 400


def test_resend_is_uniform_replaces_the_old_token_and_is_throttled(
    client: APIClient, make_user: Callable[..., User], settings: Any
) -> None:
    register(client)
    first = link_token(EmailKind.EMAIL_VERIFICATION, "new@example.org")
    make_user(email="active@example.org")
    answers = []
    for email in ("new@example.org", "active@example.org", "nobody@example.org"):
        cache.clear()
        response = post_json(client, "/api/v1/auth/email/resend", {"email": email})
        answers.append((response.status_code, response.json()))
    assert len(set(map(str, answers))) == 1 and answers[0][0] == 202
    assert EmailOutbox.objects.filter(kind=EmailKind.EMAIL_VERIFICATION).count() == 2  # new + resend
    assert not EmailOutbox.objects.filter(to_address__in=["active@example.org", "nobody@example.org"])
    assert post_json(client, "/api/v1/auth/email/verify", {"token": first}).status_code == 400  # replaced
    second = link_token(EmailKind.EMAIL_VERIFICATION, "new@example.org")
    assert post_json(client, "/api/v1/auth/email/verify", {"token": second}).status_code == 204
    cache.clear()
    assert post_json(client, "/api/v1/auth/email/resend", {"email": "new@example.org"}).status_code == 202
    again = post_json(client, "/api/v1/auth/email/resend", {"email": "new@example.org"})
    assert again.status_code == 429 and again["Retry-After"]  # 60 s gap per address


def test_resend_is_limited_to_three_per_hour_per_address(client: APIClient, settings: Any) -> None:
    settings.UPNEXT_EMAIL_REQUEST_GAP_SECONDS = 1
    seen = []
    for _ in range(5):
        # remove only the gap key so the hourly counter is what limits
        from api.throttles import hash_key

        cache.delete(f"email-gap:{hash_key('limit@example.org')}")
        seen.append(
            post_json(client, "/api/v1/auth/email/resend", {"email": "limit@example.org"}).status_code
        )
    assert seen == [202, 202, 202, 429, 429]


# --- password reset ------------------------------------------------------------------------------------
def test_reset_request_is_uniform_and_only_queues_mail_for_active_accounts(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    make_user(email="active@example.org")
    make_user(email="pending@example.org", status=AccountStatus.PENDING_VERIFICATION)
    bodies = []
    for email in ("active@example.org", "pending@example.org", "ghost@example.org"):
        cache.clear()
        response = post_json(client, "/api/v1/auth/password-reset/request", {"email": email})
        bodies.append((response.status_code, response.json()))
    assert len(set(map(str, bodies))) == 1 and bodies[0][0] == 202
    assert list(EmailOutbox.objects.values_list("to_address", flat=True)) == ["active@example.org"]


def test_reset_confirm_sets_the_password_revokes_every_session_and_notifies(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user(email="active@example.org")
    other = APIClient(enforce_csrf_checks=True)
    login(client, user.email)
    login(other, user.email)
    assert Session.objects.count() == 2
    post_json(client, "/api/v1/auth/password-reset/request", {"email": user.email})
    token = link_token(EmailKind.PASSWORD_RESET, user.email)
    weak = post_json(client, "/api/v1/auth/password-reset/confirm", {"token": token, "new_password": "short"})
    assert weak.status_code == 400
    done = post_json(
        client, "/api/v1/auth/password-reset/confirm", {"token": token, "new_password": NEW_PASSWORD}
    )
    assert done.status_code == 204
    assert client.get("/api/v1/me").status_code == 401 and other.get("/api/v1/me").status_code == 401
    assert Session.objects.count() == 0 and not UserSession.objects.filter(revoked_at__isnull=True)
    fresh = APIClient(enforce_csrf_checks=True)
    assert login(fresh, user.email, PASSWORD).status_code == 401
    assert login(fresh, user.email, NEW_PASSWORD).status_code == 200
    assert EmailOutbox.objects.filter(kind=EmailKind.PASSWORD_CHANGED_NOTICE).count() == 1
    again = post_json(
        client, "/api/v1/auth/password-reset/confirm", {"token": token, "new_password": NEW_PASSWORD}
    )
    assert again.status_code == 400  # single use
    assert AuditEvent.objects.filter(action="account.password_reset", object_id=user.pk).exists()


def test_a_newer_reset_request_invalidates_the_older_link(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    post_json(client, "/api/v1/auth/password-reset/request", {"email": user.email})
    old = link_token(EmailKind.PASSWORD_RESET, user.email)
    cache.clear()
    post_json(client, "/api/v1/auth/password-reset/request", {"email": user.email})
    assert (
        post_json(
            client, "/api/v1/auth/password-reset/confirm", {"token": old, "new_password": NEW_PASSWORD}
        ).status_code
        == 400
    )
    new = link_token(EmailKind.PASSWORD_RESET, user.email)
    assert (
        post_json(
            client, "/api/v1/auth/password-reset/confirm", {"token": new, "new_password": NEW_PASSWORD}
        ).status_code
        == 204
    )


def test_reset_token_lifetime_is_sixty_minutes() -> None:
    assert tokens.TTL[TokenPurpose.PASSWORD_RESET] == timedelta(minutes=60)


# --- change password and sessions ----------------------------------------------------------------------
def test_change_password_requires_the_current_password_and_keeps_only_this_session(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    other = APIClient(enforce_csrf_checks=True)
    login(client, user.email)
    login(other, user.email)
    url = "/api/v1/auth/password/change"
    wrong = post_json(client, url, {"current_password": "nope nope nope nope", "new_password": NEW_PASSWORD})
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "reauth_required"
    weak = post_json(client, url, {"current_password": PASSWORD, "new_password": "short"})
    assert weak.status_code == 400
    ok = post_json(client, url, {"current_password": PASSWORD, "new_password": NEW_PASSWORD})
    assert ok.status_code == 204
    assert client.get("/api/v1/me").status_code == 200 and other.get("/api/v1/me").status_code == 401
    assert EmailOutbox.objects.filter(kind=EmailKind.PASSWORD_CHANGED_NOTICE, user=user).exists()


def test_failed_reauthentication_is_counted_against_the_login_limiter(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    login(client, user.email)
    url = "/api/v1/auth/password/change"
    codes = [
        post_json(
            client, url, {"current_password": f"wrong wrong {i} wrong", "new_password": NEW_PASSWORD}
        ).status_code
        for i in range(6)
    ]
    assert codes[:5] == [403] * 5 and codes[5] == 429


def test_sessions_are_listed_and_can_be_revoked_individually(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    stranger = make_user()
    other = APIClient(enforce_csrf_checks=True)
    theirs = APIClient(enforce_csrf_checks=True)
    login(client, user.email)
    other.defaults["HTTP_USER_AGENT"] = "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36"
    login(other, user.email)
    login(theirs, stranger.email)
    listed = client.get("/api/v1/me/sessions").json()["data"]
    assert len(listed) == 2 and sum(s["current"] for s in listed) == 1
    assert {s["user_agent_summary"] for s in listed} >= {"Chrome on Windows"}
    assert "session_key" not in str(listed) and "ip" not in "".join(listed[0])
    target = next(s for s in listed if not s["current"])
    their_id = theirs.get("/api/v1/me/sessions").json()["data"][0]["id"]
    assert post_json(client, "/api/v1/me/sessions", {}).status_code == 405
    token = csrf(client)
    cross = client.delete(f"/api/v1/me/sessions/{their_id}", HTTP_X_CSRFTOKEN=token)
    assert cross.status_code == 404 and theirs.get("/api/v1/me").status_code == 200  # not revocable by others
    gone = client.delete(f"/api/v1/me/sessions/{target['id']}", HTTP_X_CSRFTOKEN=token)
    assert gone.status_code == 204 and other.get("/api/v1/me").status_code == 401
    assert client.delete(f"/api/v1/me/sessions/{target['id']}", HTTP_X_CSRFTOKEN=token).status_code == 404
    assert len(client.get("/api/v1/me/sessions").json()["data"]) == 1


def test_logout_closes_the_session_record(client: APIClient, make_user: Callable[..., User]) -> None:
    user = make_user()
    login(client, user.email)
    assert post_json(client, "/api/v1/auth/logout").status_code == 204
    assert not UserSession.objects.filter(user=user, revoked_at__isnull=True)


def test_login_and_failures_are_audited_without_the_address_or_ip(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    login(client, user.email, "wrong wrong wrong wrong")
    login(client, user.email)
    events = {e.action: e for e in AuditEvent.objects.filter(action__in=["auth.login", "auth.login_failed"])}
    assert set(events) == {"auth.login", "auth.login_failed"}
    flat = str([e.changes for e in events.values()])
    assert user.email not in flat and "127.0.0.1" not in flat and "ip_hash" in flat


def test_display_name_can_be_changed_and_is_validated(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    login(client, user.email)
    token = csrf(client)
    ok = client.patch("/api/v1/me", {"display_name": "Tendai"}, format="json", HTTP_X_CSRFTOKEN=token)
    assert ok.status_code == 200 and ok.json()["display_name"] == "Tendai"
    for bad in ({"display_name": "see http://x.example"}, {"display_name": ""}, {"role": "editor"}):
        r = client.patch("/api/v1/me", bad, format="json", HTTP_X_CSRFTOKEN=token)
        assert r.status_code == 400
    user.refresh_from_db()
    assert user.display_name == "Tendai" and user.active_roles() == frozenset()


# --- deletion request ----------------------------------------------------------------------------------
def test_deletion_request_needs_the_password_is_idempotent_and_can_be_cancelled(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    login(client, user.email)
    token = csrf(client)
    url = "/api/v1/me/deletion-request"
    wrong = client.post(url, {"password": "wrong wrong wrong"}, format="json", HTTP_X_CSRFTOKEN=token)
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "reauth_required"
    first = client.post(url, {"password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    second = client.post(url, {"password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json() and first.json()["scheduled_for"] is None
    assert EmailOutbox.objects.filter(kind=EmailKind.ACCOUNT_DELETION_NOTICE).count() == 1
    user.refresh_from_db()
    assert user.deletion_requested_at is not None and user.status == AccountStatus.ACTIVE
    assert client.delete(url, HTTP_X_CSRFTOKEN=token).status_code == 204
    assert client.delete(url, HTTP_X_CSRFTOKEN=token).status_code == 409


def test_account_endpoints_require_a_session(client: APIClient) -> None:
    token = csrf(client)
    for method, url in [
        ("get", "/api/v1/me"),
        ("get", "/api/v1/me/sessions"),
        ("get", "/api/v1/me/saved"),
        ("post", "/api/v1/me/deletion-request"),
        ("post", "/api/v1/auth/password/change"),
    ]:
        response = getattr(client, method)(url, HTTP_X_CSRFTOKEN=token)
        assert response.status_code == 401, url
