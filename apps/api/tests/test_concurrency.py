"""Concurrent transitions: exactly one wins, the loser is refused cleanly (AC-EDIT-11, WF-09/WF-14).

These tests use real threads and real transactions on PostgreSQL, so they commit and flush tables.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Any

import pytest
from django.db import connection

from accounts.models import AccountStatus, StaffRoleAssignment, User
from opportunities import workflow
from opportunities.errors import WorkflowError
from opportunities.models import ListingStatus, Opportunity, PublishingEvent
from tests.factories import CHECKLIST, build_world, submitted

pytestmark = pytest.mark.django_db(transaction=True)


def make(email: str, *roles: str) -> User:
    user = User.objects.create_user(
        email,
        "pw-pw-pw-pw-12",
        email.split("@")[0],
        status=AccountStatus.ACTIVE,
        email_verified_at="2026-01-01T00:00:00Z",
    )
    for role in roles:
        StaffRoleAssignment.objects.create(user=user, role=role, reason="test fixture")
    return user


def race(*calls: Callable[[], Any]) -> list[Any]:
    """Run the calls at the same instant on separate connections; return results or exceptions."""
    barrier = threading.Barrier(len(calls))
    results: list[Any] = [None] * len(calls)

    def runner(index: int, call: Callable[[], Any]) -> None:
        try:
            barrier.wait(timeout=10)
            results[index] = call()
        except Exception as exc:
            results[index] = exc
        finally:
            connection.close()

    threads = [threading.Thread(target=runner, args=(i, c)) for i, c in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    return results


def test_two_editors_approving_at_once_produce_one_approval() -> None:
    author, one, two = (
        make("a@example.org", "contributor"),
        make("e1@example.org", "editor"),
        make("e2@example.org", "editor"),
    )
    world = build_world(make("adm@example.org", "administrator"))
    opp = submitted(world, author)
    version = opp.row_version
    results = race(
        lambda: workflow.approve(one, opp.pk, expected_row_version=version, checklist=CHECKLIST),
        lambda: workflow.approve(two, opp.pk, expected_row_version=version, checklist=CHECKLIST),
    )
    failures = [r for r in results if isinstance(r, WorkflowError)]
    assert len(failures) == 1 and failures[0].code in {"state_conflict", "invalid_transition"}
    assert len([r for r in results if not isinstance(r, Exception)]) == 1
    assert PublishingEvent.objects.filter(opportunity=opp, transition="T04").count() == 1


def test_two_publishers_racing_publish_exactly_once() -> None:
    author, editor = make("a2@example.org", "contributor"), make("e3@example.org", "editor")
    other = make("e4@example.org", "editor")
    world = build_world(make("adm2@example.org", "administrator"))
    opp = submitted(world, author)
    workflow.approve(editor, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    version = opp.row_version
    results = race(
        lambda: workflow.publish(editor, opp.pk, expected_row_version=version),
        lambda: workflow.publish(other, opp.pk, expected_row_version=version),
    )
    assert len([r for r in results if isinstance(r, WorkflowError)]) == 1
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED
    assert PublishingEvent.objects.filter(opportunity=opp, transition="T07").count() == 1
    assert opp.live_version.version_no == 1  # type: ignore[union-attr]


def test_withdraw_and_expiry_job_race_leaves_one_consistent_end_state() -> None:
    author, editor = make("a3@example.org", "contributor"), make("e5@example.org", "editor")
    approver = make("e6@example.org", "editor")
    world = build_world(make("adm3@example.org", "administrator"))
    opp = submitted(world, author)
    workflow.approve(approver, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(editor, opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    from datetime import timedelta

    from django.utils import timezone

    far = timezone.now() + timedelta(days=3650)
    version = opp.row_version
    results = race(
        lambda: workflow.withdraw(
            editor, opp.pk, expected_row_version=version, reason="The issuer withdrew it."
        ),
        lambda: workflow.expire_due(far),
    )
    opp.refresh_from_db()
    assert opp.status in {ListingStatus.WITHDRAWN, ListingStatus.EXPIRED}
    assert PublishingEvent.objects.filter(opportunity=opp, transition__in=["T10", "T11"]).count() == 1
    assert not [r for r in results if isinstance(r, Exception) and not isinstance(r, WorkflowError)]
    assert Opportunity.objects.filter(pk=opp.pk).count() == 1
