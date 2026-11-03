"""Job alerts (Phase 6B): preferences and consent, scheduling, digests, the delivery gate, unsubscribe."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

import pytest
from django.core.management import call_command
from django.db.models import F
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountStatus, User
from alerts import messages, service, tokens
from alerts.models import AlertDelivery, JobAlert
from audit.models import AuditEvent
from notifications import services as outbox
from notifications import suppression
from notifications.models import EmailKind, EmailOutbox, OutboxStatus
from notifications.sender import FakeSender
from opportunities import workflow
from opportunities.models import Opportunity
from tests.factories import World
from tests.seekers import live, location_id, put, signed_in

pytestmark = pytest.mark.django_db
URL = "/api/v1/me/alerts"
UNSUB = "/api/v1/alerts/unsubscribe"
DAY = timedelta(days=1)


@pytest.fixture
def verified(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pretend e-mail delivery has been verified (B-01 closed). Nothing is sent: the outbox only holds rows."""
    monkeypatch.setattr("notifications.verification.delivery_verified", lambda: True)


def enable(client: APIClient, **overrides: object) -> object:
    body = {"enabled": True, "consent": True, "frequency": "daily", "categories": ["jobs"], **overrides}
    return put(client, URL, body)


def jobs_rows() -> list[EmailOutbox]:
    return list(EmailOutbox.objects.filter(kind=EmailKind.JOB_ALERT).order_by("created_at"))


# --- preferences and consent ---------------------------------------------------------------------------
def test_a_new_account_has_alerts_off_and_unchecked(make_user: Callable[..., User], world: World) -> None:
    client, _ = signed_in(make_user)
    body = client.get(URL).json()
    assert body["enabled"] is False and body["categories"] == [] and body["consented_at"] is None
    assert body["delivery_available"] is False  # B-01: nothing is sent yet
    assert "any time" in body["consent_wording"]
    assert JobAlert.objects.count() == 0


def test_switching_on_needs_explicit_consent_and_a_choice(
    make_user: Callable[..., User], world: World
) -> None:
    client, user = signed_in(make_user)
    no_consent = put(client, URL, {"enabled": True, "categories": ["jobs"]})
    assert no_consent.status_code == 400 and "consent" in no_consent.json()["error"]["fields"]
    refused = put(client, URL, {"enabled": True, "consent": False, "categories": ["jobs"]})
    assert refused.status_code == 400
    nothing_chosen = put(client, URL, {"enabled": True, "consent": True})
    assert nothing_chosen.status_code == 400 and "categories" in nothing_chosen.json()["error"]["fields"]
    assert not JobAlert.objects.filter(user=user, enabled=True).exists()


def test_switching_on_records_the_consent_and_starts_the_watermark_now(
    make_user: Callable[..., User], world: World
) -> None:
    client, user = signed_in(make_user)
    before = timezone.now()
    response = enable(client, locations=[location_id("harare")], frequency="weekly")
    assert response.status_code == 200  # type: ignore[attr-defined]
    alert = JobAlert.objects.get(user=user)
    assert (
        alert.enabled and alert.frequency == "weekly" and alert.consent_wording_version == "alerts-consent-v1"
    )
    assert alert.consented_at is not None and alert.consented_at >= before
    assert alert.last_checked_at == alert.consented_at  # no backlog
    assert AuditEvent.objects.filter(action="alerts.enabled", actor_ref=user.pk).count() == 1


