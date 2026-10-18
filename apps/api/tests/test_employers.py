"""Employer portal (Phase 6A, D-35): claims, verification, memberships, profiles, the employer path through the
publishing service, and the guarantee that none of it lets an employer bypass editorial review."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from access.registry import DEFAULT_REGISTRY, EMPLOYER_AUTHOR_PERMISSIONS, Permission
from accounts import deletion
from accounts.models import AccountStatus, User
from audit.models import AuditEvent
from catalog.models import Organisation
from employers import analytics, listings, services
from employers.models import (
    ClaimStatus,
    EmployerListing,
    EmployerMembership,
    MemberRole,
    OrganisationClaim,
    OrganisationVerification,
    ProfileState,
)
from opportunities import workflow
from opportunities.errors import (
    InvalidTransition,
    NotFoundError,
    PermissionDeniedError,
    SeparationOfDuties,
    ValidationFailed,
    WorkflowError,
)
from opportunities.models import ListingStatus, OpportunitySource, VersionState
from tests.factories import CHECKLIST, World

pytestmark = pytest.mark.django_db

CLAIM = {
    "organisation_name": "Acme Mining Zimbabwe",
    "website_url": "https://acme.example.org",
    "role_title": "HR manager",
    "evidence_note": "Our official address is hr@acme.example.org and our registration is on file.",
}
PROFILE = {
    "tagline": "Digging responsibly",
    "about": "Acme Mining is a fictional company used in tests. It describes itself in plain text only.",
    "size_band": "51-200",
    "founded_year": 1999,
    "location_text": "Bulawayo",
}


def claim_for(user: User, **over: Any) -> OrganisationClaim:
    return services.submit_claim(user, {**CLAIM, **over})


def verified_member(
    editor: User, member: User, *, name: str = "Acme Mining Zimbabwe", role: str = MemberRole.OWNER
) -> Organisation:
    claim = claim_for(member, organisation_name=name)
    services.decide_claim(
        editor,
        claim.pk,
        approve=True,
        method="document_review",
        evidence_note="Certificate seen and filed.",
        role=role,
    )
    claim.refresh_from_db()
    organisation = claim.organisation
    assert organisation is not None
    return organisation


def content(
    world: World, org: Organisation, example: str = "jobs-1", **over: Any
) -> tuple[str, dict[str, Any]]:
    category, data = world.content(example, organisation_id=str(org.pk), **over)
    data.pop("sources", None)
    return category, data


@pytest.fixture
def employer(make_user: Callable[..., User]) -> User:
    return make_user(email="employer@example.org", display_name="Employer One")


# --- claims -----------------------------------------------------------------------------------------
def test_a_claim_is_a_request_and_grants_nothing(employer: User) -> None:
    claim = claim_for(employer)
    assert claim.status == ClaimStatus.PENDING
    assert not EmployerMembership.objects.exists() and not OrganisationVerification.objects.exists()
    assert AuditEvent.objects.filter(action="employer.claim.submitted", object_id=claim.pk).exists()
    assert not workflow_allows(employer)


def workflow_allows(user: User) -> bool:
    from employers.capability import is_employer

    return is_employer(user)


def test_claim_input_is_validated_and_limited(employer: User, make_user: Callable[..., User]) -> None:
    with pytest.raises(ValidationFailed) as bad:
        services.submit_claim(employer, {"organisation_name": "A", "evidence_note": "short", "extra": 1})
    assert {"organisation_name", "role_title", "evidence_note", "extra"} <= set(bad.value.fields)
    with pytest.raises(ValidationFailed):
        claim_for(employer, website_url="http://insecure.example.org")
    unconfirmed = make_user(email="new@example.org", status=AccountStatus.PENDING_VERIFICATION)
    with pytest.raises(PermissionDeniedError):
        claim_for(unconfirmed)
    for n in range(services.MAX_PENDING_CLAIMS):
        claim_for(employer, organisation_name=f"Company number {n}")
    with pytest.raises(WorkflowError) as many:
        claim_for(employer, organisation_name="One company too many")
    assert many.value.code == "too_many_claims"


def test_a_claim_on_an_existing_organisation_cannot_be_repeated_or_made_by_a_member(
    employer: User, people: dict[str, User], world: World
) -> None:
    org_id = world.organisations["0001"]
    claim = services.submit_claim(employer, {**CLAIM, "organisation_id": org_id})
    assert str(claim.organisation_id) == org_id and claim.organisation_name == "Example Power Services"
    with pytest.raises(WorkflowError) as again:
        services.submit_claim(employer, {**CLAIM, "organisation_id": org_id})
    assert again.value.code == "claim_pending"
    services.decide_claim(
        people["editor"],
        claim.pk,
        approve=True,
        method="phone_callback",
        evidence_note="Called the switchboard.",
    )
    with pytest.raises(WorkflowError) as member:
        services.submit_claim(employer, {**CLAIM, "organisation_id": org_id})
    assert member.value.code == "already_member"
    with pytest.raises(ValidationFailed):
        services.submit_claim(employer, {**CLAIM, "organisation_id": "00000000-0000-0000-0000-000000000000"})


def test_a_claimant_can_withdraw_only_their_own_waiting_claim(
    employer: User, make_user: Callable[..., User]
) -> None:
    claim = claim_for(employer)
    other = make_user()
    with pytest.raises(NotFoundError):
        services.withdraw_claim(other, claim.pk)
    assert services.withdraw_claim(employer, claim.pk).status == ClaimStatus.WITHDRAWN
    with pytest.raises(InvalidTransition):
        services.withdraw_claim(employer, claim.pk)


# --- deciding claims: verification, membership, separation ---------------------------------------------
def test_approval_records_how_the_organisation_was_verified_and_grants_membership(
    employer: User, people: dict[str, User]
) -> None:
    claim = claim_for(employer)
    services.decide_claim(
        people["editor"],
        claim.pk,
        approve=True,
        method="official_email_domain",
        evidence_note="Mail from the official domain, checked by an editor.",
    )
    claim.refresh_from_db()
    assert claim.status == ClaimStatus.APPROVED and claim.decided_by == people["editor"]
    org = claim.organisation
    assert org is not None and org.name == "Acme Mining Zimbabwe" and org.created_by == people["editor"]
    record = OrganisationVerification.objects.get(organisation=org)
    assert record.method == "official_email_domain" and record.verified_by == people["editor"]
    member = EmployerMembership.objects.get(user=employer)
    assert member.role == MemberRole.OWNER and member.granted_by == people["editor"]
    assert services.is_verified(org.pk) and workflow_allows(employer)
    actions = set(AuditEvent.objects.values_list("action", flat=True))
    assert {"employer.claim.approved", "employer.verification.recorded"} <= actions
    assert employer.is_staff is False  # an employer is not staff: no admin access
    assert employer.has_perm("opportunities.view_opportunity") is False


def test_verification_needs_a_method_and_evidence_when_the_organisation_has_none(
    employer: User, people: dict[str, User]
) -> None:
    claim = claim_for(employer)
    with pytest.raises(ValidationFailed) as missing:
        services.decide_claim(people["editor"], claim.pk, approve=True)
    assert {"method", "evidence_note"} <= set(missing.value.fields)
    claim.refresh_from_db()
    assert claim.status == ClaimStatus.PENDING and not EmployerMembership.objects.exists()


def test_a_second_member_of_a_verified_organisation_needs_no_new_verification(
    employer: User, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    org = verified_member(people["editor"], employer)
    colleague = make_user(email="colleague@example.org")
    claim = services.submit_claim(colleague, {**CLAIM, "organisation_id": str(org.pk)})
    services.decide_claim(people["editor2"], claim.pk, approve=True, role=MemberRole.RECRUITER)
    assert OrganisationVerification.objects.filter(organisation=org).count() == 1
    assert EmployerMembership.objects.get(user=colleague).role == MemberRole.RECRUITER


def test_only_reviewers_decide_and_never_their_own_claim(
    employer: User, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    claim = claim_for(employer)
    for who in (employer, people["author"], people["seeker"]):
        with pytest.raises(PermissionDeniedError):
            services.decide_claim(who, claim.pk, approve=True, method="other", evidence_note="1234567890")
    assert AuditEvent.objects.filter(action="employer.claim.decide.denied", severity="security").exists()
    editor_claim = claim_for(people["editor"], organisation_name="Editor Owned Company")
    with pytest.raises(SeparationOfDuties):
        services.decide_claim(
            people["editor"],
            editor_claim.pk,
            approve=True,
            method="other",
            evidence_note="self approval attempt",
        )
    assert not EmployerMembership.objects.exists()
    # a reviewer who acts for the organisation cannot verify it either
    org = verified_member(people["editor2"], make_user(email="o@example.org"), name="Beta Company")
    EmployerMembership.objects.create(user=people["editor"], organisation=org, role=MemberRole.RECRUITER)
    third = make_user(email="third@example.org")
    claim3 = services.submit_claim(third, {**CLAIM, "organisation_id": str(org.pk)})
    with pytest.raises(SeparationOfDuties):
        services.decide_claim(people["editor"], claim3.pk, approve=True)


def test_rejection_needs_a_reason_and_is_final(employer: User, people: dict[str, User]) -> None:
    claim = claim_for(employer)
    with pytest.raises(ValidationFailed):
        services.decide_claim(people["editor"], claim.pk, approve=False, reason="no")
    services.decide_claim(
        people["editor"], claim.pk, approve=False, reason="We could not confirm the registration."
    )
    claim.refresh_from_db()
    assert claim.status == ClaimStatus.REJECTED and claim.decision_reason
    with pytest.raises(InvalidTransition):
        services.decide_claim(
            people["editor"], claim.pk, approve=True, method="other", evidence_note="1234567890"
        )
    assert not EmployerMembership.objects.exists()


def test_revoking_verification_stops_posting_and_hides_the_profile(
    employer: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], employer)
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    for who in (people["editor"], employer):
        with pytest.raises(PermissionDeniedError):
            services.revoke_verification(who, org.pk, reason="Registration lapsed, see file.")
    services.revoke_verification(people["admin"], org.pk, reason="Registration lapsed, see file.")
    assert not services.is_verified(org.pk)
    opp.refresh_from_db()
    with pytest.raises(PermissionDeniedError) as refused:
        listings.submit(employer, opp.pk, opp.row_version)
    assert refused.value.code == "organisation_not_verified"
    with pytest.raises(PermissionDeniedError):
        services.submit_profile_revision(employer, org.pk, PROFILE)
    assert AuditEvent.objects.filter(action="employer.verification.revoked").exists()


def test_a_revoked_member_loses_access_at_once(employer: User, people: dict[str, User], world: World) -> None:
    org = verified_member(people["editor"], employer)
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    membership = EmployerMembership.objects.get(user=employer)
    with pytest.raises(PermissionDeniedError):
        services.revoke_membership(employer, membership.pk, reason="Leaving the company, thanks.")
    services.revoke_membership(people["editor"], membership.pk, reason="Left the company, confirmed by HR.")
    opp.refresh_from_db()
    with pytest.raises(NotFoundError):
        listings.submit(employer, opp.pk, opp.row_version)
    with pytest.raises(PermissionDeniedError) as direct:  # even calling the publishing service directly
        workflow.submit(employer, opp.pk, expected_row_version=opp.row_version)
    assert direct.value.code == "permission_denied"
    assert AuditEvent.objects.filter(action="opportunity.submit.denied").exists()


# --- the employer path through the publishing service ----------------------------------------------------------
def test_an_employer_cannot_hold_review_or_publication_authority() -> None:
    forbidden = {
        Permission.OPP_REVIEW_APPROVE,
        Permission.OPP_REVIEW_REJECT,
        Permission.OPP_REVIEW_RETURN,
        Permission.OPP_VERIFY_RECORD,
        Permission.OPP_PUBLISH,
        Permission.OPP_SCHEDULE,
        Permission.OPP_TAKEDOWN,
        Permission.OPP_WITHDRAW,
        Permission.OPP_EXPIRE,
        Permission.OPP_ARCHIVE,
        Permission.ORG_CREATE,
        Permission.ORG_EDIT,
        Permission.EMPLOYER_REVIEW,
        Permission.EMPLOYER_VERIFICATION_REVOKE,
    }
    assert not forbidden & EMPLOYER_AUTHOR_PERMISSIONS
    assert DEFAULT_REGISTRY.roles == {"contributor", "editor", "administrator"}  # no employer staff role


def test_a_verified_employer_drafts_submits_and_staff_publish(
    employer: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], employer)
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    assert EmployerListing.objects.get(opportunity=opp).organisation == org
    assert opp.status == ListingStatus.DRAFT
    version = listings.submit(employer, opp.pk, opp.row_version)
    opp.refresh_from_db()
    assert version.state == VersionState.IN_REVIEW and opp.status == ListingStatus.IN_REVIEW
    source = OpportunitySource.objects.get(version=version)
    assert source.is_primary and source.name.startswith("Submitted by the employer")
    assert opp.verification_level == "not_verified"  # being a verified organisation never verifies a listing
    # the employer cannot move it forward themselves, directly or through the service
    for step in (workflow.approve, workflow.reject, workflow.return_approved, workflow.publish):
        kwargs: dict[str, Any] = {"expected_row_version": opp.row_version}
        if step in (workflow.approve,):
            kwargs["checklist"] = CHECKLIST
        if step in (workflow.reject, workflow.return_approved):
            kwargs.update(reason_code="other", reason="Not allowed for employers at all.")
        with pytest.raises(PermissionDeniedError):
            step(employer, opp.pk, **kwargs)
    # staff approve and publish, as for any listing (D-18, D-22)
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor2"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED
    assert AuditEvent.objects.filter(action="opportunity.submit", object_id=opp.pk).exists()


def test_an_employer_cannot_post_for_another_organisation_or_in_other_categories(
    employer: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], employer)
    other = Organisation.objects.get(pk=world.organisations["0002"])
    category, data = content(world, other)
    with pytest.raises(PermissionDeniedError) as foreign:  # direct call with someone else's organisation id
        workflow.create_draft(employer, category_code=category, content=data)
    assert foreign.value.code == "not_a_member"
    with pytest.raises(NotFoundError):  # through the employer layer the organisation is not even addressable
        listings.create(employer, other.pk, category, data)
    category, data = content(world, org)
    created = listings.create(employer, org.pk, category, {**data, "organisation_id": str(other.pk)})
    assert (
        EmployerListing.objects.get(opportunity=created).organisation == org
    )  # the request value is ignored
    with pytest.raises(PermissionDeniedError) as organisation_fixed:
        workflow.save_draft(
            employer,
            created.pk,
            expected_row_version=created.row_version,
            content={"organisation_id": str(other.pk)},
        )
    assert organisation_fixed.value.code == "organisation_fixed"
    _, tender = world.content("tenders-1", organisation_id=str(org.pk))
    tender.pop("sources", None)
    with pytest.raises(PermissionDeniedError) as scope:
        workflow.create_draft(employer, category_code="tenders", content=tender)
    assert scope.value.code == "category_not_allowed"
    with pytest.raises(PermissionDeniedError) as sources:
        workflow.create_draft(employer, category_code=category, content={**data, "sources": []})
    assert sources.value.code == "sources_not_allowed"


def test_employers_see_and_change_only_their_own_organisations_listings(
    employer: User, people: dict[str, User], world: World, make_user: Callable[..., User]
) -> None:
    org = verified_member(people["editor"], employer)
    rival = make_user(email="rival@example.org")
    rival_org = verified_member(people["editor2"], rival, name="Rival Company")
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    for action in (listings.submit, listings.discard, listings.reopen, listings.amend):
        with pytest.raises(NotFoundError):
            action(rival, opp.pk, opp.row_version)
    with pytest.raises(NotFoundError):
        listings.save(rival, opp.pk, opp.row_version, {"title": "Hijacked title"})
    with pytest.raises(PermissionDeniedError):  # the service itself refuses a non-member too
        workflow.discard(rival, opp.pk, expected_row_version=opp.row_version)
    assert rival_org != org


def test_a_colleague_cannot_edit_a_draft_they_did_not_author(
    employer: User, people: dict[str, User], world: World, make_user: Callable[..., User]
) -> None:
    org = verified_member(people["editor"], employer)
    colleague = make_user(email="colleague@example.org")
    claim = services.submit_claim(colleague, {**CLAIM, "organisation_id": str(org.pk)})
    services.decide_claim(people["editor2"], claim.pk, approve=True, role=MemberRole.RECRUITER)
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    with pytest.raises(PermissionDeniedError) as other:
        listings.save(colleague, opp.pk, opp.row_version, {"title": "A different title"})
    assert other.value.code == "permission_denied"


def test_returned_and_rejected_work_can_be_reopened_and_published_work_amended(
    employer: User, people: dict[str, User], world: World
) -> None:
    org = verified_member(people["editor"], employer)
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    listings.submit(employer, opp.pk, opp.row_version)
    opp.refresh_from_db()
    workflow.reject(
        people["editor2"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="other",
        reason="The closing date is unclear.",
    )
    opp.refresh_from_db()
    assert listings.latest_decision(opp.pending_version)["reason"] == "The closing date is unclear."  # type: ignore[index]
    assert listings.next_actions(employer, opp) == ["reopen", "discard"]
    listings.reopen(employer, opp.pk, opp.row_version)
    opp.refresh_from_db()
    listings.submit(employer, opp.pk, opp.row_version)
    opp.refresh_from_db()
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert listings.next_actions(employer, opp) == ["amend"]
    draft = listings.amend(employer, opp.pk, opp.row_version)
    assert draft.author == employer and draft.state == VersionState.DRAFT
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED  # the live revision stays until staff publish the amendment


# --- company profiles -------------------------------------------------------------------------------------------
def test_profile_changes_are_moderated_and_decided_by_someone_else(
    employer: User, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    org = verified_member(people["editor"], employer)
    first = services.submit_profile_revision(employer, org.pk, PROFILE)
    assert first.state == ProfileState.PENDING and first.profile.live_revision is None
    second = services.submit_profile_revision(
        employer, org.pk, {**PROFILE, "tagline": "Digging more responsibly"}
    )
    first.refresh_from_db()
    assert first.state == ProfileState.WITHDRAWN and second.version_no == 2
    for who in (employer, people["seeker"], people["author"]):
        with pytest.raises(PermissionDeniedError):
            services.decide_profile_revision(who, second.pk, approve=True)
    with pytest.raises(ValidationFailed):
        services.decide_profile_revision(people["editor2"], second.pk, approve=False, reason="no")
    services.decide_profile_revision(people["editor2"], second.pk, approve=True)
    second.refresh_from_db()
    assert second.profile.live_revision == second and second.state == ProfileState.APPROVED
    third = services.submit_profile_revision(employer, org.pk, {**PROFILE, "tagline": "A newer tagline"})
    assert third.profile.live_revision == second  # the public text is unchanged until approval
    services.decide_profile_revision(people["editor"], third.pk, approve=True)
    second.refresh_from_db()
    assert second.state == ProfileState.SUPERSEDED


def test_a_reviewer_cannot_decide_a_profile_they_submitted(
    people: dict[str, User], make_user: Callable[..., User]
) -> None:
    org = verified_member(people["editor2"], people["editor"], name="Editors Own Company")
    revision = services.submit_profile_revision(people["editor"], org.pk, PROFILE)
    with pytest.raises(SeparationOfDuties):
        services.decide_profile_revision(people["editor"], revision.pk, approve=True)
    assert AuditEvent.objects.filter(action="employer.profile.decide.denied").exists()


def test_profile_rules_owner_membership_validation_and_withdrawal(
    employer: User, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    org = verified_member(people["editor"], employer)
    recruiter = make_user(email="recruiter@example.org")
    claim = services.submit_claim(recruiter, {**CLAIM, "organisation_id": str(org.pk)})
    services.decide_claim(people["editor2"], claim.pk, approve=True, role=MemberRole.RECRUITER)
    with pytest.raises(PermissionDeniedError) as owner_only:
        services.submit_profile_revision(recruiter, org.pk, PROFILE)
    assert owner_only.value.code == "owner_required"
    with pytest.raises(NotFoundError):
        services.submit_profile_revision(people["seeker"], org.pk, PROFILE)
    for bad in (
        {**PROFILE, "about": "too short"},
        {**PROFILE, "size_band": "huge"},
        {**PROFILE, "founded_year": 1500},
        {**PROFILE, "founded_year": timezone.now().year + 1},
        {**PROFILE, "sector_id": "00000000-0000-0000-0000-000000000000"},
        {**PROFILE, "unknown": "x"},
    ):
        with pytest.raises(ValidationFailed):
            services.submit_profile_revision(employer, org.pk, bad)
    revision = services.submit_profile_revision(employer, org.pk, PROFILE)
    with pytest.raises(NotFoundError):
        services.withdraw_profile_revision(recruiter, org.pk, "00000000-0000-0000-0000-000000000000")
    services.withdraw_profile_revision(employer, org.pk, revision.pk)
    revision.refresh_from_db()
    assert revision.state == ProfileState.WITHDRAWN
    with pytest.raises(InvalidTransition):
        services.withdraw_profile_revision(employer, org.pk, revision.pk)


# --- account deletion ---------------------------------------------------------------------------------------------
def test_deleting_an_employer_account_ends_their_roles(employer: User, people: dict[str, User]) -> None:
    verified_member(people["editor"], employer)
    pending = claim_for(employer, organisation_name="Another Company")
    deletion_user = User.objects.get(pk=employer.pk)
    deletion_user.deletion_requested_at = timezone.now() - timedelta(days=30)
    deletion_user.save()
    assert deletion.execute(employer.pk) is True
    assert not EmployerMembership.objects.filter(user=employer, revoked_at__isnull=True).exists()
    assert EmployerMembership.objects.get(user=employer).revoked_reason == "account deleted"
    pending.refresh_from_db()
    assert pending.status == ClaimStatus.WITHDRAWN


# --- analytics -----------------------------------------------------------------------------------------------------
def published_listing(employer: User, people: dict[str, User], world: World) -> tuple[Organisation, Any]:
    org = verified_member(people["editor"], employer)
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    listings.submit(employer, opp.pk, opp.row_version)
    opp.refresh_from_db()
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor2"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    return org, opp


def test_counters_are_aggregates_and_only_count_open_listings(
    employer: User, people: dict[str, User], world: World
) -> None:
    org, opp = published_listing(employer, people, world)
    today = timezone.now().date()
    for _ in range(3):
        assert analytics.record(opp.slug, "view") is True
    assert analytics.record(opp.slug, "apply") is True
    assert analytics.record(opp.slug, "nonsense") is False
    assert analytics.record("no-such-listing", "view") is False
    old = today - timedelta(days=20)
    assert analytics.record(opp.slug, "view", today=old) is True
    people["seeker"].saved_opportunities.create(opportunity=opp)
    (row,) = analytics.summary(org.pk, today=today)
    assert row["last_7_days"] == {"views": 3, "apply_clicks": 1}
    assert row["last_30_days"] == {"views": 4, "apply_clicks": 1}
    assert row["total"] == {"views": 4, "apply_clicks": 1}
    assert row["saves"] == 1
    assert "user" not in str(row) and "ip" not in row  # counts only
    draft_category, draft_data = content(world, org, "jobs-2")
    draft = listings.create(employer, org.pk, draft_category, draft_data)
    assert draft.slug is None  # unpublished listings have no public address to count against
    assert analytics.summary("00000000-0000-0000-0000-000000000000") == []


def test_a_member_of_another_organisation_cannot_continue_a_draft_of_one_they_left(
    employer: User, people: dict[str, User], world: World
) -> None:
    """The author check alone is not enough: authority is re-read from the membership each time."""
    org = verified_member(people["editor"], employer)
    category, data = content(world, org)
    opp = listings.create(employer, org.pk, category, data)
    services.revoke_membership(
        people["editor"],
        EmployerMembership.objects.get(user=employer).pk,
        reason="Moved to another employer.",
    )
    verified_member(people["editor2"], employer, name="New Employer Ltd")  # still an employer, elsewhere
    opp.refresh_from_db()
    for call in (
        lambda: workflow.submit(employer, opp.pk, expected_row_version=opp.row_version),
        lambda: workflow.save_draft(employer, opp.pk, expected_row_version=opp.row_version, content={}),
        lambda: workflow.discard(employer, opp.pk, expected_row_version=opp.row_version),
    ):
        with pytest.raises(PermissionDeniedError) as refused:
            call()
        assert refused.value.code == "not_a_member"
