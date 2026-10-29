"""Editorial workflow, separation of duties and approval integrity (EDITORIAL_WORKFLOW, AC-EDIT-*)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.db import connection
from django.utils import timezone

from accounts.models import User
from audit.models import AuditEvent
from opportunities import validation, workflow
from opportunities.errors import (
    InvalidTransition,
    PermissionDeniedError,
    SeparationOfDuties,
    StateConflict,
    ValidationFailed,
    WorkflowError,
)
from opportunities.models import (
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    PublishingEvent,
    VerificationLevel,
    VersionState,
)
from tests.factories import CHECKLIST, World, approved, new_draft, published, submitted

pytestmark = pytest.mark.django_db


def fresh(opportunity: Opportunity) -> Opportunity:
    opportunity.refresh_from_db()
    return opportunity


# --- the happy path (AC-EDIT-02) ------------------------------------------------------------------
def test_two_people_are_enough_to_publish(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    assert opp.status == ListingStatus.DRAFT and opp.slug is None
    workflow.submit(people["author"], opp.pk, expected_row_version=fresh(opp).row_version)
    assert fresh(opp).status == ListingStatus.IN_REVIEW
    workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    assert fresh(opp).status == ListingStatus.APPROVED
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    assert opp.status == ListingStatus.PUBLISHED
    assert opp.slug and opp.first_published_at and opp.live_version_id
    assert opp.pending_version_id is None
    assert opp.live_version.state == VersionState.PUBLISHED
    assert opp.verification_level == VerificationLevel.NOT_VERIFIED  # publishing never verifies (D-14)


def test_administrator_may_approve_and_publish_someone_elses_listing(
    world: World, people: dict[str, User]
) -> None:
    opp = submitted(world, people["author"])
    workflow.approve(people["admin"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    fresh(opp)
    workflow.publish(people["admin"], opp.pk, expected_row_version=opp.row_version)
    assert fresh(opp).status == ListingStatus.PUBLISHED
    events = AuditEvent.objects.filter(
        object_id=opp.pk, action__in=["opportunity.approve", "opportunity.publish"]
    )
    assert {e.changes["capacity"] for e in events if e.changes} == {"administrator"}  # AC-EDIT-03


# --- nobody approves their own work (AC-EDIT-01) -----------------------------------------------------
@pytest.mark.parametrize("who", ["author_editor", "author_admin"])
def test_author_cannot_approve_reject_or_verify_their_own_submission(
    world: World, people: dict[str, User], who: str
) -> None:
    actor = people[who]
    opp = submitted(world, actor)
    before = opp.row_version
    with pytest.raises(SeparationOfDuties):
        workflow.approve(actor, opp.pk, expected_row_version=before, checklist=CHECKLIST)
    with pytest.raises(SeparationOfDuties):
        workflow.reject(
            actor, opp.pk, expected_row_version=before, reason_code="x", reason="Not good enough yet."
        )
    with pytest.raises(SeparationOfDuties):
        workflow.record_verification(
            actor, opp.pk, version_no=1, level="source_checked", method="source_page_review",
            outcome="confirmed", evidence_note="Looked at the source page and it matches.",
        )  # fmt: skip
    fresh(opp)
    assert opp.status == ListingStatus.IN_REVIEW and opp.row_version == before
    denied = AuditEvent.objects.filter(object_id=opp.pk, action__endswith=".denied", severity="security")
    assert denied.count() == 3  # every refused attempt is evidence
    assert {e.changes["code"] for e in denied if e.changes} == {"separation_of_duties"}


def test_submitter_in_the_chain_cannot_review_even_without_authoring(
    world: World, people: dict[str, User]
) -> None:
    """The chain includes whoever submitted, not only whoever wrote."""
    opp = submitted(world, people["author_editor"])
    version = opp.pending_version
    assert version is not None
    assert people["author_editor"].pk in workflow.chain_author_ids(version)


def test_contributor_without_editor_authority_cannot_approve(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    with pytest.raises(PermissionDeniedError):
        workflow.approve(people["author"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    with pytest.raises(PermissionDeniedError):
        workflow.approve(people["seeker"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)


def test_editors_write_their_own_drafts_but_not_other_peoples(world: World, people: dict[str, User]) -> None:
    """D-46 replaces AC-EDIT-05: Editors and Administrators author listings; a draft stays its author's."""
    _, content = world.content("jobs-1")
    own = workflow.create_draft(people["editor"], category_code="jobs", content=content)
    own.refresh_from_db()
    workflow.save_draft(
        people["editor"], own.pk, expected_row_version=own.row_version, content={"title": "Changed"}
    )
    theirs = new_draft(world, people["author"])
    with pytest.raises(PermissionDeniedError):
        workflow.save_draft(
            people["editor"], theirs.pk, expected_row_version=theirs.row_version, content={"title": "Changed"}
        )
    with pytest.raises(PermissionDeniedError):
        workflow.create_draft(people["seeker"], category_code="jobs", content=content)


