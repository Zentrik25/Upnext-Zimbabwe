"""Change of e-mail address (D-31): works only when delivery is verified (P5-07)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import tokens
from accounts.models import AuthToken, TokenPurpose, User
from audit.models import AuditEvent
from notifications import services as outbox_services
from notifications import verification
from notifications.models import EmailKind, EmailOutbox
from tests.conftest import PASSWORD, csrf, post_json

SMTP = dict(  # noqa: C408
    UPNEXT_EMAIL_BACKEND="smtp",
    UPNEXT_SMTP_HOST="smtp.example.invalid",
    UPNEXT_SMTP_PORT=587,
    UPNEXT_SMTP_SECURITY="starttls",
    UPNEXT_EMAIL_FROM="UPNEXT <accounts@mail.upnext.example>",
    UPNEXT_EMAIL_REPLY_TO="",
)


@pytest.fixture
def smtp(settings: Any) -> Any:
    for key, value in SMTP.items():
        setattr(settings, key, value)
    return settings


@pytest.fixture
def verified(db: None, smtp: Any) -> None:
    verification.EmailDeliveryVerification.objects.create(
        provider="test-provider",
        config_hash=verification.config_hash(),
        mailboxes=["gmail", "outlook", "local-isp"],
        spf_ok=True,
        dkim_ok=True,
        dmarc_ok=True,
        operator="Test Operator",
    )


def signed_in(make_user: Any, client: APIClient, **kwargs: Any) -> User:
    user: User = make_user(**kwargs)
    assert (
        post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}).status_code
        == 200
    )
    return user


def request_change(client: APIClient, new_email: str, password: str = PASSWORD) -> Any:
    return post_json(client, "/api/v1/me/email-change", {"new_email": new_email, "password": password})


def test_unavailable_until_delivery_is_verified(client: APIClient, make_user: Any, smtp: Any) -> None:
    user = signed_in(make_user, client)
    assert client.get("/api/v1/me").json()["email_change_available"] is False
    response = request_change(client, "new@example.org")
    assert response.status_code == 503 and response.json()["error"]["code"] == "email_unavailable"
    assert not EmailOutbox.objects.filter(kind=EmailKind.EMAIL_CHANGE_CONFIRM).exists()
    assert User.objects.get(pk=user.pk).email == user.email


def test_the_file_backend_alone_never_counts_as_verified(
    client: APIClient, make_user: Any, settings: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings.UPNEXT_EMAIL_BACKEND = "file"
    monkeypatch.delenv("UPNEXT_DEMO_TOOLS", raising=False)
    assert verification.delivery_verified() is False
    monkeypatch.setenv("UPNEXT_DEMO_TOOLS", "1")  # throwaway stacks only; production refuses this at start-up
    assert verification.delivery_verified() is True


def test_a_record_for_another_configuration_or_an_old_one_does_not_count(
    verified: None, settings: Any
) -> None:
    assert verification.delivery_verified() is True
    settings.UPNEXT_SMTP_HOST = "smtp.other.invalid"  # a different provider: the old proof is void
    assert verification.delivery_verified() is False
    settings.UPNEXT_SMTP_HOST = SMTP["UPNEXT_SMTP_HOST"]
    verification.EmailDeliveryVerification.objects.update(verified_at=timezone.now() - timedelta(days=400))
    assert verification.delivery_verified() is False


def test_the_whole_flow(client: APIClient, make_user: Any, verified: None) -> None:
    user = signed_in(make_user, client)
    old = user.email
    assert client.get("/api/v1/me").json()["email_change_available"] is True
    assert request_change(client, "New.Address@Example.org").status_code == 202
    confirm = EmailOutbox.objects.get(kind=EmailKind.EMAIL_CHANGE_CONFIRM)
    notice = EmailOutbox.objects.get(kind=EmailKind.EMAIL_CHANGE_REQUESTED_NOTICE)
    assert confirm.to_address.lower() == "new.address@example.org" and notice.to_address == old
    assert User.objects.get(pk=user.pk).email == old, "nothing changes before the new address confirms"
    link = outbox_services.build_message(confirm).body  # type: ignore[union-attr]
    token = link.split("token=")[1].split()[0].split("&")[0]
    assert "&change=1" in link
    anonymous = APIClient(enforce_csrf_checks=True)
    assert post_json(anonymous, "/api/v1/auth/email/verify", {"token": token}).status_code == 204
    user.refresh_from_db()
    assert user.email.lower() == "new.address@example.org" and user.email_verified_at is not None
    assert EmailOutbox.objects.filter(kind=EmailKind.EMAIL_CHANGED_NOTICE, to_address=old).exists()
    assert AuditEvent.objects.filter(action="account.email_changed", object_id=user.pk).exists()
    assert client.get("/api/v1/me").status_code == 200, "the current session is kept"
    again = post_json(APIClient(enforce_csrf_checks=True), "/api/v1/auth/email/verify", {"token": token})
    assert again.status_code == 400 and again.json()["error"]["code"] == "invalid_token", "single use"
    fresh = APIClient(enforce_csrf_checks=True)
    assert post_json(fresh, "/api/v1/auth/login", {"email": old, "password": PASSWORD}).status_code == 401
    assert (
        post_json(
            fresh, "/api/v1/auth/login", {"email": "new.address@example.org", "password": PASSWORD}
        ).status_code
        == 200
    )


def test_the_password_is_required(client: APIClient, make_user: Any, verified: None) -> None:
    signed_in(make_user, client)
    assert request_change(client, "x@example.org", password="not the password at all").status_code == 403
    assert not EmailOutbox.objects.filter(kind=EmailKind.EMAIL_CHANGE_CONFIRM).exists()


def test_an_address_in_use_gets_the_same_answer_and_the_owner_is_told(
    client: APIClient, make_user: Any, verified: None
) -> None:
    other = make_user(email="taken@example.org")
    signed_in(make_user, client)
    assert request_change(client, "taken@example.org").status_code == 202
    assert not EmailOutbox.objects.filter(kind=EmailKind.EMAIL_CHANGE_CONFIRM).exists()
    assert EmailOutbox.objects.filter(kind=EmailKind.ACCOUNT_EXISTS, to_address=other.email).exists()
    assert EmailOutbox.objects.filter(kind=EmailKind.EMAIL_CHANGE_REQUESTED_NOTICE).exists(), (
        "same side effects shape"
    )


@pytest.mark.parametrize("bad", ["not-an-address", "a@b", ""])
def test_bad_addresses_are_refused(client: APIClient, make_user: Any, verified: None, bad: str) -> None:
    signed_in(make_user, client)
    assert request_change(client, bad).status_code == 400


def test_the_current_address_is_refused(client: APIClient, make_user: Any, verified: None) -> None:
    user = signed_in(make_user, client)
    assert request_change(client, user.email.upper()).status_code == 400


def test_staff_accounts_are_sent_to_an_administrator(
    client: APIClient, make_user: Any, verified: None
) -> None:
    signed_in(make_user, client, roles=("contributor",))
    assert client.get("/api/v1/me").json()["email_change_available"] is False
    response = request_change(client, "staff-new@example.org")
    assert response.status_code == 409 and response.json()["error"]["code"] == "staff_account"


def test_anonymous_requests_are_refused(client: APIClient, verified: None) -> None:
    assert post_json(
        client, "/api/v1/me/email-change", {"new_email": "a@example.org", "password": PASSWORD}
    ).status_code in (401, 403)


def test_an_address_taken_in_the_meantime_fails_like_a_bad_link(
    client: APIClient, make_user: Any, verified: None
) -> None:
    user = signed_in(make_user, client)
    assert request_change(client, "race@example.org").status_code == 202
    token = tokens.render(AuthToken.objects.get(user=user, purpose=TokenPurpose.EMAIL_CHANGE))
    make_user(email="race@example.org")
    anonymous = APIClient(enforce_csrf_checks=True)
    assert post_json(anonymous, "/api/v1/auth/email/verify", {"token": token}).status_code == 400
    assert User.objects.get(pk=user.pk).email == user.email


def test_an_expired_or_replaced_link_does_not_work(client: APIClient, make_user: Any, verified: None) -> None:
    user = signed_in(make_user, client)
    request_change(client, "first@example.org")
    first = tokens.render(AuthToken.objects.get(user=user, purpose=TokenPurpose.EMAIL_CHANGE))
    client.cookies.clear()
    csrf(client)
    signed = APIClient(enforce_csrf_checks=True)
    post_json(signed, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD})
    request_change(signed, "second@example.org")  # a newer request replaces the earlier link
    assert (
        post_json(
            APIClient(enforce_csrf_checks=True), "/api/v1/auth/email/verify", {"token": first}
        ).status_code
        == 400
    )
    current = AuthToken.objects.get(user=user, purpose=TokenPurpose.EMAIL_CHANGE, invalidated_at__isnull=True)
    AuthToken.objects.filter(pk=current.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
    expired = tokens.render(AuthToken.objects.get(pk=current.pk))
    assert (
        post_json(
            APIClient(enforce_csrf_checks=True), "/api/v1/auth/email/verify", {"token": expired}
        ).status_code
        == 400
    )


def test_no_address_appears_in_the_audit_record(client: APIClient, make_user: Any, verified: None) -> None:
    user = signed_in(make_user, client)
    request_change(client, "private-new@example.org")
    for event in AuditEvent.objects.filter(action="account.email_change_requested"):
        assert "private-new" not in str(event.changes) and user.email not in str(event.changes)


# --- recording a verification -----------------------------------------------------------------------------------


def record(**overrides: Any) -> None:
    args = dict(  # noqa: C408
        provider="a-provider",
        operator="Op",
        mailboxes="gmail,outlook,local-isp",
        spf=True,
        dkim=True,
        dmarc=True,
    )
    args.update(overrides)
    call_command("record_email_verification", **args)


def test_recording_needs_a_real_sender_and_complete_checks(db: None, settings: Any, smtp: Any) -> None:
    record()
    assert verification.delivery_verified() is True
    for bad in (
        {"mailboxes": "gmail,outlook"},
        {"mailboxes": "gmail,outlook,carrier-pigeon"},
        {"spf": False},
        {"dkim": False},
        {"dmarc": False},
    ):
        with pytest.raises(CommandError):
            record(**bad)


def test_recording_refuses_when_no_provider_is_configured(db: None, settings: Any) -> None:
    settings.UPNEXT_EMAIL_BACKEND = "none"
    with pytest.raises(CommandError, match="smtp"):
        record()
    settings.UPNEXT_EMAIL_BACKEND = "smtp"
    settings.UPNEXT_SMTP_HOST = ""
    with pytest.raises(CommandError, match="not valid"):
        record()
