"""Scheduled listing expiry (M1, A-02): the worker runs `expire_due()`, one run at a time, and records it.

Before this, `workflow.expire_due()` was only called from tests, so a published listing never became
`expired` in a running system (traceability JOB-01 was specified but not delivered).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.core.management import call_command
from django.db import connections
from django.utils import timezone

from accounts.models import User
from core import alerts
from core.joblock import job_lock, lock_key
from core.models import JobRun
from opportunities import expiry, workflow
from opportunities.models import ListingStatus, Opportunity, PublishingEvent
from tests.factories import World, published


def fresh(opportunity: Opportunity) -> Opportunity:
    opportunity.refresh_from_db()
    return opportunity


def far_future() -> Any:
    return timezone.now() + timedelta(days=3650)


def codes() -> set[str]:
    return {a.code for a in alerts.evaluate()}


def test_a_past_deadline_listing_becomes_expired_and_the_run_is_recorded(
    world: World, people: dict[str, User]
) -> None:
    listing = published(world, people["author"], people["editor"], example="jobs-1")
    assert listing.live_version.deadline_at is not None  # type: ignore[union-attr]

    result = expiry.run(far_future())

    assert result == expiry.ExpiryRun("ran", 1)
    assert fresh(listing).status == ListingStatus.EXPIRED
    event = PublishingEvent.objects.get(opportunity=listing, transition="T11")
    assert event.actor_type == "system" and event.actor_id is None
    row = JobRun.objects.get(name="expiry")
    assert (row.last_status, row.last_detail, row.runs, row.failures) == ("ok", "expired=1", 1, 0)
    assert row.last_started_at is not None and row.last_ok_at is not None


def test_open_and_unknown_deadlines_stay_published_and_a_repeat_run_does_nothing(
    world: World, people: dict[str, User]
) -> None:
    dated = published(world, people["author"], people["editor"], example="jobs-1")
    unknown = published(world, people["author"], people["editor"], example="jobs-2")
    assert unknown.live_version.deadline_at is None  # type: ignore[union-attr]

    assert expiry.run().expired == 0  # nothing is due yet
    assert fresh(dated).status == ListingStatus.PUBLISHED

    assert expiry.run(far_future()).expired == 1
    assert expiry.run(far_future()).expired == 0  # idempotent
    assert fresh(dated).status == ListingStatus.EXPIRED
    assert fresh(unknown).status == ListingStatus.PUBLISHED  # an unknown deadline never expires
    assert JobRun.objects.get(name="expiry").runs == 3


def test_an_overlapping_run_is_skipped_and_changes_nothing(world: World, people: dict[str, User]) -> None:
    listing = published(world, people["author"], people["editor"], example="jobs-1")
    other = connections.create_connection("default")  # a second worker process, as far as PostgreSQL knows
    try:
        with other.cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock(%s)", [lock_key(expiry.JOB_NAME)])
            assert cursor.fetchone() == (True,)

        result = expiry.run(far_future())

        assert result == expiry.ExpiryRun("skipped")
        assert fresh(listing).status == ListingStatus.PUBLISHED  # the skipped run did no work
        assert not JobRun.objects.filter(name="expiry").exists()  # and recorded nothing

        with other.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(%s)", [lock_key(expiry.JOB_NAME)])
    finally:
        other.close()

    assert expiry.run(far_future()) == expiry.ExpiryRun("ran", 1)  # runs normally once the other run ended
    assert fresh(listing).status == ListingStatus.EXPIRED


def test_the_lock_is_free_again_as_soon_as_the_context_exits(db: None) -> None:
    other = connections.create_connection("default")
    try:
        with job_lock("probe") as held:
            assert held is True
            with other.cursor() as cursor:  # while held, another session is refused
                cursor.execute("SELECT pg_try_advisory_lock(%s)", [lock_key("probe")])
                assert cursor.fetchone() == (False,)
        with other.cursor() as cursor:  # once released, another session gets it
            cursor.execute("SELECT pg_try_advisory_lock(%s)", [lock_key("probe")])
            assert cursor.fetchone() == (True,)
            cursor.execute("SELECT pg_advisory_unlock(%s)", [lock_key("probe")])
    finally:
        other.close()


def test_a_failed_run_is_recorded_re_raised_and_does_not_keep_the_lock(
    world: World, people: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    listing = published(world, people["author"], people["editor"], example="jobs-1")
    real = workflow.expire_due

    def boom(now: Any = None) -> int:
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(workflow, "expire_due", boom)
    with pytest.raises(RuntimeError, match="simulated failure"):
        expiry.run(far_future())
    row = JobRun.objects.get(name="expiry")
    assert (row.last_status, row.failures, row.runs) == ("failed", 1, 1)
    assert "simulated failure" not in row.last_detail  # the detail is a fixed note, never exception text
    assert fresh(listing).status == ListingStatus.PUBLISHED

    monkeypatch.setattr(workflow, "expire_due", real)
    assert expiry.run(far_future()).expired == 1  # the failed run did not leave the lock behind
    row = JobRun.objects.get(name="expiry")
    assert (row.last_status, row.failures, row.runs) == ("ok", 1, 2)


def test_the_worker_cycle_expires_listings_and_records_the_job(
    world: World, people: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    listing = published(world, people["author"], people["editor"], example="jobs-1")
    real = workflow.expire_due
    far = far_future()
    monkeypatch.setattr(workflow, "expire_due", lambda now=None: real(far))  # the deadline has passed

    call_command("run_worker", "--once")

    assert fresh(listing).status == ListingStatus.EXPIRED
    names = set(JobRun.objects.values_list("name", flat=True))
    assert {"worker", "housekeeping", "expiry"} <= names
    assert JobRun.objects.get(name="expiry").last_detail == "expired=1"


def test_a_failing_expiry_never_stops_the_rest_of_the_worker_cycle(
    db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(now: Any = None) -> int:
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(workflow, "expire_due", boom)

    call_command("run_worker", "--once")  # must not raise

    assert JobRun.objects.get(name="expiry").last_status == "failed"
    names = set(JobRun.objects.values_list("name", flat=True))
    assert {"worker", "housekeeping"} <= names  # deletions, retention and the outbox still ran


def test_monitoring_sees_a_stale_failed_or_missing_expiry_job(
    db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert "job.expiry_missing" not in codes()  # not expected on this system
    monkeypatch.setenv("UPNEXT_ALERTS_EXPECT_JOBS", "expiry")
    assert "job.expiry_missing" in codes()
    JobRun.record("expiry", detail="expired=0")
    assert not codes() & {"job.expiry_missing", "job.expiry_stale", "job.expiry_failed"}
    JobRun.objects.filter(name="expiry").update(last_finished_at=timezone.now() - timedelta(minutes=20))
    assert "job.expiry_stale" in codes()
    JobRun.record("expiry", ok=False, detail="expire_due raised; see the log")
    assert "job.expiry_failed" in codes()


def test_lock_keys_are_stable_distinct_and_fit_a_signed_64_bit_integer() -> None:
    assert lock_key("expiry") == lock_key("expiry")
    assert lock_key("expiry") != lock_key("housekeeping")
    assert -(2**63) <= lock_key("expiry") < 2**63