def test_switching_off_keeps_the_proof_and_records_the_withdrawal(
    make_user: Callable[..., User], world: World
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    assert put(client, URL, {"enabled": False}).json()["enabled"] is False
    alert = JobAlert.objects.get(user=user)
    assert not alert.enabled and alert.consented_at is not None and alert.withdrawn_at is not None
    assert AuditEvent.objects.filter(action="alerts.disabled", actor_ref=user.pk).exists()


def test_editing_choices_while_on_needs_no_second_consent(
    make_user: Callable[..., User], world: World
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    consented = JobAlert.objects.get(user=user).consented_at
    assert (
        put(client, URL, {"categories": ["grants", "internships"], "frequency": "weekly"}).status_code == 200
    )
    alert = JobAlert.objects.get(user=user)
    assert {c.code for c in alert.categories.all()} == {"grants", "internships"}
    assert alert.consented_at == consented and alert.enabled
    assert (
        put(client, URL, {"categories": [], "locations": []}).status_code == 400
    )  # would leave nothing chosen


def test_an_unconfirmed_account_cannot_switch_alerts_on(world: World) -> None:
    pending = User.objects.create_user("pending@example.org", "pw-pw-pw-pw-12", "Pending")
    assert pending.status == AccountStatus.PENDING_VERIFICATION
    with pytest.raises(service.AlertError) as caught:
        service.update(pending, {"enabled": True, "consent": True, "categories": []})
    assert caught.value.code == "email_not_verified" and not JobAlert.objects.exists()


def test_alert_endpoints_need_a_session_csrf_and_valid_input(
    make_user: Callable[..., User], world: World
) -> None:
    assert APIClient(enforce_csrf_checks=True).get(URL).status_code == 401
    client, _ = signed_in(make_user)
    assert client.put(URL, {"enabled": False}, format="json").status_code == 403
    for body in (
        {},
        {"frequency": "hourly"},
        {"categories": ["nope"]},
        {"surprise": 1},
        {"locations": ["x"]},
    ):
        assert put(client, URL, body).status_code == 400, body


def test_one_account_cannot_change_anothers_alert(make_user: Callable[..., User], world: World) -> None:
    alice, alice_user = signed_in(make_user, email="alice@example.org")
    bob, bob_user = signed_in(make_user, email="bob@example.org")
    enable(alice, categories=["grants"])
    assert bob.get(URL).json()["enabled"] is False
    put(bob, URL, {"enabled": False})
    assert JobAlert.objects.get(user=alice_user).enabled is True
    assert (
        not JobAlert.objects.filter(user=bob_user).exists() or not JobAlert.objects.get(user=bob_user).enabled
    )


# --- the delivery gate -----------------------------------------------------------------------------------
def test_while_delivery_is_unverified_the_pass_does_nothing_at_all(
    make_user: Callable[..., User], world: World, people: dict[str, User]
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "gate1")
    watermark = JobAlert.objects.get(user=user).last_checked_at
    result = service.run_due(timezone.now() + 3 * DAY)
    assert result.status == "delivery_unverified" and result.queued == 0
    assert EmailOutbox.objects.count() == 0 and AlertDelivery.objects.count() == 0
    assert JobAlert.objects.get(user=user).last_checked_at == watermark


def test_the_worker_and_the_command_obey_the_same_gate(
    make_user: Callable[..., User], world: World, people: dict[str, User], capsys: pytest.CaptureFixture[str]
) -> None:
    client, _ = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "gate2")
    call_command("run_job_alerts")
    assert "not verified" in capsys.readouterr().out
    call_command("run_worker", "--once")
    assert EmailOutbox.objects.filter(kind=EmailKind.JOB_ALERT).count() == 0


def test_only_demo_stacks_count_as_verified_by_the_real_gate(
    settings: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    from notifications import verification

    monkeypatch.delenv("UPNEXT_DEMO_TOOLS", raising=False)
    assert verification.delivery_verified() is False  # the test settings use the file backend, no record


# --- the digest ------------------------------------------------------------------------------------------
def elapse(days: float) -> None:
    """Let time pass without waiting: move every alert and publication timestamp back by `days`."""
    delta = timedelta(days=days)
    JobAlert.objects.update(
        consented_at=F("consented_at") - delta,
        last_checked_at=F("last_checked_at") - delta,
        last_sent_at=F("last_sent_at") - delta,
    )
    Opportunity.objects.filter(first_published_at__isnull=False).update(
        first_published_at=F("first_published_at") - delta
    )


def run_after(days: float = 1.1, **kwargs: bool) -> service.RunResult:
    elapse(days)
    return service.run_due(timezone.now(), **kwargs)


def test_a_due_alert_queues_one_message_with_only_new_matching_open_listings(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    old = live(world, people, "jobs-2", "before")  # published before the alert was switched on
    client, user = signed_in(make_user)
    enable(client, categories=["jobs"])
    match = live(world, people, "jobs-1", "match")
    live(world, people, "grants-1", "other-category")
    withdrawn = live(world, people, "jobs-2", "gone")
    workflow.withdraw(
        people["editor"], withdrawn.pk, expected_row_version=withdrawn.row_version, reason="issuer withdrew"
    )
    result = run_after()
    assert (result.status, result.checked, result.queued, result.listings) == ("ran", 1, 1, 1)
    (row,) = jobs_rows()
    assert row.user == user and row.to_address == user.email
    assert [i["path"] for i in row.payload["items"]] == [f"/opportunities/{match.slug}"]
    assert str(old.slug) not in str(row.payload) and str(withdrawn.slug) not in str(row.payload)
    alert = JobAlert.objects.get(user=user)
    assert AlertDelivery.objects.filter(alert=alert).count() == 1
    assert alert.last_sent_at is not None and alert.last_checked_at > alert.consented_at  # type: ignore[operator]


def test_nothing_new_means_no_message_but_the_position_still_moves(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    first_check = JobAlert.objects.get(user=user).last_checked_at
    result = run_after()
    assert result.queued == 0 and result.skipped == 1 and EmailOutbox.objects.count() == 0
    assert JobAlert.objects.get(user=user).last_checked_at > first_check  # type: ignore[operator]


def test_a_listing_is_never_sent_twice_and_the_schedule_is_respected(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, _user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "once")
    assert run_after().queued == 1
    assert service.run_due(timezone.now()).checked == 0  # not due again (also what a second worker would see)
    assert run_after(0.2).checked == 0
    live(world, people, "jobs-2", "twice")
    assert run_after(1.1).queued == 1
    first, second = jobs_rows()
    assert len(first.payload["items"]) == 1 and len(second.payload["items"]) == 1
    assert first.payload["items"][0]["path"] != second.payload["items"][0]["path"]
    assert first.idempotency_key != second.idempotency_key


def test_a_ledger_entry_alone_keeps_a_listing_out_of_the_next_digest(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    job = live(world, people, "jobs-1", "ledger")
    alert = JobAlert.objects.get(user=user)
    AlertDelivery.objects.create(alert=alert, opportunity=job)
    elapse(1.1)
    assert service.build_digest(alert, timezone.now()) is None


def test_weekly_alerts_wait_a_week(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, _ = signed_in(make_user)
    enable(client, frequency="weekly")
    live(world, people, "jobs-1", "weekly")
    assert run_after(3).checked == 0
    assert run_after(4.2).queued == 1


def test_location_choices_include_the_places_below_them(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, _user = signed_in(make_user)
    enable(client, categories=[], locations=[location_id("harare-province")])
    harare = live(world, people, "jobs-1", "in-harare")  # city Harare
    live(world, people, "jobs-2", "in-masvingo")  # Masvingo
    live(world, people, "grants-1", "in-gweru")  # Gweru
    assert run_after().listings == 1
    (row,) = jobs_rows()
    assert row.payload["items"][0]["path"].endswith(harare.slug or "?")


def test_both_choices_must_match(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, _ = signed_in(make_user)
    enable(client, categories=["grants"], locations=[location_id("harare")])
    live(world, people, "jobs-1", "harare-job")  # right place, wrong category
    live(world, people, "grants-1", "gweru-grant")  # right category, wrong place
    assert run_after().queued == 0


def test_a_digest_is_capped_and_points_to_the_search_for_the_rest(
    make_user: Callable[..., User],
    world: World,
    people: dict[str, User],
    verified: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(service, "MAX_PER_DIGEST", 2)
    client, _user = signed_in(make_user)
    enable(client)
    for n in range(4):
        live(world, people, "jobs-2", f"cap{n}")
    run_after()
    (row,) = jobs_rows()
    assert len(row.payload["items"]) == 2 and row.payload["more_count"] == 2
    assert "4 new opportunities" in row.payload["subject"]
    message = outbox.build_message(row)
    assert message is not None and "category=jobs" in message.body and "See all opportunities" in message.body


def test_a_closed_listing_is_not_offered_even_if_it_was_new(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, _ = signed_in(make_user)
    enable(client)
    gone = live(world, people, "jobs-1", "lapsed")
    workflow.expire(
        people["editor"], gone.pk, expected_row_version=gone.row_version, reason="deadline passed"
    )
    assert run_after().queued == 0


@pytest.mark.parametrize("problem", ["suppressed", "deletion_pending", "suspended"])
def test_ineligible_accounts_get_nothing_and_no_backlog_when_they_return(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None, problem: str
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", f"inel-{problem}")
    if problem == "suppressed":
        suppression.suppress(user.email, "bounce")
    elif problem == "deletion_pending":
        user.deletion_requested_at = timezone.now()
        user.save()
    else:
        user.status = AccountStatus.SUSPENDED
        user.save()
    before = timezone.now()
    result = run_after()
    assert result.queued == 0 and EmailOutbox.objects.count() == 0
    moved = JobAlert.objects.get(user=user).last_checked_at
    assert moved is not None and moved >= before  # moved on: no stale backlog later


def test_a_dry_run_changes_nothing(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "dry")
    elapse(1.1)
    watermark = JobAlert.objects.get(user=user).last_checked_at
    result = service.run_due(timezone.now(), dry_run=True)
    assert result.queued == 1 and result.listings == 1
    assert EmailOutbox.objects.count() == 0 and AlertDelivery.objects.count() == 0
    assert JobAlert.objects.get(user=user).last_checked_at == watermark


def test_one_broken_alert_does_not_stop_the_others(
    make_user: Callable[..., User],
    world: World,
    people: dict[str, User],
    verified: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first, _ = signed_in(make_user, email="one@example.org")
    second, _second_user = signed_in(make_user, email="two@example.org")
    enable(first)
    enable(second)
    live(world, people, "jobs-1", "isolation")
    real = service.build_digest
    calls = {"n": 0}

    def flaky(alert: JobAlert, now):  # type: ignore[no-untyped-def]
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        return real(alert, now)

    monkeypatch.setattr(service, "build_digest", flaky)
    assert run_after().queued == 1
    assert EmailOutbox.objects.filter(kind=EmailKind.JOB_ALERT).count() == 1


# --- the message -----------------------------------------------------------------------------------------
def test_the_message_is_branded_has_working_links_and_both_unsubscribe_headers(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None, settings: object
) -> None:
    client, user = signed_in(make_user, display_name="Tendai")
    enable(client, frequency="weekly")
    job = live(world, people, "jobs-1", "message")
    run_after(7.1)
    (row,) = jobs_rows()
    message = outbox.build_message(row)
    assert message is not None
    base = "http://localhost:3000"  # UPNEXT_PUBLIC_BASE_URL default in the test settings
    from django.conf import settings as django_settings

    base = str(django_settings.UPNEXT_PUBLIC_BASE_URL).rstrip("/")
    assert message.subject == "1 new opportunity matching your UPNEXT Careers alert"
    assert "Hello Tendai," in message.body and "weekly" in message.body
    assert f"{base}/opportunities/{job.slug}" in message.body
    assert f"{base}/alerts\n" in message.body or f"{base}/alerts" in message.body
    assert f"{base}/alerts/unsubscribe?token=" in message.body
    assert "UPNEXT does not receive applications" in message.body
    assert "nextjob" not in message.body.lower() and "nextjob" not in (message.html or "").lower()
    assert message.html and "UPNEXT Careers" in message.html and "<script" not in message.html
    headers = dict(message.headers)
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert headers["List-Unsubscribe"].startswith(f"<{base}/api/v1/alerts/unsubscribe?token=")
    assert tokens.read(headers["List-Unsubscribe"].split("token=")[1].rstrip(">")) == user.pk


def test_an_alert_for_a_deleted_person_renders_nothing() -> None:
    row = EmailOutbox(
        kind=EmailKind.JOB_ALERT, to_address="x@example.org", template_key="job_alert", payload={}
    )
    assert messages.context_for(row) is None and messages.headers_for(row) == ()
    assert outbox.build_message(row) is None


def test_the_worker_hands_the_message_to_a_sender_and_skips_suppressed_addresses(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "send")
    run_after()
    sender = FakeSender()  # a test double: no provider, no network
    assert outbox.process_batch(sender=sender)["sent"] == 1
    assert sender.sent[0].kind == "job_alert" and sender.sent[0].headers
    assert EmailOutbox.objects.get(kind=EmailKind.JOB_ALERT).payload == {}  # variables scrubbed after sending

    live(world, people, "jobs-2", "send2")
    run_after(1.1)
    suppression.suppress(user.email, "complaint")  # a complaint arrives before the worker sends
    assert outbox.process_batch(sender=sender)["dead"] == 1
    assert len(sender.sent) == 1


def test_the_file_backend_writes_the_headers_for_inspection(
    tmp_path: Path, make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    from notifications.sender import FileSender

    client, _ = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "file")
    run_after()
    outbox.process_batch(sender=FileSender(tmp_path))
    record = json.loads(next(tmp_path.iterdir()).read_text())
    assert record["kind"] == "job_alert" and "List-Unsubscribe" in record["headers"]


# --- unsubscribe -----------------------------------------------------------------------------------------
def test_the_unsubscribe_link_switches_the_alert_off_without_a_session_or_csrf(
    make_user: Callable[..., User], world: World
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    token = tokens.make(user.pk)
    anonymous = APIClient(enforce_csrf_checks=True)
    assert anonymous.post(f"{UNSUB}?token={token}").status_code == 204  # the RFC 8058 one-click POST
    alert = JobAlert.objects.get(user=user)
    assert not alert.enabled and alert.withdrawn_at is not None
    assert anonymous.post(UNSUB, {"token": token}, format="json").status_code == 204  # idempotent, body form
    assert AuditEvent.objects.filter(action="alerts.unsubscribed", actor_ref=user.pk).count() == 1
    assert suppression.is_suppressed(user.email) is False  # security mail is never blocked by this


@pytest.mark.parametrize("token", ["", "garbage", "a" * 600])
def test_bad_unsubscribe_tokens_are_refused(make_user: Callable[..., User], world: World, token: str) -> None:
    client, user = signed_in(make_user)
    enable(client)
    anonymous = APIClient(enforce_csrf_checks=True)
    response = (
        anonymous.post(f"{UNSUB}?token={token}")
        if token != "a" * 600
        else anonymous.post(UNSUB, {"token": token}, format="json")
    )
    assert response.status_code == 400
    assert JobAlert.objects.get(user=user).enabled is True


def test_a_token_cannot_be_reused_across_kinds_or_forged() -> None:
    from django.core import signing

    other = signing.dumps(
        {"u": "00000000-0000-4000-8000-000000000001", "k": "job_alert"}, salt="another.salt"
    )
    assert tokens.read(other) is None
    assert tokens.read(signing.dumps({"u": "x", "k": "other"}, salt="upnext.alerts.unsubscribe.v1")) is None


def test_unsubscribing_stops_future_digests(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "after-unsub")
    APIClient().post(f"{UNSUB}?token={tokens.make(user.pk)}")
    assert run_after().checked == 0 and EmailOutbox.objects.count() == 0


def test_turning_alerts_back_on_starts_from_now_not_from_the_old_position(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, _user = signed_in(make_user)
    enable(client)
    put(client, URL, {"enabled": False})
    live(world, people, "jobs-1", "while-off")
    assert enable(client).status_code == 200  # type: ignore[attr-defined]
    assert run_after().queued == 0  # published while it was off: not new to this opt-in


def test_the_delivery_ledger_is_purged_after_its_window(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    client, user = signed_in(make_user)
    enable(client)
    job = live(world, people, "jobs-1", "purge")
    alert = JobAlert.objects.get(user=user)
    row = AlertDelivery.objects.create(alert=alert, opportunity=job)
    AlertDelivery.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=31))
    assert service.purge_ledger() == 1
    from accounts import retention

    assert "alert_ledger" in retention.run()


def test_pending_messages_die_with_the_account(
    make_user: Callable[..., User], world: World, people: dict[str, User], verified: None
) -> None:
    from accounts import deletion

    client, user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "dying")
    run_after()
    user.deletion_requested_at = timezone.now() - timedelta(days=30)
    user.save()
    assert deletion.execute(user.pk)
    row = EmailOutbox.objects.get(kind=EmailKind.JOB_ALERT)
    assert (
        row.status == OutboxStatus.DEAD and row.to_address == "scrubbed@deleted.invalid" and row.payload == {}
    )
    assert Opportunity.objects.filter(pk__isnull=False).exists()  # listings are untouched


def test_the_demo_command_makes_an_alert_due_and_is_refused_elsewhere(
    make_user: Callable[..., User],
    world: World,
    people: dict[str, User],
    verified: None,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from django.core.management.base import CommandError

    client, user = signed_in(make_user)
    enable(client)
    live(world, people, "jobs-1", "demo-cmd")
    monkeypatch.delenv("UPNEXT_DEMO_TOOLS", raising=False)
    with pytest.raises(CommandError, match="UPNEXT_DEMO_TOOLS"):
        call_command("demo_alert_run", "--email", user.email)
    monkeypatch.setenv("UPNEXT_DEMO_TOOLS", "1")
    with pytest.raises(CommandError, match="No enabled alert"):
        call_command("demo_alert_run", "--email", "nobody@example.org")
    call_command("demo_alert_run", "--email", user.email, "--days-back", "2")
    assert "queued=1" in capsys.readouterr().out and len(jobs_rows()) == 1
