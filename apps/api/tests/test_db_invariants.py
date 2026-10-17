"""The database re-asserts the editorial invariants, so a bug, a shell session or raw SQL cannot break them
(ERD §7, EDITORIAL_WORKFLOW §4)."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from accounts.models import User
from audit import services as audit
from catalog.models import Location
from opportunities import workflow
from opportunities.models import (
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    PublishingEvent,
    ReviewDecision,
    VerificationRecord,
    VersionLocation,
)
from tests.factories import CHECKLIST, World, approved, new_draft, submitted

pytestmark = pytest.mark.django_db


@contextmanager
def refused() -> Iterator[None]:
    """The statement must fail and leave the surrounding transaction usable."""
    with pytest.raises(IntegrityError), transaction.atomic():
        yield


def sql(statement: str, params: list[Any] | None = None) -> None:
    with connection.cursor() as cursor:
        cursor.execute(statement, params or [])


def test_frozen_revision_content_cannot_be_updated_or_deleted(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    with refused():
        sql(
            "UPDATE opportunities_opportunityversion SET title = 'Edited' WHERE id = %s",
            [opp.pending_version_id],
        )
    with refused():
        sql(
            "UPDATE opportunities_opportunityversion SET detail = '{}'::jsonb WHERE id = %s",
            [opp.pending_version_id],
        )
    with refused():
        sql("DELETE FROM opportunities_opportunityversion WHERE id = %s", [opp.pending_version_id])
    with refused():
        sql("DELETE FROM opportunities_opportunity WHERE id = %s", [opp.pk])


def test_rows_of_a_frozen_revision_cannot_change(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    version = opp.pending_version
    assert version is not None
    with refused():
        VersionLocation.objects.create(version=version, location=Location.objects.get(slug="mutare"))
    with refused():
        version.locations.all().delete()
    with refused():
        version.sources.update(name="Changed")


def test_reviewer_cannot_be_the_author_even_through_the_orm(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author_editor"])
    version = opp.pending_version
    assert version is not None
    with refused():
        ReviewDecision.objects.create(
            version=version, decision="approved", checklist=CHECKLIST,
            content_hash=bytes(version.content_hash or b""), decided_by=people["author_editor"],
        )  # fmt: skip
    with refused():
        VerificationRecord.objects.create(
            opportunity=opp, version=version, level="source_checked", method="source_page_review",
            outcome="confirmed", evidence_note="Looked at the source page.", checked_by=people["author_editor"],
        )  # fmt: skip


def test_a_review_must_record_the_exact_content_hash(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    version = opp.pending_version
    assert version is not None
    with refused():
        ReviewDecision.objects.create(
            version=version, decision="approved", checklist=CHECKLIST,
            content_hash=b"\x00" * 32, decided_by=people["editor"],
        )  # fmt: skip


def test_revision_cannot_skip_approval_or_be_approved_by_its_author(
    world: World, people: dict[str, User]
) -> None:
    opp = submitted(world, people["author_editor"])
    vid = opp.pending_version_id
    with refused():  # in_review -> published is not a legal state change
        sql("UPDATE opportunities_opportunityversion SET state = 'published', published_by_id = %s WHERE id = %s",
            [people["editor"].pk, vid])  # fmt: skip
    with refused():  # the author "approving" through SQL, with no recorded review
        sql("UPDATE opportunities_opportunityversion SET state = 'approved', approved_by_id = %s WHERE id = %s",
            [people["author_editor"].pk, vid])  # fmt: skip
    assert vid is not None
    assert OpportunityVersion.objects.get(pk=vid).state == "in_review"


def test_publication_needs_a_recorded_approval_by_someone_else(world: World, people: dict[str, User]) -> None:
    opp = approved(world, people["author_editor"], people["editor"])
    vid = opp.pending_version_id
    with refused():  # approval names the author instead of the real approver
        sql("UPDATE opportunities_opportunityversion SET state = 'published', published_by_id = %s, approved_by_id = %s WHERE id = %s",
            [people["author_editor"].pk, people["author_editor"].pk, vid])  # fmt: skip
    with refused():  # no publisher recorded
        sql("UPDATE opportunities_opportunityversion SET state = 'published' WHERE id = %s", [vid])


def test_only_one_open_revision_and_one_live_revision(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    first = opp.pending_version
    assert first is not None
    with refused():
        OpportunityVersion.objects.create(
            opportunity=opp, version_no=2, author=people["author"], organisation=first.organisation
        )


def test_slug_and_category_are_immutable(world: World, people: dict[str, User]) -> None:
    opp = approved(world, people["author"], people["editor"])
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    with refused():
        sql("UPDATE opportunities_opportunity SET slug = 'something-else-123456' WHERE id = %s", [opp.pk])
    with refused():
        sql(
            "UPDATE opportunities_opportunity SET category_id = (SELECT id FROM catalog_category WHERE code = 'grants') WHERE id = %s",
            [opp.pk],
        )
    with refused():
        sql("UPDATE opportunities_opportunity SET id = %s WHERE id = %s", [uuid.uuid4(), opp.pk])


def test_history_review_and_verification_rows_are_append_only(world: World, people: dict[str, User]) -> None:
    opp = approved(world, people["author"], people["editor"])
    workflow.record_verification(
        people["editor2"], opp.pk, version_no=1, level="source_checked", method="source_page_review",
        outcome="confirmed", evidence_note="Compared the listing with the issuer notice.",
    )  # fmt: skip
    for table in (
        "opportunities_reviewdecision",
        "opportunities_verificationrecord",
        "opportunities_publishingevent",
    ):
        with refused():
            sql(f"DELETE FROM {table}")  # noqa: S608
        with refused():
            sql(f"UPDATE {table} SET id = id")  # noqa: S608
    assert PublishingEvent.objects.filter(opportunity=opp).exists()


def test_audit_log_is_append_only(people: dict[str, User]) -> None:
    event = audit.record(action="test.event", object_type="x", object_id=None, actor_id=people["admin"].pk)
    with refused():
        sql("UPDATE audit_auditevent SET action = 'tampered' WHERE id = %s", [event.pk])
    with refused():
        sql("DELETE FROM audit_auditevent WHERE id = %s", [event.pk])


def test_check_constraints_reject_inconsistent_content(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    vid = opp.pending_version_id
    with refused():
        sql(
            "UPDATE opportunities_opportunityversion SET salary_min = 5, salary_max = 1, salary_currency = 'USD', salary_period = 'month' WHERE id = %s",
            [vid],
        )
    with refused():  # an amount without a currency is never defaulted
        sql("UPDATE opportunities_opportunityversion SET salary_currency = NULL WHERE id = %s", [vid])
    with refused():  # a deadline without a time zone
        sql("UPDATE opportunities_opportunityversion SET deadline_timezone = NULL WHERE id = %s", [vid])
    with refused():  # published status needs a live revision and a slug
        sql("UPDATE opportunities_opportunity SET status = 'published' WHERE id = %s", [opp.pk])
    with refused():  # archived needs a reason
        sql("UPDATE opportunities_opportunity SET status = 'archived' WHERE id = %s", [opp.pk])
    assert Opportunity.objects.get(pk=opp.pk).status == ListingStatus.DRAFT


def test_content_hash_is_stable_and_changes_with_content(world: World, people: dict[str, User]) -> None:
    from opportunities import content

    one = new_draft(world, people["author"], "jobs-1")
    version = one.pending_version
    assert version is not None
    first = content.content_hash(version)
    assert first == content.content_hash(OpportunityVersion.objects.get(pk=version.pk))
    version.title = "A different title"
    assert content.content_hash(version) != first
    assert timezone.now()  # keep the import used
