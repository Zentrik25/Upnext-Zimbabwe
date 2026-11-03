"""Employer notifications (M2): who is told, when, once, and never at the cost of an editorial decision.

Real e-mail stays off: every test that expects rows turns the verified-delivery gate on explicitly; the default
state (gate closed) is pinned by its own tests."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.core.management import call_command
from django.db import connection
from django.utils import timezone

from accounts.models import AccountStatus, User
from core import alerts
from core.models import JobRun
from employers import listings, notifications, reminders, services
from employers.models import EmployerMembership, MemberRole
from notifications import services as outbox
from notifications import suppression, verification
from notifications.models import EmailKind, EmailOutbox, OutboxStatus
from notifications.sender import DeliveryResult, FakeSender
from opportunities import expiry, workflow
from opportunities.models import ListingStatus, Opportunity
from tests.factories import CHECKLIST, World, published
from tests.test_employers import CLAIM, claim_for, content, verified_member

pytestmark = pytest.mark.django_db

EMPLOYER_KINDS = [k for k in EmailKind.values if k.startswith("employer_")]


@pytest.fixture
def delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pretend a person verified real delivery (the repository never records that by itself)."""
    monkeypatch.setattr(verification, "delivery_verified", lambda: True)


@pytest.fixture
def owner(make_user: Callable[..., User]) -> User:
    return make_user(email="owner@example.org", display_name="Olivia Owner")


@pytest.fixture
def recruiter(make_user: Callable[..., User]) -> User:
    return make_user(email="recruiter@example.org", display_name="Rudo Recruiter")


def rows(kind: str | None = None) -> list[EmailOutbox]:
    qs = EmailOutbox.objects.filter(kind__in=EMPLOYER_KINDS)
    if kind:
        qs = qs.filter(kind=kind)
    return list(qs.order_by("created_at", "id"))


def addresses(kind: str | None = None) -> list[str]:
    return sorted(r.to_address for r in rows(kind))


def add_member(editor: User, user: User, org: Any, role: str = MemberRole.RECRUITER) -> None:
    claim = services.submit_claim(user, {**CLAIM, "organisation_id": str(org.pk)})
    services.decide_claim(editor, claim.pk, approve=True, role=role)


def new_listing(employer: User, org: Any, world: World, example: str = "jobs-1") -> Opportunity:
    category, data = content(world, org, example)
    return listings.create(employer, org.pk, category, data)


def publish_listing(opp: Opportunity, people: dict[str, User]) -> Opportunity:
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    return opp


# --- the gate: nothing is written while delivery is unverified ---------------------------------------
def test_nothing_is_queued_while_delivery_is_unverified(
    owner: User, people: dict[str, User], world: World
) -> None:
    assert not verification.delivery_verified()  # the default: no real provider has been verified
    org = verified_member(people["editor"], owner)
    opp = new_listing(owner, org, world)
    listings.submit(owner, opp.pk, opp.row_version)
    opp.refresh_from_db()
    publish_listing(opp, people)
    assert rows() == []
    run = reminders.run(timezone.now())
    assert run.status == "delivery_unverified"
    assert JobRun.objects.get(name="expiry_reminders").last_detail == "delivery_unverified"
    assert rows() == []


# --- claims -----------------------------------------------------------------------------------------
@pytest.mark.usefixtures("delivery")
def test_a_claim_is_acknowledged_then_decided_and_only_the_claimant_is_told(
    owner: User, people: dict[str, User]
) -> None:
    claim = claim_for(owner)
    assert addresses(EmailKind.EMPLOYER_CLAIM_RECEIVED) == ["owner@example.org"]
    services.decide_claim(
        people["editor"], claim.pk, approve=True, method="document_review", evidence_note="Certificate seen."
    )
    approved = rows(EmailKind.EMPLOYER_CLAIM_APPROVED)
    assert [r.to_address for r in approved] == ["owner@example.org"]
    assert approved[0].payload["organisation_name"] == "Acme Mining Zimbabwe"
    assert approved[0].user_id == owner.pk
    # no staff member, and nobody else, is e-mailed about a claim
    assert {r.to_address for r in rows()} == {"owner@example.org"}


@pytest.mark.usefixtures("delivery")
def test_a_rejected_claim_carries_the_staff_reason(owner: User, people: dict[str, User]) -> None:
    claim = claim_for(owner)
    services.decide_claim(people["editor"], claim.pk, approve=False, reason="We could not find the company.")
    (row,) = rows(EmailKind.EMPLOYER_CLAIM_REJECTED)
    assert row.payload["reason"] == "We could not find the company."
    message = outbox.build_message(row)
    assert message is not None and "We could not find the company." in message.body


