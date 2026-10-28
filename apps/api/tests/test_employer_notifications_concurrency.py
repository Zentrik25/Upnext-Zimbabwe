"""Employer notifications under concurrency (M2): two workers, two retries or two requests at the same instant
write each notice once. Real threads and real transactions on PostgreSQL, so these tests commit and flush."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest

from accounts.models import User
from employers import notifications, reminders
from notifications import verification
from notifications.models import EmailKind, EmailOutbox
from tests.factories import World
from tests.test_concurrency import race
from tests.test_employer_notifications import _submitted, add_member, publish_listing
from tests.test_employers import verified_member

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(verification, "delivery_verified", lambda: True)


def _count(kind: str) -> int:
    return EmailOutbox.objects.filter(kind=kind).count()


def test_two_reminder_sweeps_at_once_queue_each_reminder_once(
    people: dict[str, User], world: World, make_user: Any
) -> None:
    owner, recruiter = make_user(email="owner@example.org"), make_user(email="recruiter@example.org")
    org = verified_member(people["editor"], owner)
    add_member(people["editor2"], recruiter, org)
    opp = publish_listing(_submitted(recruiter, org, world), people)
    deadline = opp.live_version.deadline_at  # type: ignore[union-attr]
    assert deadline is not None
    now = deadline - timedelta(days=5)

    results = race(lambda: reminders.run(now), lambda: reminders.run(now), lambda: reminders.run(now))

    assert not [r for r in results if isinstance(r, Exception)], results
    statuses = [r.status for r in results]
    assert set(statuses) <= {"ran", "skipped"} and "ran" in statuses
    assert _count(EmailKind.EMPLOYER_LISTING_EXPIRING) == 2  # the owner and the creator, once each


def test_the_same_transition_notified_from_two_threads_is_queued_once(
    people: dict[str, User], world: World, make_user: Any
) -> None:
    owner = make_user(email="owner@example.org")
    org = verified_member(people["editor"], owner)
    opp = _submitted(owner, org, world)
    event = opp.events.get(transition="T03")
    assert _count(EmailKind.EMPLOYER_LISTING_SUBMITTED) == 1  # the transition itself queued it once

    results = race(*[lambda: notifications.listing_event(event, opp, event.version, None) for _ in range(4)])

    assert not [r for r in results if isinstance(r, Exception)], results
    assert results == [0, 0, 0, 0]  # every extra attempt finds the row and writes nothing
    assert _count(EmailKind.EMPLOYER_LISTING_SUBMITTED) == 1
