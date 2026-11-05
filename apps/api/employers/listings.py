"""Employer-facing listing operations: thin wrappers that resolve the caller's organisation and then use the
publishing service. They add no authority: the service still decides (and audits) every transition."""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError

from accounts.models import User
from opportunities import workflow
from opportunities.errors import NotFoundError
from opportunities.models import (
    Decision,
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    ReviewDecision,
    VersionState,
)

from . import services
from .models import EmployerListing, EmployerMembership


def member_listing(user: User, opportunity_id: uuid.UUID | str) -> EmployerListing:
    try:
        binding = EmployerListing.objects.select_related(
            "opportunity__category",
            "organisation",
            "opportunity__pending_version",
            "opportunity__live_version",
        ).get(opportunity_id=opportunity_id)
    except EmployerListing.DoesNotExist, ValueError, DjangoValidationError:
        raise NotFoundError() from None
    if services.active_membership(user, binding.organisation_id) is None:
        raise NotFoundError()  # never reveal that a listing of another organisation exists
    return binding


def _force_org(content: Mapping[str, Any], organisation_id: uuid.UUID) -> dict[str, Any]:
    forced = dict(content)
    forced["organisation_id"] = str(organisation_id)
    return forced


def create(
    user: User, organisation_id: uuid.UUID | str, category_code: str, content: Mapping[str, Any]
) -> Opportunity:
    membership = services.active_membership(user, organisation_id)
    if membership is None:
        raise NotFoundError()
    return workflow.create_draft(
        user, category_code=category_code, content=_force_org(content, membership.organisation_id)
    )


def save(
    user: User, opportunity_id: uuid.UUID | str, expected_row_version: int, content: Mapping[str, Any]
) -> OpportunityVersion:
    binding = member_listing(user, opportunity_id)
    return workflow.save_draft(
        user,
        opportunity_id,
        expected_row_version=expected_row_version,
        content=_force_org(content, binding.organisation_id),
    )


def submit(user: User, opportunity_id: uuid.UUID | str, expected_row_version: int) -> OpportunityVersion:
    member_listing(user, opportunity_id)
    return workflow.submit(user, opportunity_id, expected_row_version=expected_row_version)


def discard(user: User, opportunity_id: uuid.UUID | str, expected_row_version: int) -> Opportunity:
    member_listing(user, opportunity_id)
    return workflow.discard(user, opportunity_id, expected_row_version=expected_row_version)


def reopen(user: User, opportunity_id: uuid.UUID | str, expected_row_version: int) -> OpportunityVersion:
    member_listing(user, opportunity_id)
    return workflow.reopen(user, opportunity_id, expected_row_version=expected_row_version)


def amend(user: User, opportunity_id: uuid.UUID | str, expected_row_version: int) -> OpportunityVersion:
    member_listing(user, opportunity_id)
    return workflow.amend(user, opportunity_id, expected_row_version=expected_row_version)


def close(user: User, opportunity_id: uuid.UUID | str, expected_row_version: int, reason: str) -> Opportunity:
    member_listing(user, opportunity_id)
    return workflow.withdraw_own(
        user, opportunity_id, expected_row_version=expected_row_version, reason=reason
    )


def _money(low: Any, high: Any, currency: str | None, period: str | None) -> dict[str, Any] | None:
    if low is None and high is None:
        return None
    return {
        "min": None if low is None else f"{low:.2f}",
        "max": None if high is None else f"{high:.2f}",
        "currency": currency,
        "period": period,
    }


def copy_content(version: OpportunityVersion) -> dict[str, Any]:
    """The content of a revision as a new draft would be written, for "Duplicate". The closing date, the
    reference number and the address are left out: a copy is a fresh listing and gets its own."""
    content: dict[str, Any] = {
        "title": version.title,
        "summary": version.summary,
        "description_md": version.description_md,
        "requirements_md": version.requirements_md,
        "locations": [
            {"location_id": str(r.location_id), "is_primary": r.is_primary} for r in version.locations.all()
        ],
        "location_text": version.location_text,
        "geographic_eligibility": version.geographic_eligibility,
        "work_mode": version.work_mode,
        "employment_type": version.employment_type,
        "experience_level": version.experience_level,
        "salary": _money(
            version.salary_min, version.salary_max, version.salary_currency, version.salary_period
        ),
        "salary_text": version.salary_text,
        "funding": _money(
            version.funding_min, version.funding_max, version.funding_currency, version.funding_period
        ),
        "application_method": version.application_method,
        "application_url": version.application_url,
        "application_email": version.application_email,
        "application_email_subject": version.application_email_subject,
        "application_instructions": version.application_instructions,
        "contact_details": version.contact_details,
        "sector_ids": [str(r.sector_id) for r in version.sectors.all()],
        "skills": [{"skill_id": str(r.skill_id), "is_required": r.is_required} for r in version.skills.all()],
        "detail": version.detail,
        "featured_image": version.featured_image,
        "featured_image_alt": version.featured_image_alt,
        "social_image": version.social_image,
    }
    return {key: value for key, value in content.items() if value is not None}


def duplicate(user: User, opportunity_id: uuid.UUID | str) -> Opportunity:
    """A new draft with the content of one of the organisation's own listings. It is a separate listing: it
    goes through the whole review, and the organisation is the source's, fixed by the server."""
    binding = member_listing(user, opportunity_id)
    source = binding.opportunity.pending_version or binding.opportunity.live_version
    if source is None:
        raise NotFoundError()
    return create(user, binding.organisation_id, binding.opportunity.category.code, copy_content(source))


def next_actions(user: User, opportunity: Opportunity) -> list[str]:
    """What the employer could do now (advisory; the service re-checks everything)."""
    pending = opportunity.pending_version
    actions: list[str] = []
    if pending is not None and pending.author_id == user.pk:
        if pending.state == VersionState.DRAFT:
            actions += ["edit", "submit", "discard"]
        elif pending.state == VersionState.REJECTED:
            actions += ["reopen", "discard"]
    if opportunity.status in (ListingStatus.PUBLISHED, ListingStatus.EXPIRED, ListingStatus.WITHDRAWN) and (
        pending is None or pending.state in (VersionState.REJECTED, VersionState.DISCARDED)
    ):
        actions.append("amend")
    if opportunity.status == ListingStatus.PUBLISHED:
        actions.append("close")
    return actions


def can_duplicate(opportunity: Opportunity) -> bool:
    """Anything the employer can read can be copied into a new draft; the new listing is reviewed in full."""
    return opportunity.pending_version is not None or opportunity.live_version is not None


def latest_decision(version: OpportunityVersion | None) -> dict[str, Any] | None:
    """The newest editorial decision on a revision, with the reason shown to the employer."""
    if version is None:
        return None
    decision = (
        ReviewDecision.objects.filter(version=version, decision__in=[Decision.REJECTED, Decision.RETURNED])
        .order_by("-decided_at")
        .first()
    )
    if decision is None:
        return None
    return {
        "decision": decision.decision,
        "reason": decision.reason,
        "decided_at": decision.decided_at.isoformat().replace("+00:00", "Z"),
    }


def memberships_of(user: User) -> list[EmployerMembership]:
    return list(
        EmployerMembership.objects.filter(user=user, revoked_at__isnull=True)
        .select_related("organisation")
        .order_by("organisation__name")
    )