@pytest.mark.usefixtures("delivery")
def test_claim_notices_are_idempotent(owner: User, people: dict[str, User]) -> None:
    claim = claim_for(owner)
    services.decide_claim(people["editor"], claim.pk, approve=False, reason="Not enough evidence.")
    claim.refresh_from_db()
    before = EmailOutbox.objects.count()
    assert notifications.claim_received(claim) == 0
    assert notifications.claim_decided(claim) == 0
    assert EmailOutbox.objects.count() == before


@pytest.mark.usefixtures("delivery")
def test_no_notice_for_an_unconfirmed_inactive_or_suppressed_address(
    make_user: Callable[..., User], people: dict[str, User]
) -> None:
    unconfirmed = make_user(email="new@example.org", status=AccountStatus.PENDING_VERIFICATION)
    assert notifications.claim_received(_claim_of(unconfirmed)) == 0
    suppressed = make_user(email="bounced@example.org")
    suppression.suppress("bounced@example.org", "bounce")
    claim_for(suppressed)
    assert rows() == []


def _claim_of(user: User) -> Any:
    from employers.models import OrganisationClaim

    return OrganisationClaim(user=user, organisation_name="Acme", role_title="x", evidence_note="y" * 20)


# --- listing journey --------------------------------------------------------------------------------
@pytest.mark.usefixtures("delivery")
def test_the_whole_listing_journey_notifies_the_right_people_once_each(
    owner: User, recruiter: User, people: dict[str, User], world: World, make_user: Callable[..., User]
) -> None:
    org = verified_member(people["editor"], owner)
    add_member(people["editor2"], recruiter, org)
    bystander = make_user(email="bystander@example.org")
    add_member(people["editor2"], bystander, org)  # a recruiter who did not create the listing
    EmailOutbox.objects.all().delete()

    opp = new_listing(recruiter, org, world)
    listings.submit(recruiter, opp.pk, opp.row_version)
    opp.refresh_from_db()
    # the creator and the owner are told; the other recruiter is not
    assert addresses(EmailKind.EMPLOYER_LISTING_SUBMITTED) == ["owner@example.org", "recruiter@example.org"]

    workflow.reject(
        people["editor2"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="other",
        reason="The closing date is unclear.",
    )
    opp.refresh_from_db()
    rejected = rows(EmailKind.EMPLOYER_LISTING_REJECTED)
    assert sorted(r.to_address for r in rejected) == ["owner@example.org", "recruiter@example.org"]
    assert all(r.payload["reason"] == "The closing date is unclear." for r in rejected)
    assert all(r.payload["amendment"] is False for r in rejected)

    listings.reopen(recruiter, opp.pk, opp.row_version)
    opp.refresh_from_db()
    listings.submit(recruiter, opp.pk, opp.row_version)
    opp.refresh_from_db()
    publish_listing(opp, people)
    published_rows = rows(EmailKind.EMPLOYER_LISTING_PUBLISHED)
    assert len(published_rows) == 2
    assert all(f"/opportunities/{opp.slug}" in r.payload["public_url"] for r in published_rows)
    assert all(r.payload["amendment"] is False for r in published_rows)

    # an amendment is called one, at each step
    draft = listings.amend(recruiter, opp.pk, opp.row_version)
    assert draft.author == recruiter
    opp.refresh_from_db()
    listings.submit(recruiter, opp.pk, opp.row_version)
    opp.refresh_from_db()
    publish_listing(opp, people)
    amendments = [r for r in rows() if r.payload.get("amendment") is True]
    assert (
        sorted(r.kind for r in amendments)
        == [EmailKind.EMPLOYER_LISTING_PUBLISHED] * 2 + [EmailKind.EMPLOYER_LISTING_SUBMITTED] * 2
    )
    assert all("amendment" in r.payload["subject"] for r in amendments)

    # the bystander, staff and the seeker were never written to
    assert {r.to_address for r in rows()} == {"owner@example.org", "recruiter@example.org"}


@pytest.mark.usefixtures("delivery")
def test_a_returned_amendment_is_reported_as_an_amendment_and_the_live_version_is_unchanged(
    owner: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    opp = publish_listing(_submitted(owner, org, world), people)
    listings.amend(owner, opp.pk, opp.row_version)
    opp.refresh_from_db()
    listings.submit(owner, opp.pk, opp.row_version)
    opp.refresh_from_db()
    workflow.reject(
        people["editor2"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="other",
        reason="Please attach the new reference number.",
    )
    last = rows(EmailKind.EMPLOYER_LISTING_REJECTED)[-1]
    assert last.payload["amendment"] is True
    message = outbox.build_message(last)
    assert message is not None
    assert "amendment" in message.subject and "already published stays as it is" in message.body
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED


def _submitted(owner: User, org: Any, world: World, example: str = "jobs-1") -> Opportunity:
    opp = new_listing(owner, org, world, example)
    listings.submit(owner, opp.pk, opp.row_version)
    opp.refresh_from_db()
    return opp


@pytest.mark.usefixtures("delivery")
def test_a_listing_staff_entered_themselves_has_no_employer_to_tell(
    people: dict[str, User], world: World
) -> None:
    published(world, people["author"], people["editor"], people["editor2"], example="jobs-1")
    assert rows() == []


@pytest.mark.usefixtures("delivery")
def test_members_who_left_and_closed_accounts_are_not_told(
    owner: User, recruiter: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    add_member(people["editor2"], recruiter, org)
    opp = _submitted(recruiter, org, world)
    EmailOutbox.objects.all().delete()
    membership = EmployerMembership.objects.get(user=recruiter, revoked_at__isnull=True)
    services.revoke_membership(people["admin"], membership.pk, reason="Left the company")
    owner.status = AccountStatus.DEACTIVATED
    owner.save(update_fields=["status"])
    workflow.reject(
        people["editor2"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="other",
        reason="Needs a clearer title.",
    )
    assert rows() == []  # the creator left and the only owner's account is closed


# --- idempotency and failure isolation --------------------------------------------------------------
@pytest.mark.usefixtures("delivery")
def test_repeating_a_transition_notification_writes_nothing_new(
    owner: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    opp = _submitted(owner, org, world)
    event = opp.events.get(transition="T03")
    before = EmailOutbox.objects.filter(kind=EmailKind.EMPLOYER_LISTING_SUBMITTED).count()
    assert before == 1
    for _ in range(3):
        assert notifications.listing_event(event, opp, event.version, None) == 0
    assert EmailOutbox.objects.filter(kind=EmailKind.EMPLOYER_LISTING_SUBMITTED).count() == before


@pytest.mark.usefixtures("delivery")
def test_a_notification_failure_never_blocks_or_undoes_an_editorial_decision(
    owner: User, people: dict[str, User], world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = verified_member(people["editor"], owner)
    opp = _submitted(owner, org, world)

    def boom(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("simulated listener failure")

    monkeypatch.setattr(notifications, "enqueue_once", boom)
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED  # the decision stands
    assert rows(EmailKind.EMPLOYER_LISTING_PUBLISHED) == []


@pytest.mark.usefixtures("delivery")
def test_a_database_error_inside_a_notification_does_not_poison_the_transition(
    owner: User, people: dict[str, User], world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = verified_member(people["editor"], owner)
    opp = _submitted(owner, org, world)

    def database_error(*args: Any, **kwargs: Any) -> None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 / 0")  # aborts the transaction unless a savepoint contains it

    monkeypatch.setattr(notifications, "enqueue_once", database_error)
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.APPROVED  # and the connection still works afterwards


@pytest.mark.usefixtures("delivery")
def test_failures_are_logged_without_addresses_or_content(
    owner: User, people: dict[str, User], world: World, monkeypatch: pytest.MonkeyPatch, caplog: Any
) -> None:
    org = verified_member(people["editor"], owner)
    opp = _submitted(owner, org, world)
    monkeypatch.setattr(
        notifications,
        "enqueue_once",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("write failed")),
    )
    with caplog.at_level(logging.ERROR):
        publish_listing(opp, people)
    text = " ".join(f"{r.getMessage()} {getattr(r, 'event', '')}" for r in caplog.records)
    assert "employer_notify.failed" in text
    assert "owner@example.org" not in text and "Olivia" not in text


# --- expiry ------------------------------------------------------------------------------------------
@pytest.mark.usefixtures("delivery")
def test_expiry_notifies_once_and_a_repeat_run_does_not_repeat_it(
    owner: User, recruiter: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    add_member(people["editor2"], recruiter, org)
    opp = publish_listing(_submitted(recruiter, org, world), people)
    EmailOutbox.objects.all().delete()
    far = timezone.now() + timedelta(days=3650)
    assert expiry.run(far).expired == 1
    assert addresses(EmailKind.EMPLOYER_LISTING_EXPIRED) == ["owner@example.org", "recruiter@example.org"]
    assert expiry.run(far).expired == 0
    assert len(rows(EmailKind.EMPLOYER_LISTING_EXPIRED)) == 2
    opp.refresh_from_db()
    assert opp.status == ListingStatus.EXPIRED


# --- seven-day reminders ----------------------------------------------------------------------------
@pytest.mark.usefixtures("delivery")
def test_a_reminder_goes_out_seven_days_before_the_deadline_and_only_once(
    owner: User, recruiter: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    add_member(people["editor2"], recruiter, org)
    opp = publish_listing(_submitted(recruiter, org, world), people)
    deadline = opp.live_version.deadline_at  # type: ignore[union-attr]
    assert deadline is not None
    EmailOutbox.objects.all().delete()

    assert reminders.run(deadline - timedelta(days=8)) == reminders.ReminderRun("ran", 0, 0)  # too early
    assert rows() == []
    first = reminders.run(deadline - timedelta(days=6, hours=23))
    assert first == reminders.ReminderRun("ran", 1, 2)
    assert addresses(EmailKind.EMPLOYER_LISTING_EXPIRING) == ["owner@example.org", "recruiter@example.org"]
    assert reminders.run(deadline - timedelta(days=3)) == reminders.ReminderRun("ran", 1, 0)  # not again
    assert len(rows(EmailKind.EMPLOYER_LISTING_EXPIRING)) == 2
    assert reminders.run(deadline + timedelta(minutes=1)).listings == 0  # already past: nothing to warn about
    version = opp.live_version
    assert all(r.idempotency_key.startswith(f"emprem:{version.pk}:") for r in rows())  # type: ignore[union-attr]
    row = rows(EmailKind.EMPLOYER_LISTING_EXPIRING)[0]
    assert row.payload["days_left"] == 7
    message = outbox.build_message(row)
    assert message is not None and "closes in 7 days" in message.subject


@pytest.mark.usefixtures("delivery")
def test_reminders_skip_unknown_deadlines_other_statuses_and_staff_entered_listings(
    owner: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    unknown = publish_listing(_submitted(owner, org, world, "jobs-2"), people)
    assert unknown.live_version.deadline_at is None  # type: ignore[union-attr]
    staff_listing = published(world, people["author"], people["editor"], people["editor2"], example="jobs-1")
    assert staff_listing.live_version.deadline_at is not None  # type: ignore[union-attr]
    soon = timezone.now() + timedelta(days=3650) - timedelta(days=3)
    result = reminders.run(soon)
    assert result == reminders.ReminderRun("ran", 0, 0)
    assert rows(EmailKind.EMPLOYER_LISTING_EXPIRING) == []


@pytest.mark.usefixtures("delivery")
def test_a_failed_reminder_sweep_is_recorded_and_raised(
    people: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(reminders, "due_listings", lambda now: (_ for _ in ()).throw(RuntimeError("x")))
    with pytest.raises(RuntimeError):
        reminders.run(timezone.now())
    row = JobRun.objects.get(name="expiry_reminders")
    assert (row.last_status, row.failures) == ("failed", 1)
    monkeypatch.setattr(reminders, "due_listings", lambda now: [])
    assert reminders.run(timezone.now()).status == "ran"  # the failed run did not keep the lock


@pytest.mark.usefixtures("delivery")
def test_the_worker_runs_the_reminders_and_monitoring_watches_them(
    owner: User, people: dict[str, User], world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    call_command("run_worker", "--once")
    assert JobRun.objects.get(name="expiry_reminders").last_status == "ok"
    monkeypatch.setenv("UPNEXT_ALERTS_EXPECT_JOBS", "expiry_reminders")
    JobRun.objects.filter(name="expiry_reminders").update(
        last_finished_at=timezone.now() - timedelta(hours=1)
    )
    assert "job.expiry_reminders_stale" in {a.code for a in alerts.evaluate()}
    JobRun.record("expiry_reminders", ok=False, detail="sweep raised; see the log")
    assert "job.expiry_reminders_failed" in {a.code for a in alerts.evaluate()}


# --- rendering: every kind, nothing secret, nothing unrendered ---------------------------------------
@pytest.mark.usefixtures("delivery")
def test_every_employer_message_renders_with_a_plain_link_and_no_token(
    owner: User, people: dict[str, User], world: World
) -> None:
    claim = claim_for(owner)
    services.decide_claim(
        people["editor"], claim.pk, approve=True, method="document_review", evidence_note="Certificate seen."
    )
    claim.refresh_from_db()
    org = claim.organisation
    assert org is not None
    category, data = content(world, org, "jobs-1", title="Line one\nLine two <b>bold</b>")
    opp = listings.create(owner, org.pk, category, data)
    listings.submit(owner, opp.pk, opp.row_version)
    opp.refresh_from_db()
    workflow.reject(
        people["editor2"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="other",
        reason="Please fix the title.",
    )
    seen: dict[str, EmailOutbox] = {r.kind: r for r in rows()}
    for kind in (
        EmailKind.EMPLOYER_CLAIM_RECEIVED,
        EmailKind.EMPLOYER_CLAIM_APPROVED,
        EmailKind.EMPLOYER_LISTING_SUBMITTED,
        EmailKind.EMPLOYER_LISTING_REJECTED,
    ):
        message = outbox.build_message(seen[kind])
        assert message is not None, kind
        assert "{{" not in message.body and "{%" not in message.body
        assert "token" not in message.body.lower() and "token=" not in (message.html or "")
        assert "\n" not in message.subject and "\r" not in message.subject
        assert "Olivia Owner" in message.body
        assert "/employer" in message.body
    # the subject is one clean line even when the title is not
    assert "Line one Line two" in outbox.build_message(seen[EmailKind.EMPLOYER_LISTING_SUBMITTED]).subject  # type: ignore[union-attr]


def test_every_new_kind_has_a_subject_and_a_template() -> None:
    from notifications import content, samples

    for kind in EMPLOYER_KINDS:
        assert kind in {str(k) for k in content.BUILDERS}, kind
        assert content.build(kind, samples.sample_context(kind)).subject.endswith("| UPNEXT Careers"), kind
        assert len(kind) <= 32  # EmailOutbox.kind is 32 characters wide


# --- delivery: success, retry, permanent failure, suppression after queuing -----------------------------
@pytest.mark.usefixtures("delivery")
def test_delivery_succeeds_retries_and_fails_through_the_existing_outbox(
    owner: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    opp = _submitted(owner, org, world)
    EmailOutbox.objects.exclude(kind=EmailKind.EMPLOYER_LISTING_SUBMITTED).delete()
    (row,) = rows()

    temporary = FakeSender(outcomes=[DeliveryResult("temporary_failure", error_code="smtp_busy")])
    assert outbox.process_batch(sender=temporary) == {"sent": 0, "failed": 1, "dead": 0}
    row.refresh_from_db()
    assert row.status == OutboxStatus.FAILED and row.attempts == 1 and row.next_attempt_at > timezone.now()
    assert row.payload  # kept for the retry
    EmailOutbox.objects.filter(pk=row.pk).update(next_attempt_at=timezone.now())

    sender = FakeSender()
    assert outbox.process_batch(sender=sender) == {"sent": 1, "failed": 0, "dead": 0}
    row.refresh_from_db()
    assert row.status == OutboxStatus.SENT and row.payload == {}  # variables scrubbed after sending
    assert [m.to for m in sender.sent] == ["owner@example.org"]
    assert sender.sent[0].idempotency_key == row.idempotency_key  # the provider can deduplicate too
    assert outbox.process_batch(sender=FakeSender()) == {"sent": 0, "failed": 0, "dead": 0}  # not sent twice

    # a permanent failure is final, and an address suppressed after queuing is never written to
    workflow.reject(
        people["editor2"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="other",
        reason="Needs a clearer title.",
    )
    (rejected,) = rows(EmailKind.EMPLOYER_LISTING_REJECTED)
    suppression.suppress("owner@example.org", "complaint")
    sender = FakeSender()
    assert outbox.process_batch(sender=sender) == {"sent": 0, "failed": 0, "dead": 1}
    rejected.refresh_from_db()
    assert rejected.status == OutboxStatus.DEAD and rejected.last_error == "suppressed" and sender.sent == []


@pytest.mark.usefixtures("delivery")
def test_a_permanent_provider_failure_is_dead_not_retried(
    owner: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], owner)
    _submitted(owner, org, world)
    EmailOutbox.objects.exclude(kind=EmailKind.EMPLOYER_LISTING_SUBMITTED).delete()  # the claim notices
    sender = FakeSender(outcomes=[DeliveryResult("permanent_failure", error_code="recipient_refused")])
    outbox.process_batch(sender=sender)
    (row,) = rows(EmailKind.EMPLOYER_LISTING_SUBMITTED)
    assert row.status == OutboxStatus.DEAD and row.last_error == "recipient_refused"
    assert suppression.is_suppressed("owner@example.org")  # the existing bounce handling still applies
