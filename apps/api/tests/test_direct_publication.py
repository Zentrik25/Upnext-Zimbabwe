"""Direct publication by staff authors (D-46, ADR-0024): the one place a person approves their own work.

The service decides first; the database triggers re-check, so these tests also try to get the same result
around the service.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from employers.models import EmployerListing
from opportunities import content as content_mod
from opportunities import workflow
from opportunities.errors import (
    InvalidTransition,
    PermissionDeniedError,
    SeparationOfDuties,
    ValidationFailed,
)
from opportunities.models import (
    Decision,
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    PublishingEvent,
    ReviewDecision,
    VerificationLevel,
    VersionState,
)
from tests.factories import CHECKLIST, World, new_draft, published

pytestmark = pytest.mark.django_db


def go(actor: User, opp: Opportunity, **kwargs: object) -> Opportunity:
    return workflow.publish_direct(
        actor,
        opp.pk,
        expected_row_version=opp.row_version,
        checklist=CHECKLIST,
        **kwargs,  # type: ignore[arg-type]
    )


@pytest.mark.parametrize("who", ["author_editor", "author_admin", "editor", "admin"])
def test_editor_or_administrator_publishes_their_own_draft_in_one_step(
    world: World, people: dict[str, User], who: str
) -> None:
    actor = people[who]
    opp = new_draft(world, actor)
    go(actor, opp)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED and opp.slug and opp.live_version_id
    version = opp.live_version
    assert version is not None
    assert version.state == VersionState.PUBLISHED and version.direct_publication
    assert version.author_id == version.approved_by_id == version.published_by_id == actor.pk
    decision = ReviewDecision.objects.get(version=version)
    assert decision.decision == Decision.APPROVED and decision.checklist["direct_publication"] is True
    assert opp.verification_level == VerificationLevel.NOT_VERIFIED  # publishing never verifies (D-14)


def test_direct_publication_is_audited_as_direct_and_self_approved(
    world: World, people: dict[str, User]
) -> None:
    actor = people["editor"]
    opp = new_draft(world, actor)
    go(actor, opp)
    event = PublishingEvent.objects.get(opportunity=opp, transition="T07")
    assert event.actor_id == actor.pk and event.to_status == ListingStatus.PUBLISHED
    audit = AuditEvent.objects.get(object_id=opp.pk, action="opportunity.publish_direct")
    assert audit.changes is not None
    assert audit.changes["direct_publication"] is True and audit.changes["self_approved"] is True
    assert audit.changes["capacity"] == "editor"


def test_the_ordinary_two_person_path_is_unchanged(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    assert opp.live_version is not None and not opp.live_version.direct_publication
    assert opp.live_version.approved_by_id != opp.live_version.author_id


def test_a_contributor_cannot_publish_directly(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    with pytest.raises(PermissionDeniedError):
        go(people["author"], opp)
    with pytest.raises(PermissionDeniedError):
        go(people["seeker"], opp)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.DRAFT


def test_only_the_author_of_the_draft_can_publish_it_directly(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    with pytest.raises(InvalidTransition):
        go(people["editor"], opp)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.DRAFT


def test_every_checklist_item_is_required(world: World, people: dict[str, User]) -> None:
    actor = people["editor"]
    opp = new_draft(world, actor)
    for checklist in ({}, {"source_reviewed": True}, {**CHECKLIST, "content_matches_source": False}):
        with pytest.raises(ValidationFailed):
            workflow.publish_direct(actor, opp.pk, expected_row_version=opp.row_version, checklist=checklist)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.DRAFT


def test_incomplete_content_is_refused_like_any_submission(world: World, people: dict[str, User]) -> None:
    actor = people["editor"]
    opp = new_draft(world, actor)
    version = opp.pending_version
    assert version is not None
    version.application_url = None
    version.application_email = None
    version.application_instructions = None
    version.save()
    with pytest.raises(ValidationFailed):
        go(actor, opp)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.DRAFT


def test_employer_owned_listings_never_publish_directly(world: World, people: dict[str, User]) -> None:
    actor = people["editor"]
    opp = new_draft(world, actor)
    version = opp.pending_version
    assert version is not None
    EmployerListing.objects.create(opportunity=opp, organisation=version.organisation, created_by=actor)
    with pytest.raises(SeparationOfDuties):
        go(actor, opp)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.DRAFT
    assert AuditEvent.objects.filter(
        object_id=opp.pk, action="opportunity.publish_direct.denied", severity="security"
    ).exists()


def test_the_listing_can_be_amended_by_another_editor_and_that_editor_publishes_directly(
    world: World, people: dict[str, User]
) -> None:
    first = people["editor"]
    opp = new_draft(world, first)
    go(first, opp)
    opp.refresh_from_db()
    other = people["editor2"]
    workflow.amend(other, opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.save_draft(
        other,
        opp.pk,
        expected_row_version=opp.row_version,
        content={"summary": "Updated summary for the amended listing."},
    )
    opp.refresh_from_db()
    go(other, opp)
    opp.refresh_from_db()
    assert (
        opp.live_version is not None
        and opp.live_version.summary == "Updated summary for the amended listing."
    )
    assert opp.live_version.direct_publication and opp.live_version.author_id == other.pk


def test_direct_publication_does_not_verify_the_listing(world: World, people: dict[str, User]) -> None:
    """Publishing and verifying are separate switches (D-62): a directly published listing is live and Not Verified
    until someone with the verification permission turns it on, and then it can be turned off again."""
    actor = people["editor"]
    opp = new_draft(world, actor)
    go(actor, opp)
    opp.refresh_from_db()
    assert opp.status == "published" and opp.is_verified is False
    with pytest.raises(PermissionDeniedError):
        workflow.set_verification(
            people["author"], opp.pk, verified=True
        )  # a Contributor has no such permission
    workflow.set_verification(actor, opp.pk, verified=True)
    opp.refresh_from_db()
    assert opp.is_verified and opp.verification_level == VerificationLevel.ISSUER_VERIFIED
    assert opp.verification_changed_by_id == actor.pk and opp.verification_changed_at is not None


def test_actions_offered_include_direct_publication_for_the_author_only(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["editor"])
    assert "publish_direct" in workflow.allowed_actions(people["editor"], opp)
    assert "publish_direct" not in workflow.allowed_actions(people["editor2"], opp)
    assert "publish_direct" not in workflow.allowed_actions(
        people["author"], new_draft(world, people["author"])
    )


# --- the database re-checks it: the same result around the service is refused ------------------------
def _freeze(version: OpportunityVersion, by: User, *, direct: bool) -> None:
    version.direct_publication = direct
    version.content_hash = content_mod.content_hash(version)
    version.state = VersionState.IN_REVIEW
    version.submitted_by = by
    version.submitted_at = timezone.now()
    version.save()


def _self_approve(version: OpportunityVersion, by: User) -> None:
    ReviewDecision.objects.create(
        version=version,
        decision=Decision.APPROVED,
        content_hash=bytes(version.content_hash or b""),
        decided_by=by,
    )


def test_database_refuses_self_approval_of_an_unflagged_revision(
    world: World, people: dict[str, User]
) -> None:
    actor = people["editor"]
    version = new_draft(world, actor).pending_version
    assert version is not None
    _freeze(version, actor, direct=False)
    with pytest.raises(IntegrityError), transaction.atomic():
        _self_approve(version, actor)


def test_database_accepts_self_approval_only_for_a_flagged_revision_of_an_editor(
    world: World, people: dict[str, User]
) -> None:
    actor = people["editor"]
    version = new_draft(world, actor).pending_version
    assert version is not None
    _freeze(version, actor, direct=True)
    _self_approve(version, actor)  # allowed: flagged, author is an active editor, no employer owns it


def test_database_refuses_a_flagged_revision_whose_author_holds_no_publishing_role(
    world: World, people: dict[str, User]
) -> None:
    actor = people["author"]  # contributor
    version = new_draft(world, actor).pending_version
    assert version is not None
    _freeze(version, actor, direct=True)
    with pytest.raises(IntegrityError), transaction.atomic():
        _self_approve(version, actor)


def test_database_refuses_a_flagged_revision_of_an_employer_listing(
    world: World, people: dict[str, User]
) -> None:
    actor = people["editor"]
    opp = new_draft(world, actor)
    version = opp.pending_version
    assert version is not None
    EmployerListing.objects.create(opportunity=opp, organisation=version.organisation, created_by=actor)
    _freeze(version, actor, direct=True)
    with pytest.raises(IntegrityError), transaction.atomic():
        _self_approve(version, actor)


def test_database_refuses_a_flagged_self_rejection_or_return_decision(
    world: World, people: dict[str, User]
) -> None:
    actor = people["editor"]
    version = new_draft(world, actor).pending_version
    assert version is not None
    _freeze(version, actor, direct=True)
    with pytest.raises(IntegrityError), transaction.atomic():
        ReviewDecision.objects.create(
            version=version, decision=Decision.REJECTED, reason="x" * 12,
            content_hash=bytes(version.content_hash or b""), decided_by=actor,
        )  # fmt: skip


def test_the_api_client_import_is_available() -> None:
    assert APIClient is not None


def test_a_listing_with_no_source_publishes_and_an_old_source_does_not_block_an_amendment(
    world: World, people: dict[str, User]
) -> None:
    """Staff no longer enter sources (D-62): none is needed, and an existing one is kept as history."""
    actor = people["editor"]
    bare = new_draft(world, actor, "jobs-1", sources=[])
    go(actor, bare)
    bare.refresh_from_db()
    assert bare.status == ListingStatus.PUBLISHED and bare.live_version is not None
    assert not bare.live_version.sources.exists()

    _, example = world.content("jobs-2")
    three_years_ago = (timezone.now().date() - timedelta(days=1100)).isoformat()
    old_source = [{**example["sources"][0], "observed_on": three_years_ago}]
    kept = new_draft(world, actor, "jobs-2", sources=old_source)
    go(actor, kept)  # a source checked years ago no longer blocks publication
    kept.refresh_from_db()
    assert kept.live_version is not None and kept.live_version.sources.count() == 1
    workflow.amend(
        actor, kept.pk, expected_row_version=kept.row_version
    )  # the source is copied forward unchanged
    kept.refresh_from_db()
    assert kept.pending_version is not None and kept.pending_version.sources.count() == 1
    go(actor, kept)
    kept.refresh_from_db()
    assert kept.live_version is not None and kept.live_version.sources.count() == 1