# --- the author may publish only after another person approved the exact revision (AC-EDIT-04) ------
def test_author_with_publish_authority_publishes_after_another_persons_approval(
    world: World, people: dict[str, User]
) -> None:
    author = people["author_editor"]
    opp = approved(world, author, people["editor"])
    workflow.publish(author, opp.pk, expected_row_version=opp.row_version)
    assert fresh(opp).status == ListingStatus.PUBLISHED
    assert opp.live_version.published_by_id == author.pk  # type: ignore[union-attr]
    assert opp.live_version.approved_by_id == people["editor"].pk  # type: ignore[union-attr]


def test_author_cannot_publish_an_unapproved_revision(world: World, people: dict[str, User]) -> None:
    author = people["author_editor"]
    opp = submitted(world, author)
    with pytest.raises(InvalidTransition):
        workflow.publish(author, opp.pk, expected_row_version=opp.row_version)
    draft = new_draft(world, author, "internships-1")
    with pytest.raises(InvalidTransition):
        workflow.publish(author, draft.pk, expected_row_version=draft.row_version)
    assert fresh(opp).status == ListingStatus.IN_REVIEW


def test_a_third_person_can_publish_and_publish_is_not_repeatable(
    world: World, people: dict[str, User]
) -> None:
    opp = approved(world, people["author"], people["editor"])
    workflow.publish(people["editor2"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    with pytest.raises(InvalidTransition):
        workflow.publish(people["editor2"], opp.pk, expected_row_version=opp.row_version)


def test_contributor_only_author_cannot_publish_their_approved_listing(
    world: World, people: dict[str, User]
) -> None:
    opp = approved(world, people["author"], people["editor"])
    with pytest.raises(PermissionDeniedError):
        workflow.publish(people["author"], opp.pk, expected_row_version=opp.row_version)


# --- material edits invalidate approval (AC-EDIT-06) ---------------------------------------------------
def test_approved_content_cannot_be_edited_and_a_change_needs_a_new_review(
    world: World, people: dict[str, User]
) -> None:
    author = people["author_editor"]
    opp = published(world, people["author"], people["editor"], example="jobs-1")
    old_version = opp.live_version
    assert old_version is not None
    with pytest.raises(InvalidTransition):  # nothing is open to edit
        workflow.save_draft(
            people["author"], opp.pk, expected_row_version=opp.row_version, content={"title": "Edited title"}
        )
    workflow.amend(author, opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    workflow.save_draft(
        author,
        opp.pk,
        expected_row_version=opp.row_version,
        content={"summary": "A materially different summary of the post."},
    )
    fresh(opp)
    workflow.submit(author, opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    # The earlier approval cannot publish the amendment: it was another revision.
    with pytest.raises(InvalidTransition):
        workflow.publish(author, opp.pk, expected_row_version=opp.row_version)
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    fresh(opp)
    workflow.publish(author, opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    assert opp.live_version.version_no == 2  # type: ignore[union-attr]
    old_version.refresh_from_db()
    assert old_version.state == VersionState.SUPERSEDED
    assert opp.verification_level == VerificationLevel.NOT_VERIFIED  # not carried over (P2-08)


def test_amendment_authored_by_someone_else_may_be_reviewed_by_the_original_author(
    world: World, people: dict[str, User]
) -> None:
    """The chain stops at the published revision, so the original author is not in the amendment's chain."""
    original_author = people["author_editor"]
    opp = published(world, original_author, people["editor"])
    workflow.amend(people["author"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    workflow.save_draft(
        people["author"],
        opp.pk,
        expected_row_version=opp.row_version,
        content={"summary": "Updated summary of this vacancy for review."},
    )
    fresh(opp)
    workflow.submit(people["author"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    workflow.approve(original_author, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    with pytest.raises(PermissionDeniedError):  # the amendment's author has no approval authority
        workflow.approve(
            people["author"], opp.pk, expected_row_version=fresh(opp).row_version, checklist=CHECKLIST
        )


def test_tampered_content_after_approval_blocks_publication(world: World, people: dict[str, User]) -> None:
    """Even a privileged SQL edit that bypasses the triggers is caught by the hash comparison."""
    opp = approved(world, people["author"], people["editor"])
    version_id = opp.pending_version_id
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute("ALTER TABLE opportunities_opportunityversion DISABLE TRIGGER USER")
        cursor.execute(
            "UPDATE opportunities_opportunityversion SET title = 'A different title entirely' WHERE id = %s",
            [version_id],
        )
        cursor.execute("ALTER TABLE opportunities_opportunityversion ENABLE TRIGGER USER")
    with pytest.raises(WorkflowError) as excinfo:
        workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    assert excinfo.value.code == "approval_stale"
    assert fresh(opp).status == ListingStatus.APPROVED
    assert AuditEvent.objects.filter(
        object_id=opp.pk, action="opportunity.publish.denied", severity="security"
    ).exists()


def test_return_voids_the_approval(world: World, people: dict[str, User]) -> None:
    opp = approved(world, people["author"], people["editor"])
    workflow.return_approved(
        people["editor2"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="source",
        reason="The source no longer shows this post.",
    )
    fresh(opp)
    assert opp.status == ListingStatus.REJECTED
    with pytest.raises(InvalidTransition):
        workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)


# --- rejection, reopening and discarding ----------------------------------------------------------------
def test_reject_reopen_resubmit_and_approve_by_a_different_person(
    world: World, people: dict[str, User]
) -> None:
    author = people["author"]
    opp = submitted(world, author)
    with pytest.raises(ValidationFailed):  # a reason is mandatory
        workflow.reject(
            people["editor"], opp.pk, expected_row_version=opp.row_version, reason_code="x", reason="short"
        )
    workflow.reject(
        people["editor"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="source",
        reason="The cited source does not show a deadline.",
    )
    fresh(opp)
    assert opp.status == ListingStatus.REJECTED
    workflow.reopen(author, opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    assert opp.status == ListingStatus.DRAFT and opp.pending_version.version_no == 2  # type: ignore[union-attr]
    assert opp.pending_version.locations.count() == 1  # type: ignore[union-attr]
    workflow.submit(author, opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)


def test_discard_archives_a_never_published_listing(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    with pytest.raises(PermissionDeniedError):
        workflow.discard(people["author_editor"], opp.pk, expected_row_version=opp.row_version)
    workflow.discard(people["author"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    assert opp.status == ListingStatus.ARCHIVED and opp.archive_reason == "abandoned"


def test_discarding_an_amendment_leaves_the_live_listing_alone(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    workflow.amend(people["author"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    with pytest.raises(WorkflowError) as excinfo:
        workflow.amend(people["author_editor"], opp.pk, expected_row_version=opp.row_version)
    assert excinfo.value.code == "amendment_already_open"
    workflow.discard(people["author"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    assert opp.status == ListingStatus.PUBLISHED and opp.pending_version_id is None


# --- concurrency, staleness and invalid transitions ---------------------------------------------------
def test_stale_row_version_is_a_conflict(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    stale = opp.row_version - 1
    with pytest.raises(StateConflict):
        workflow.approve(people["editor"], opp.pk, expected_row_version=stale, checklist=CHECKLIST)


def test_unavailable_actions_are_invalid_transitions(world: World, people: dict[str, User]) -> None:
    draft = new_draft(world, people["author"])
    with pytest.raises(InvalidTransition):
        workflow.approve(
            people["editor"], draft.pk, expected_row_version=draft.row_version, checklist=CHECKLIST
        )
    workflow.submit(people["author"], draft.pk, expected_row_version=draft.row_version)
    fresh(draft)
    with pytest.raises(InvalidTransition):
        workflow.submit(people["author"], draft.pk, expected_row_version=draft.row_version)
    with pytest.raises(InvalidTransition):
        workflow.withdraw(
            people["editor"],
            draft.pk,
            expected_row_version=draft.row_version,
            reason="Not live, cannot withdraw.",
        )


def test_approve_requires_the_whole_checklist(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    with pytest.raises(ValidationFailed):
        workflow.approve(
            people["editor"],
            opp.pk,
            expected_row_version=opp.row_version,
            checklist={"source_reviewed": True},
        )
    with pytest.raises(ValidationFailed):
        workflow.approve(
            people["editor"],
            opp.pk,
            expected_row_version=opp.row_version,
            checklist={**CHECKLIST, "extra": True},
        )


def test_applicant_payment_text_needs_an_explicit_reviewer_acknowledgement(
    world: World, people: dict[str, User]
) -> None:
    opp = submitted(
        world,
        people["author"],
        "jobs-1",
        description_md="Pay a registration fee of USD 20 to be considered for this vacancy at the company. "
        * 2,
    )
    with pytest.raises(ValidationFailed):
        workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    workflow.approve(
        people["editor"],
        opp.pk,
        expected_row_version=opp.row_version,
        checklist={**CHECKLIST, "applicant_payment_reviewed": True},
    )


def test_tender_document_fees_are_not_flagged(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"], "tenders-1")
    workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)


# --- lifecycle after publication ------------------------------------------------------------------------
def test_withdraw_expire_archive_and_takedown(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    with pytest.raises(ValidationFailed):
        workflow.withdraw(people["editor"], opp.pk, expected_row_version=opp.row_version, reason="short")
    with pytest.raises(PermissionDeniedError):
        workflow.withdraw(
            people["author"],
            opp.pk,
            expected_row_version=opp.row_version,
            reason="The issuer withdrew this post.",
        )
    workflow.withdraw(
        people["editor"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason="The issuer withdrew this post.",
    )
    fresh(opp)
    assert opp.status == ListingStatus.WITHDRAWN and opp.closed_at
    workflow.archive(people["editor2"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    assert opp.status == ListingStatus.ARCHIVED and opp.archive_reason == "housekeeping"
    with pytest.raises(InvalidTransition):
        workflow.takedown(
            people["editor"],
            opp.pk,
            expected_row_version=opp.row_version,
            reason_code="legal",
            reason="Legal request received.",
        )


def test_takedown_is_a_single_person_action_with_a_reason(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    with pytest.raises(ValidationFailed):
        workflow.takedown(
            people["editor"],
            opp.pk,
            expected_row_version=opp.row_version,
            reason_code="nonsense",
            reason="A reason that is long enough.",
        )
    workflow.takedown(
        people["admin"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="fraud",
        reason="Reported as a fraudulent notice.",
    )
    fresh(opp)
    assert opp.status == ListingStatus.ARCHIVED and opp.archive_reason == "takedown"


def test_expiry_job_expires_only_past_deadlines_and_is_idempotent(
    world: World, people: dict[str, User]
) -> None:
    with_deadline = published(world, people["author"], people["editor"], example="jobs-1")
    unknown = published(world, people["author"], people["editor"], example="jobs-2")
    assert with_deadline.live_version.deadline_at is not None  # type: ignore[union-attr]
    assert unknown.live_version.deadline_at is None  # type: ignore[union-attr]
    assert workflow.expire_due() == 0
    far = timezone.now() + timedelta(days=3650)
    assert workflow.expire_due(far) == 1
    assert workflow.expire_due(far) == 0
    assert fresh(with_deadline).status == ListingStatus.EXPIRED
    assert fresh(unknown).status == ListingStatus.PUBLISHED  # unknown deadline: never auto-expired
    event = PublishingEvent.objects.get(opportunity=with_deadline, transition="T11")
    assert event.actor_type == "system" and event.actor_id is None


def test_expired_listing_can_be_reinstated_through_an_amendment(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    workflow.expire(
        people["editor"], opp.pk, expected_row_version=opp.row_version, reason="Closed ahead of the deadline."
    )
    fresh(opp)
    workflow.amend(people["author"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    workflow.submit(people["author"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    fresh(opp)
    workflow.publish(people["editor2"], opp.pk, expected_row_version=opp.row_version)
    fresh(opp)
    assert opp.status == ListingStatus.PUBLISHED and opp.closed_at is None


def test_publish_refuses_a_deadline_that_has_passed_since_approval(
    world: World, people: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    opp = approved(world, people["author"], people["editor"])
    original = validation.validate_publishable
    later = timezone.now() + timedelta(days=3650)
    monkeypatch.setattr(
        workflow, "validate_publishable", lambda version, now=None: original(version, now=later)
    )
    with pytest.raises(WorkflowError) as excinfo:
        workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    assert excinfo.value.code in {"deadline_in_past", "validation_failed"}
    assert fresh(opp).status == ListingStatus.APPROVED


# --- verification is separate from provenance and publication (D-14) -----------------------------------
def test_verification_levels_and_methods(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    common: dict[str, Any] = {
        "version_no": 1,
        "outcome": "confirmed",
        "evidence_note": "Compared the listing with the issuer notice.",
    }
    with pytest.raises(ValidationFailed):  # a page review is never "verified with the issuer"
        workflow.record_verification(
            people["editor2"], opp.pk, level="issuer_verified", method="source_page_review", **common
        )
    workflow.record_verification(
        people["editor2"], opp.pk, level="source_checked", method="source_page_review", **common
    )
    assert fresh(opp).verification_level == VerificationLevel.SOURCE_CHECKED
    record = workflow.record_verification(
        people["admin"], opp.pk, level="issuer_verified", method="issuer_contact", **common
    )
    assert fresh(opp).verification_level == VerificationLevel.ISSUER_VERIFIED
    # A failed re-check supersedes the issuer record, so the level falls back to what remains.
    workflow.record_verification(
        people["admin"], opp.pk, version_no=1, level="issuer_verified", method="issuer_contact",
        outcome="discrepancy_found", evidence_note="The issuer says the closing date has changed.", supersedes_id=record.pk,
    )  # fmt: skip
    assert fresh(opp).verification_level == VerificationLevel.SOURCE_CHECKED


def test_verification_needs_an_evidence_note_and_a_staff_role(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    with pytest.raises(ValidationFailed):
        workflow.record_verification(
            people["editor2"],
            opp.pk,
            version_no=1,
            level="source_checked",
            method="source_page_review",
            outcome="confirmed",
            evidence_note="too short",
        )
    with pytest.raises(PermissionDeniedError):
        workflow.record_verification(
            people["seeker"],
            opp.pk,
            version_no=1,
            level="source_checked",
            method="source_page_review",
            outcome="confirmed",
            evidence_note="Compared the listing with the source.",
        )


# --- validation at submit -------------------------------------------------------------------------------
def test_submit_returns_every_publish_grade_failure_at_once(world: World, people: dict[str, User]) -> None:
    opp = new_draft(
        world, people["author"], "jobs-1", sources=[], locations=[], title="Hi", summary="Too short"
    )
    with pytest.raises(ValidationFailed) as excinfo:
        workflow.submit(people["author"], opp.pk, expected_row_version=opp.row_version)
    fields = excinfo.value.fields
    assert {"title", "summary", "locations", "sources"} <= set(fields)
    assert fields["sources"][0][0] == "source_required"
    assert fresh(opp).status == ListingStatus.DRAFT


def test_draft_save_rejects_unknown_and_malformed_fields(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    for bad in (
        {"unknown": 1},
        {"title": 5},
        {"work_mode": "sideways"},
        {"salary": {"min": "1", "bogus": 1}},
        {"application_url": "http://insecure.example.org"},
    ):
        with pytest.raises(ValidationFailed):
            workflow.save_draft(
                people["author"], opp.pk, expected_row_version=fresh(opp).row_version, content=bad
            )


def test_hard_duplicates_block_submit_unless_acknowledged(world: World, people: dict[str, User]) -> None:
    first = published(world, people["author"], people["editor"], example="jobs-1")
    second = new_draft(world, people["author_editor"], "jobs-1")
    with pytest.raises(WorkflowError) as excinfo:
        workflow.submit(people["author_editor"], second.pk, expected_row_version=second.row_version)
    assert excinfo.value.code == "duplicate_detected"
    workflow.submit(
        people["author_editor"], second.pk, expected_row_version=second.row_version,
        duplicate_acknowledgement={"duplicate_of": str(first.pk), "reason": "A second vacancy at a different branch."},
    )  # fmt: skip
    version = fresh(second).pending_version
    assert version is not None and version.duplicate_acknowledgement is not None
    assert version.duplicate_acknowledgement["duplicate_of"] == str(first.pk)


def test_tender_needs_a_closing_time_and_ordered_dates(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"], "tenders-1", deadline_at=None, deadline_timezone=None)
    with pytest.raises(ValidationFailed) as excinfo:
        workflow.submit(people["author"], opp.pk, expected_row_version=opp.row_version)
    assert "deadline_at" in excinfo.value.fields


# --- history and audit (AC-EDIT-08) ------------------------------------------------------------------------
def test_every_transition_writes_history_and_audit_in_the_same_transaction(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    transitions = list(PublishingEvent.objects.filter(opportunity=opp).values_list("transition", flat=True))
    assert transitions == ["T01", "T03", "T04", "T07"]
    audits = AuditEvent.objects.filter(object_id=opp.pk, severity="info")
    assert {a.action for a in audits} == {
        "opportunity.create",
        "opportunity.submit",
        "opportunity.approve",
        "opportunity.publish",
    }
    for audit in audits:
        assert audit.changes and {"transition", "from_status", "to_status", "capacity", "version_no"} <= set(
            audit.changes
        )
    assert OpportunityVersion.objects.filter(opportunity=opp).count() == 1


def test_allowed_actions_reflect_separation_of_duties(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author_editor"])
    assert "approve" not in workflow.allowed_actions(people["author_editor"], opp)
    assert {"approve", "reject"} <= set(workflow.allowed_actions(people["editor"], opp))
    assert workflow.allowed_actions(people["seeker"], opp) == []
