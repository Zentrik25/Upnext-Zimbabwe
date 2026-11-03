"""Account deletion lifecycle and retention (provisional defaults P4-05 and P4-06)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import deletion, retention, services, tokens
from accounts.models import AccountStatus, AuthToken, StaffMfaDevice, TokenPurpose, User, UserSession
from audit.models import AuditEvent
from notifications import services as outbox
from notifications.models import EmailKind, EmailOutbox, OutboxStatus
from opportunities.models import SavedOpportunity
from tests.factories import World, published, varied

from .conftest import PASSWORD, csrf, post_json

pytestmark = pytest.mark.django_db
URL = "/api/v1/me/deletion-request"
DAYS = 14


def requested(user: User) -> Any:
    assert user.deletion_requested_at is not None
    return user.deletion_requested_at


def signed_in(make_user: Callable[..., User], **kwargs: Any) -> tuple[APIClient, User]:
    user = make_user(**kwargs)
    client = APIClient(enforce_csrf_checks=True)
    assert (
        post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}).status_code
        == 200
    )
    return client, user


def request_deletion(client: APIClient) -> Any:
    return client.post(URL, {"password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=csrf(client))


def test_request_starts_a_cooling_off_period_and_deletes_nothing(make_user: Callable[..., User]) -> None:
    client, user = signed_in(make_user, email="leaving@example.org", display_name="Leaving Person")
    response = request_deletion(client)
    body = response.json()
    assert response.status_code == 202 and body["scheduled_for"]
    user.refresh_from_db()
    assert body["scheduled_for"][:10] == (requested(user) + timedelta(days=DAYS)).date().isoformat()
    assert user.status == AccountStatus.ACTIVE and user.email == "leaving@example.org"
    me = client.get("/api/v1/me").json()
    assert me["deletion_scheduled_for"] == body["scheduled_for"]
    notice = EmailOutbox.objects.get(kind=EmailKind.ACCOUNT_DELETION_NOTICE)
    message = outbox.build_message(notice)
    assert (
        message is not None and "Nothing has been deleted yet" in message.body and "14 days" in message.body
    )
    assert request_deletion(client).json() == body  # repeating changes nothing
    assert EmailOutbox.objects.filter(kind=EmailKind.ACCOUNT_DELETION_NOTICE).count() == 1


def test_nothing_happens_before_the_period_ends_and_cancelling_stops_it(
    make_user: Callable[..., User],
) -> None:
    client, user = signed_in(make_user)
    request_deletion(client)
    user.refresh_from_db()
    before = requested(user) + timedelta(days=DAYS) - timedelta(minutes=1)
    assert deletion.execute_due(before) == 0
    assert client.delete(URL, HTTP_X_CSRFTOKEN=csrf(client)).status_code == 204
    after = requested(user) + timedelta(days=DAYS, hours=1)
    assert deletion.execute_due(after) == 0
    user.refresh_from_db()
    assert user.deletion_requested_at is None and user.status == AccountStatus.ACTIVE
    request_deletion(client)  # a new request starts a new period
    assert User.objects.get(pk=user.pk).deletion_requested_at is not None


def test_execution_removes_personal_data_everywhere(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    client, user = signed_in(make_user, email="Gone.Person@example.org", display_name="Gone Person")
    other, other_user = signed_in(make_user, email="stays@example.org", display_name="Stays Here")
    job = published(
        world, people["author"], people["editor"], example="jobs-1", **varied(world, "jobs-1", "del")
    )
    for who in (client, other):
        who.put(f"/api/v1/me/saved/{job.pk}", HTTP_X_CSRFTOKEN=csrf(who))
    tokens.issue(user, TokenPurpose.PASSWORD_RESET)
    outbox.enqueue(
        EmailKind.PASSWORD_CHANGED_NOTICE, user, user.email, context={"display_name": user.display_name}
    )
    sent = outbox.enqueue(
        EmailKind.PASSWORD_CHANGED_NOTICE, user, user.email, context={"display_name": "Gone"}
    )
    EmailOutbox.objects.filter(pk=sent.pk).update(status=OutboxStatus.SENT, sent_at=timezone.now())
    request_deletion(client)
    user.refresh_from_db()
    when = requested(user) + timedelta(days=DAYS, seconds=1)

    assert deletion.execute_due(when) == 1

    user.refresh_from_db()
    assert user.status == AccountStatus.DEACTIVATED and user.deleted_at is not None
    assert user.email == f"deleted-{user.pk}@deleted.invalid" and user.display_name == "Deleted account"
    assert not user.has_usable_password()
    assert not SavedOpportunity.objects.filter(user=user).exists()
    assert (
        not UserSession.objects.filter(user=user).exists()
        and not AuthToken.objects.filter(user=user).exists()
    )
    assert client.get("/api/v1/me").status_code == 401  # the session is gone
    assert (
        post_json(
            APIClient(enforce_csrf_checks=True),
            "/api/v1/auth/login",
            {"email": "gone.person@example.org", "password": PASSWORD},
        ).status_code
        == 401
    )
    # nothing that identifies the person is left in the account, outbox, audit or session tables
    original = ("gone.person@example.org", "gone person")
    mine = list(
        EmailOutbox.objects.exclude(kind=EmailKind.ACCOUNT_DELETION_COMPLETED).values_list(
            "to_address", "payload", "last_error"
        )
    )
    dump = (
        str(mine)
        + str(list(AuditEvent.objects.values_list("changes", flat=True)))
        + str(list(User.objects.filter(pk=user.pk).values()))
    ).lower()
    assert not any(token in dump for token in original)
    # the completion notice is the only message that still carries the address (it is removed like any sent mail)
    completed = EmailOutbox.objects.get(kind=EmailKind.ACCOUNT_DELETION_COMPLETED)
    assert completed.to_address == "Gone.Person@example.org" and completed.user is None
    event = AuditEvent.objects.get(action="account.deletion_executed")
    assert event.actor_type == "system" and event.object_id == user.pk and event.severity == "security"
    # other people and the listing are untouched
    other_user.refresh_from_db()
    assert (
        other_user.status == AccountStatus.ACTIVE
        and SavedOpportunity.objects.filter(user=other_user).exists()
    )
    job.refresh_from_db()
    assert job.status == "published"
    assert other.get("/api/v1/me").status_code == 200


def test_execution_is_idempotent_and_safe_to_run_twice(make_user: Callable[..., User]) -> None:
    client, user = signed_in(make_user)
    request_deletion(client)
    user.refresh_from_db()
    when = requested(user) + timedelta(days=DAYS, seconds=1)
    assert deletion.execute(user.pk, when) is True
    assert deletion.execute(user.pk, when) is False
    assert deletion.execute_due(when) == 0
    assert EmailOutbox.objects.filter(kind=EmailKind.ACCOUNT_DELETION_COMPLETED).count() == 1
    assert AuditEvent.objects.filter(action="account.deletion_executed").count() == 1


def test_the_address_can_register_again_after_deletion(make_user: Callable[..., User]) -> None:
    client, user = signed_in(make_user, email="again@example.org")
    request_deletion(client)
    user.refresh_from_db()
    deletion.execute(user.pk, requested(user) + timedelta(days=DAYS, seconds=1))
    services.register(
        email="again@example.org",
        password=PASSWORD,
        display_name="New Start",
        phone_number="+263781234567",
        accept_terms=True,
    )
    fresh = User.objects.get(email="again@example.org")
    assert fresh.pk != user.pk and fresh.status == AccountStatus.PENDING_VERIFICATION


def test_queued_mail_for_the_person_is_cancelled(make_user: Callable[..., User]) -> None:
    client, user = signed_in(make_user)
    queued = outbox.enqueue(
        EmailKind.PASSWORD_CHANGED_NOTICE, user, user.email, context={"display_name": "x"}
    )
    request_deletion(client)
    user.refresh_from_db()
    deletion.execute(user.pk, requested(user) + timedelta(days=DAYS, seconds=1))
    queued.refresh_from_db()
    assert queued.status == OutboxStatus.DEAD and queued.to_address != user.email and queued.payload == {}


def test_staff_accounts_must_be_offboarded_first(make_user: Callable[..., User]) -> None:
    client, staff = signed_in(make_user, roles=("editor",))
    refused = request_deletion(client)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "staff_account"
    staff.refresh_from_db()
    assert staff.deletion_requested_at is None
    from accounts.models import StaffRoleAssignment

    StaffRoleAssignment.objects.filter(user=staff).update(revoked_at=timezone.now(), revoked_by=staff)
    staff.refresh_from_db()
    staff.refresh_roles()
    assert request_deletion(client).status_code == 202


def test_roles_granted_after_the_request_stop_the_execution(make_user: Callable[..., User]) -> None:
    from accounts.models import StaffRoleAssignment

    client, user = signed_in(make_user)
    request_deletion(client)
    StaffRoleAssignment.objects.create(user=user, role="contributor", reason="granted during cooling-off")
    user.refresh_from_db()
    assert deletion.execute(user.pk, requested(user) + timedelta(days=DAYS, seconds=1)) is False
    assert User.objects.get(pk=user.pk).status == AccountStatus.ACTIVE


def test_staff_second_step_devices_are_removed_too(make_user: Callable[..., User]) -> None:
    user = make_user()
    StaffMfaDevice.objects.create(user=user, nonce="n", confirmed_at=timezone.now())
    User.objects.filter(pk=user.pk).update(
        deletion_requested_at=timezone.now() - timedelta(days=DAYS, hours=1)
    )
    assert deletion.execute_due() == 1
    assert not StaffMfaDevice.objects.exists()


def test_a_failing_account_does_not_stop_the_others(
    make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
) -> None:
    first, second = make_user(), make_user()
    User.objects.filter(pk__in=[first.pk, second.pk]).update(
        deletion_requested_at=timezone.now() - timedelta(days=DAYS, hours=1)
    )
    real = deletion.execute

    def flaky(user_id: Any, now: Any = None) -> bool:
        if user_id == first.pk:
            raise RuntimeError("boom")
        return real(user_id, now)

    monkeypatch.setattr(deletion, "execute", flaky)
    assert deletion.execute_due() == 1
    assert (
        User.objects.get(pk=second.pk).deleted_at is not None
        and User.objects.get(pk=first.pk).deleted_at is None
    )


def test_the_worker_runs_deletions_and_retention_in_one_cycle(make_user: Callable[..., User]) -> None:
    user = make_user()
    User.objects.filter(pk=user.pk).update(
        deletion_requested_at=timezone.now() - timedelta(days=DAYS, hours=1)
    )
    call_command("run_worker", "--once")
    assert User.objects.get(pk=user.pk).deleted_at is not None
    assert EmailOutbox.objects.filter(
        kind=EmailKind.ACCOUNT_DELETION_COMPLETED, status=OutboxStatus.SENT
    ).exists()


# --- retention -----------------------------------------------------------------------------------------
def test_retention_removes_old_tokens_sessions_records_and_addresses(make_user: Callable[..., User]) -> None:
    user = make_user()
    now = timezone.now()
    old, fresh = (
        tokens.issue(user, TokenPurpose.PASSWORD_RESET),
        tokens.issue(user, TokenPurpose.EMAIL_VERIFICATION),
    )
    AuthToken.objects.filter(pk=old.pk).update(used_at=now - timedelta(days=8))
    AuthToken.objects.filter(pk=fresh.pk).update(used_at=now - timedelta(days=2))
    client, _ = signed_in(make_user)
    Session.objects.update(expire_date=now - timedelta(days=1))
    UserSession.objects.update(revoked_at=now - timedelta(days=31))
    old_sent = outbox.enqueue(
        EmailKind.PASSWORD_CHANGED_NOTICE, user, "someone@example.org", context={"x": 1}
    )
    new_sent = outbox.enqueue(EmailKind.PASSWORD_CHANGED_NOTICE, user, "recent@example.org", context={})
    EmailOutbox.objects.filter(pk=old_sent.pk).update(
        status=OutboxStatus.SENT, sent_at=now - timedelta(days=31)
    )
    EmailOutbox.objects.filter(pk=new_sent.pk).update(
        status=OutboxStatus.SENT, sent_at=now - timedelta(days=5)
    )
    dead = outbox.enqueue(EmailKind.PASSWORD_CHANGED_NOTICE, user, "dead@example.org", context={})
    EmailOutbox.objects.filter(pk=dead.pk).update(
        status=OutboxStatus.DEAD, created_at=now - timedelta(days=91)
    )

    counts = retention.run(now)

    assert counts["tokens"] == 1 and AuthToken.objects.filter(pk=fresh.pk).exists()
    assert Session.objects.count() == 0 and UserSession.objects.count() == 0
    assert EmailOutbox.objects.get(pk=old_sent.pk).to_address == retention.SCRUBBED_ADDRESS
    assert EmailOutbox.objects.get(pk=new_sent.pk).to_address == "recent@example.org"
    assert EmailOutbox.objects.get(pk=dead.pk).to_address == retention.SCRUBBED_ADDRESS
    assert retention.run(now)["outbox_sent"] == 0  # repeating changes nothing
    assert client is not None


def test_retention_keeps_audit_events() -> None:
    from audit import services as audit

    audit.record(action="auth.login", object_type="user", object_id=None, actor_id=None)
    retention.run(timezone.now() + timedelta(days=3650))
    assert AuditEvent.objects.filter(action="auth.login").exists()


def test_no_table_outside_the_known_set_holds_the_account_address(make_user: Callable[..., User]) -> None:
    """If a new table starts storing addresses it must be considered by the deletion process: this lists the
    columns that hold an e-mail address today."""
    columns = set()
    with connection.cursor() as cursor:
        cursor.execute(
            "select table_name, column_name from information_schema.columns "
            "where table_schema='public' and (column_name ilike '%email%' or column_name ilike '%address%')"
        )
        columns = {(t, c) for t, c in cursor.fetchall()}
    known = {
        ("accounts_user", "email"),
        ("accounts_user", "email_verified_at"),
        ("accounts_authtoken", "new_email"),  # rows are deleted with the account
        ("notifications_emailoutbox", "to_address"),
        ("notifications_emailsuppression", "address_hash"),  # a keyed hash, not an address
        ("reports_listingreport", "contact_email"),  # optional; cleared after closing and on deletion
        ("catalog_organisation", "website_url"),
        ("opportunities_opportunityversion", "application_email"),
        ("opportunities_opportunityversion", "location_text"),
        ("opportunities_opportunityversion", "geographic_eligibility"),
    }
    assert columns <= known | {c for c in columns if c[0].startswith(("catalog_", "opportunities_"))}, (
        columns - known
    )


def test_retention_deletes_listing_counters_after_the_provisional_twelve_months(
    world: World, people: dict[str, User]
) -> None:
    from employers.models import ListingDailyStat

    opportunity = published(world, people["author"], people["editor"])
    today = timezone.now().date()
    ListingDailyStat.objects.create(opportunity=opportunity, day=today - timedelta(days=366), views=4)
    ListingDailyStat.objects.create(opportunity=opportunity, day=today - timedelta(days=364), views=2)
    counts = retention.run()
    assert counts["listing_stats"] == 1
    assert list(ListingDailyStat.objects.values_list("views", flat=True)) == [2]
