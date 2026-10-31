"""The employer path through the publishing service (Phase 6A, D-35).

An employer member is not staff. `opportunities.workflow` asks this module only for the *author* actions in
`EMPLOYER_AUTHOR_PERMISSIONS`, and every call re-reads membership and verification at the moment of the action
(inside the listing lock). A refused call raises the service's own permission error, which the service audits.
Review, verification and publication never come through here.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from django.conf import settings

from access.registry import EMPLOYER_CATEGORIES
from accounts.models import User
from catalog.models import Organisation
from opportunities.content import STAFF_ONLY_KEYS
from opportunities.errors import PermissionDeniedError
from opportunities.models import Opportunity, OpportunitySource, OpportunityVersion, SourceKind

from .models import EmployerListing, EmployerMembership, OrganisationVerification

SOURCE_NAME = f"Submitted by the employer through the {settings.UPNEXT_BRAND_SHORT} employer portal"


def is_employer(user: User) -> bool:
    """True for an active account holding at least one active membership (authority is still per listing)."""
    return bool(
        user.is_active and EmployerMembership.objects.filter(user=user, revoked_at__isnull=True).exists()
    )


def _check_member_and_verified(actor: User, organisation_id: Any) -> None:
    if not EmployerMembership.objects.filter(
        user=actor, organisation_id=organisation_id, revoked_at__isnull=True
    ).exists():
        raise PermissionDeniedError("not_a_member", "You do not act for this organisation.")
    if not OrganisationVerification.objects.filter(
        organisation_id=organisation_id, revoked_at__isnull=True
    ).exists():
        raise PermissionDeniedError("organisation_not_verified", "The organisation is not verified.")


def enforce_create(actor: User, category_code: str, organisation: Organisation) -> None:
    if category_code not in EMPLOYER_CATEGORIES:
        raise PermissionDeniedError(
            "category_not_allowed", "Employers can post jobs, internships and graduate programmes."
        )
    _check_member_and_verified(actor, organisation.pk)


def bind_listing(actor: User, opportunity: Opportunity, organisation: Organisation) -> None:
    EmployerListing.objects.create(opportunity=opportunity, organisation=organisation, created_by=actor)


def enforce(actor: User, opportunity: Opportunity) -> EmployerListing:
    """Employer-only actors may touch only listings bound to an organisation they currently act for."""
    binding = EmployerListing.objects.filter(opportunity=opportunity).first()
    if binding is None:
        raise PermissionDeniedError("not_an_employer_listing", "This listing is not managed by employers.")
    _check_member_and_verified(actor, binding.organisation_id)
    if opportunity.category.code not in EMPLOYER_CATEGORIES:
        raise PermissionDeniedError(
            "category_not_allowed", "Employers can post jobs, internships and graduate programmes."
        )
    return binding


def check_content(
    binding: EmployerListing | None, cleaned: Mapping[str, Any], raw: Mapping[str, Any]
) -> None:
    """The organisation is fixed and provenance is automatic: an employer cannot choose either."""
    if "sources" in raw:
        raise PermissionDeniedError(
            "sources_not_allowed", "Sources are recorded automatically for employers."
        )
    if STAFF_ONLY_KEYS & set(raw):
        raise PermissionDeniedError(
            "staff_only_field", "The address and the search and sharing text are set by staff."
        )
    organisation = cleaned.get("organisation")
    if binding is not None and organisation is not None and organisation.pk != binding.organisation_id:
        raise PermissionDeniedError(
            "organisation_fixed", "A listing cannot be moved to another organisation."
        )


def prepare_submission(actor: User, version: OpportunityVersion, binding: EmployerListing) -> None:
    """Replace any provenance on the draft with the single automatic source, dated today."""
    version.sources.all().delete()
    OpportunitySource.objects.create(
        opportunity_id=version.opportunity_id,
        version=version,
        kind=SourceKind.OTHER,
        name=SOURCE_NAME,
        citation=f"Submitted for {version.organisation.name} by a member of the verified organisation.",
        observed_on=datetime.now(UTC).date(),
        is_primary=True,
        created_by=actor,
    )
    _ = binding
