"""Employer portal services (Phase 6A, D-35): the only code that changes claims, verification, memberships and
company-profile revisions.

Principles (see docs/phase6a/PHASE6A_PLAN.md):
* A claim grants nothing until staff with `employer.review` decide it, and nobody decides their own claim.
* An organisation is verified only while an unrevoked `OrganisationVerification` exists; it is recorded with a
  method and evidence by the deciding person, never inferred.
* Profile text is public, so every change is a frozen revision approved by someone other than its submitter.
* Each transition runs in one transaction with its audit event; a refused attempt is audited as a security
  event in its own transaction.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from access.registry import DEFAULT_REGISTRY, Permission
from accounts.models import User
from audit import services as audit
from audit.models import Severity
from catalog.models import Organisation, Sector
from catalog.text import TextError, clean_multiline, clean_single_line
from catalog.validators import validate_url
from opportunities.errors import (
    FieldErrors,
    InvalidTransition,
    NotFoundError,
    PermissionDeniedError,
    SeparationOfDuties,
    ValidationFailed,
    WorkflowError,
)

from .models import (
    ClaimStatus,
    EmployerMembership,
    EmployerProfile,
    MemberRole,
    OrganisationClaim,
    OrganisationVerification,
    ProfileRevision,
    ProfileState,
    SizeBand,
    VerificationMethod,
)

MAX_PENDING_CLAIMS = 3
CLAIMED_NAME = (2, 200)
PROFILE_ABOUT_MAX = 2000


def _err(errors: FieldErrors, path: str, code: str, message: str) -> None:
    errors.setdefault(path, []).append((code, message))


def _single(
    errors: FieldErrors, raw: Any, path: str, low: int, high: int, *, required: bool = True
) -> str | None:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        if required:
            _err(errors, path, "required", "This field is required.")
        return None
    if not isinstance(raw, str):
        _err(errors, path, "invalid_format", "Must be text.")
        return None
    try:
        value = clean_single_line(raw)
    except TextError as exc:
        _err(errors, path, exc.code, str(exc))
        return None
    if not low <= len(value) <= high:
        _err(errors, path, "too_short" if len(value) < low else "too_long", f"{low} to {high} characters.")
        return None
    return value


def _multi(
    errors: FieldErrors, raw: Any, path: str, low: int, high: int, *, required: bool = True
) -> str | None:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        if required:
            _err(errors, path, "required", "This field is required.")
        return None
    if not isinstance(raw, str):
        _err(errors, path, "invalid_format", "Must be text.")
        return None
    try:
        value = clean_multiline(raw)
    except TextError as exc:
        _err(errors, path, exc.code, str(exc))
        return None
    if not low <= len(value) <= high:
        _err(errors, path, "too_short" if len(value) < low else "too_long", f"{low} to {high} characters.")
        return None
    return value


def _reason(reason: str | None, minimum: int = 10, maximum: int = 2000) -> str:
    text = (reason or "").strip()
    if not minimum <= len(text) <= maximum:
        raise ValidationFailed(
            {"reason": [("too_short", f"Give a reason of {minimum}-{maximum} characters.")]}
        )
    return text


def _run[T](
    action: str, actor: User, object_type: str, object_id: uuid.UUID | None, body: Callable[[], T]
) -> T:
    try:
        with transaction.atomic():
            return body()
    except PermissionDeniedError as exc:
        audit.record(
            action=f"{action}.denied",
            object_type=object_type,
            object_id=object_id,
            actor_id=actor.pk,
            severity=Severity.SECURITY,
            changes={"code": exc.code},
        )
        raise


def _account_ready(user: User) -> None:
    if not user.is_active or user.email_verified_at is None or user.deletion_requested_at is not None:
        raise PermissionDeniedError("account_not_ready", "Confirm your e-mail address and sign in first.")


# --- queries --------------------------------------------------------------------------------------
def active_membership(user: User, organisation_id: uuid.UUID | str) -> EmployerMembership | None:
    try:
        return EmployerMembership.objects.select_related("organisation").get(
            user=user, organisation_id=organisation_id, revoked_at__isnull=True
        )
    except EmployerMembership.DoesNotExist, ValueError, DjangoValidationError:
        return None


def is_verified(organisation_id: uuid.UUID | str) -> bool:
    return OrganisationVerification.objects.filter(
        organisation_id=organisation_id, revoked_at__isnull=True
    ).exists()


# --- claims ---------------------------------------------------------------------------------------
def submit_claim(user: User, data: Mapping[str, Any]) -> OrganisationClaim:
    """A signed-in, e-mail-confirmed account asks to act for an organisation (new or existing)."""
    errors: FieldErrors = {}
    unknown = set(data) - {
        "organisation_id",
        "organisation_name",
        "website_url",
        "registration_number",
        "role_title",
        "evidence_note",
    }
    for key in sorted(unknown):
        _err(errors, key, "unknown_field", "Unknown field.")
    existing: Organisation | None = None
    raw_id = data.get("organisation_id")
    if raw_id not in (None, ""):
        try:
            existing = Organisation.objects.filter(
                pk=uuid.UUID(str(raw_id)), merged_into__isnull=True
            ).first()
        except ValueError:
            existing = None
        if existing is None:
            _err(errors, "organisation_id", "not_found_reference", "Unknown organisation.")
    name = _single(errors, data.get("organisation_name"), "organisation_name", *CLAIMED_NAME)
    role_title = _single(errors, data.get("role_title"), "role_title", 2, 100)
    evidence = _multi(errors, data.get("evidence_note"), "evidence_note", 20, 2000)
    registration = _single(
        errors, data.get("registration_number"), "registration_number", 2, 60, required=False
    )
    website: str | None = None
    if data.get("website_url") not in (None, ""):
        try:
            website = validate_url(str(data["website_url"]), field_name="Website")
        except TextError as exc:
            _err(errors, "website_url", exc.code, str(exc))
    if errors:
        raise ValidationFailed(errors)
    assert name is not None
    assert role_title is not None
    assert evidence is not None

    def body() -> OrganisationClaim:
        _account_ready(user)
        locked = User.objects.select_for_update().get(pk=user.pk)
        if (
            OrganisationClaim.objects.filter(user=locked, status=ClaimStatus.PENDING).count()
            >= MAX_PENDING_CLAIMS
        ):
            raise WorkflowError(
                "too_many_claims", f"You can have at most {MAX_PENDING_CLAIMS} claims waiting."
            )
        if existing is not None:
            if active_membership(locked, existing.pk) is not None:
                raise WorkflowError("already_member", "You already act for this organisation.")
            if OrganisationClaim.objects.filter(
                user=locked, organisation=existing, status=ClaimStatus.PENDING
            ).exists():
                raise WorkflowError(
                    "claim_pending", "You already have a claim waiting for this organisation."
                )
        claim = OrganisationClaim.objects.create(
            user=locked,
            organisation=existing,
            organisation_name=existing.name if existing else name,
            website_url=website,
            registration_number=registration,
            role_title=role_title,
            evidence_note=evidence,
        )
        audit.record(
            action="employer.claim.submitted",
            object_type="organisation_claim",
            object_id=claim.pk,
            actor_id=locked.pk,
            changes={"organisation_id": str(existing.pk) if existing else None},
        )
        return claim

    return _run("employer.claim.submit", user, "organisation_claim", None, body)


def withdraw_claim(user: User, claim_id: uuid.UUID | str) -> OrganisationClaim:
    def body() -> OrganisationClaim:
        try:
            claim = OrganisationClaim.objects.select_for_update().get(pk=claim_id, user=user)
        except OrganisationClaim.DoesNotExist, ValueError:
            raise NotFoundError() from None
        if claim.status != ClaimStatus.PENDING:
            raise InvalidTransition("Only a waiting claim can be withdrawn.")
        claim.status = ClaimStatus.WITHDRAWN
        claim.save(update_fields=["status"])
        audit.record(
            action="employer.claim.withdrawn",
            object_type="organisation_claim",
            object_id=claim.pk,
            actor_id=user.pk,
        )
        return claim

    return _run("employer.claim.withdraw", user, "organisation_claim", None, body)


def _require_reviewer(user: User) -> None:
    if not user.is_active or not DEFAULT_REGISTRY.has(user.active_roles(), Permission.EMPLOYER_REVIEW):
        raise PermissionDeniedError()


def decide_claim(
    reviewer: User,
    claim_id: uuid.UUID | str,
    *,
    approve: bool,
    reason: str | None = None,
    organisation_id: uuid.UUID | str | None = None,
    method: str | None = None,
    evidence_note: str | None = None,
    role: str = MemberRole.OWNER,
) -> OrganisationClaim:
    """Approve (grants membership, records verification when the organisation has none) or reject a claim."""

    def body() -> OrganisationClaim:
        _require_reviewer(reviewer)
        try:
            claim = OrganisationClaim.objects.select_for_update().select_related("user").get(pk=claim_id)
        except OrganisationClaim.DoesNotExist, ValueError:
            raise NotFoundError() from None
        if claim.user_id == reviewer.pk:
            raise SeparationOfDuties("You cannot decide your own claim.")
        if claim.status != ClaimStatus.PENDING:
            raise InvalidTransition("This claim has already been decided or withdrawn.")
        now = timezone.now()
        if not approve:
            claim.status = ClaimStatus.REJECTED
            claim.decision_reason = _reason(reason)
            claim.decided_by, claim.decided_at = reviewer, now
            claim.save()
            audit.record(
                action="employer.claim.rejected",
                object_type="organisation_claim",
                object_id=claim.pk,
                actor_id=reviewer.pk,
                severity=Severity.PRIVILEGED,
            )
            return claim

        if role not in MemberRole.values:
            raise ValidationFailed({"role": [("invalid_choice", "Choose owner or recruiter.")]})
        organisation = _target_organisation(reviewer, claim, organisation_id)
        if active_membership(claim.user, organisation.pk) is not None:
            raise WorkflowError("already_member", "The claimant already acts for this organisation.")
        if EmployerMembership.objects.filter(
            user=reviewer, organisation=organisation, revoked_at__isnull=True
        ).exists():
            raise SeparationOfDuties("You act for this organisation and cannot verify it.")
        verification: OrganisationVerification | None = None
        if not is_verified(organisation.pk):
            errors: FieldErrors = {}
            if method not in VerificationMethod.values:
                _err(errors, "method", "required", "Record how the organisation was verified.")
            note = (evidence_note or "").strip()
            if not 10 <= len(note) <= 2000:
                _err(errors, "evidence_note", "too_short", "Describe the evidence in 10 to 2000 characters.")
            if errors:
                raise ValidationFailed(errors)
            verification = OrganisationVerification.objects.create(
                organisation=organisation,
                claim=claim,
                method=str(method),
                evidence_note=note,
                verified_by=reviewer,
                verified_at=now,
            )
            audit.record(
                action="employer.verification.recorded",
                object_type="organisation",
                object_id=organisation.pk,
                actor_id=reviewer.pk,
                severity=Severity.PRIVILEGED,
                changes={"method": method, "claim_id": str(claim.pk)},
            )
        membership = EmployerMembership.objects.create(
            user=claim.user,
            organisation=organisation,
            role=role,
            claim=claim,
            granted_by=reviewer,
            granted_at=now,
        )
        claim.status = ClaimStatus.APPROVED
        claim.organisation = organisation
        claim.decided_by, claim.decided_at = reviewer, now
        claim.decision_reason = (reason or "").strip() or None
        claim.save()
        audit.record(
            action="employer.claim.approved",
            object_type="organisation_claim",
            object_id=claim.pk,
            actor_id=reviewer.pk,
            severity=Severity.PRIVILEGED,
            changes={
                "organisation_id": str(organisation.pk),
                "membership_id": str(membership.pk),
                "role": role,
                "verified_now": verification is not None,
            },
        )
        return claim

    return _run("employer.claim.decide", reviewer, "organisation_claim", _as_uuid(claim_id), body)


def _target_organisation(
    reviewer: User, claim: OrganisationClaim, organisation_id: uuid.UUID | str | None
) -> Organisation:
    chosen = organisation_id or claim.organisation_id
    if chosen:
        try:
            organisation = Organisation.objects.filter(pk=chosen, merged_into__isnull=True).first()
        except ValueError:
            organisation = None
        if organisation is None:
            raise ValidationFailed({"organisation_id": [("not_found_reference", "Unknown organisation.")]})
        return organisation
    return Organisation.objects.create(
        name=claim.organisation_name, website_url=claim.website_url, created_by=reviewer
    )


def revoke_verification(admin: User, organisation_id: uuid.UUID | str, *, reason: str | None) -> None:
    """Withdraw an organisation's verification: members can no longer submit, its public profile is hidden."""

    def body() -> None:
        if not admin.is_active or not DEFAULT_REGISTRY.has(
            admin.active_roles(), Permission.EMPLOYER_VERIFICATION_REVOKE
        ):
            raise PermissionDeniedError()
        text = _reason(reason)
        try:
            record = OrganisationVerification.objects.select_for_update().get(
                organisation_id=organisation_id, revoked_at__isnull=True
            )
        except OrganisationVerification.DoesNotExist, ValueError:
            raise NotFoundError("This organisation has no active verification.") from None
        record.revoked_by, record.revoked_at, record.revoked_reason = admin, timezone.now(), text
        record.save()
        audit.record(
            action="employer.verification.revoked",
            object_type="organisation",
            object_id=record.organisation_id,
            actor_id=admin.pk,
            severity=Severity.SECURITY,
        )

    _run("employer.verification.revoke", admin, "organisation", _as_uuid(organisation_id), body)


def revoke_membership(
    reviewer: User, membership_id: uuid.UUID | str, *, reason: str | None
) -> EmployerMembership:
    def body() -> EmployerMembership:
        _require_reviewer(reviewer)
        try:
            membership = EmployerMembership.objects.select_for_update().get(
                pk=membership_id, revoked_at__isnull=True
            )
        except EmployerMembership.DoesNotExist, ValueError:
            raise NotFoundError() from None
        membership.revoked_by, membership.revoked_at = reviewer, timezone.now()
        membership.revoked_reason = _reason(reason)
        membership.save()
        audit.record(
            action="employer.membership.revoked",
            object_type="employer_membership",
            object_id=membership.pk,
            actor_id=reviewer.pk,
            severity=Severity.SECURITY,
            changes={"organisation_id": str(membership.organisation_id)},
        )
        return membership

    return _run("employer.membership.revoke", reviewer, "employer_membership", _as_uuid(membership_id), body)


def end_all_roles_for_deleted_account(user: User, *, now: datetime | None = None) -> None:
    """Called inside the account-deletion transaction: waiting claims are withdrawn, memberships revoked."""
    now = now or timezone.now()
    OrganisationClaim.objects.filter(user=user, status=ClaimStatus.PENDING).update(
        status=ClaimStatus.WITHDRAWN
    )
    # What the person wrote about themselves goes; the decision, decider and time stay for the audit trail.
    OrganisationClaim.objects.filter(user=user).update(
        evidence_note="[removed when the account was deleted]",
        role_title="[removed]",
        registration_number=None,
    )
    revoked = EmployerMembership.objects.filter(user=user, revoked_at__isnull=True).update(
        revoked_at=now, revoked_reason="account deleted"
    )
    if revoked:
        audit.record(
            action="employer.membership.ended_by_deletion",
            object_type="user",
            object_id=user.pk,
            actor_id=None,
            actor_type="system",
            severity=Severity.SECURITY,
            changes={"memberships": revoked},
        )


# --- company profiles -----------------------------------------------------------------------------
def clean_profile(data: Mapping[str, Any]) -> dict[str, Any]:
    errors: FieldErrors = {}
    for key in sorted(
        set(data) - {"tagline", "about", "sector_id", "size_band", "founded_year", "location_text"}
    ):
        _err(errors, key, "unknown_field", "Unknown field.")
    out: dict[str, Any] = {
        "tagline": _single(errors, data.get("tagline"), "tagline", 0, 120, required=False) or "",
        "about": _multi(errors, data.get("about"), "about", 50, PROFILE_ABOUT_MAX) or "",
        "location_text": _single(errors, data.get("location_text"), "location_text", 2, 120, required=False),
        "sector": None,
        "size_band": None,
        "founded_year": None,
    }
    if data.get("sector_id") not in (None, ""):
        try:
            out["sector"] = Sector.objects.filter(pk=uuid.UUID(str(data["sector_id"])), active=True).first()
        except ValueError:
            out["sector"] = None
        if out["sector"] is None:
            _err(errors, "sector_id", "not_found_reference", "Unknown sector.")
    if data.get("size_band") not in (None, ""):
        if data["size_band"] in SizeBand.values:
            out["size_band"] = data["size_band"]
        else:
            _err(errors, "size_band", "invalid_choice", "Not a valid size.")
    if data.get("founded_year") not in (None, ""):
        year = data["founded_year"]
        if isinstance(year, bool) or not isinstance(year, int) or not 1800 <= year <= timezone.now().year:
            _err(errors, "founded_year", "invalid_format", "Use a four-digit year not in the future.")
        else:
            out["founded_year"] = year
    if errors:
        raise ValidationFailed(errors)
    return out


def _profile_hash(values: Mapping[str, Any]) -> bytes:
    canonical = {k: (str(v.pk) if isinstance(v, Sector) else v) for k, v in sorted(values.items())}
    return hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).digest()


def _new_slug(organisation: Organisation) -> str:
    base = slugify(organisation.name)[:60].strip("-") or "employer"
    return f"{base}-{secrets.token_hex(3)}"


def submit_profile_revision(
    user: User, organisation_id: uuid.UUID | str, data: Mapping[str, Any]
) -> ProfileRevision:
    """An owner of a verified organisation submits profile text. Any earlier waiting revision is withdrawn."""
    values = clean_profile(data)

    def body() -> ProfileRevision:
        _account_ready(user)
        membership = active_membership(user, organisation_id)
        if membership is None:
            raise NotFoundError()
        if membership.role != MemberRole.OWNER:
            raise PermissionDeniedError("owner_required", "Only an owner can change the company profile.")
        if not is_verified(membership.organisation_id):
            raise PermissionDeniedError("organisation_not_verified", "The organisation is not verified.")
        profile = (
            EmployerProfile.objects.select_for_update()
            .filter(organisation_id=membership.organisation_id)
            .first()
        )
        if profile is None:
            profile = EmployerProfile.objects.create(
                organisation=membership.organisation, slug=_new_slug(membership.organisation)
            )
        ProfileRevision.objects.filter(profile=profile, state=ProfileState.PENDING).update(
            state=ProfileState.WITHDRAWN
        )
        last = profile.revisions.order_by("-version_no").values_list("version_no", flat=True).first() or 0
        revision = ProfileRevision.objects.create(
            profile=profile,
            version_no=last + 1,
            content_hash=_profile_hash(values),
            submitted_by=user,
            **values,
        )
        audit.record(
            action="employer.profile.submitted",
            object_type="employer_profile",
            object_id=profile.pk,
            actor_id=user.pk,
            changes={"revision": revision.version_no, "organisation_id": str(membership.organisation_id)},
        )
        return revision

    return _run("employer.profile.submit", user, "employer_profile", None, body)


def withdraw_profile_revision(
    user: User, organisation_id: uuid.UUID | str, revision_id: uuid.UUID | str
) -> None:
    def body() -> None:
        membership = active_membership(user, organisation_id)
        if membership is None:
            raise NotFoundError()
        try:
            revision = ProfileRevision.objects.select_for_update().get(
                pk=revision_id, profile__organisation_id=membership.organisation_id
            )
        except ProfileRevision.DoesNotExist, ValueError:
            raise NotFoundError() from None
        if revision.state != ProfileState.PENDING:
            raise InvalidTransition("Only a waiting revision can be withdrawn.")
        revision.state = ProfileState.WITHDRAWN
        revision.save(update_fields=["state"])
        audit.record(
            action="employer.profile.withdrawn",
            object_type="employer_profile",
            object_id=revision.profile_id,
            actor_id=user.pk,
        )

    _run("employer.profile.withdraw", user, "employer_profile", None, body)


def decide_profile_revision(
    reviewer: User, revision_id: uuid.UUID | str, *, approve: bool, reason: str | None = None
) -> ProfileRevision:
    def body() -> ProfileRevision:
        _require_reviewer(reviewer)
        try:
            revision = (
                ProfileRevision.objects.select_for_update().select_related("profile").get(pk=revision_id)
            )
        except ProfileRevision.DoesNotExist, ValueError:
            raise NotFoundError() from None
        if revision.submitted_by_id == reviewer.pk:
            raise SeparationOfDuties("You cannot decide a revision you submitted.")
        if revision.state != ProfileState.PENDING:
            raise InvalidTransition("This revision has already been decided or withdrawn.")
        if not approve:
            revision.state = ProfileState.REJECTED
            revision.decision_reason = _reason(reason)
        else:
            previous = revision.profile.live_revision_id
            if previous:
                ProfileRevision.objects.filter(pk=previous).update(state=ProfileState.SUPERSEDED)
            revision.state = ProfileState.APPROVED
            revision.decision_reason = (reason or "").strip() or None
            revision.profile.live_revision = revision
            revision.profile.save(update_fields=["live_revision"])
        revision.decided_by, revision.decided_at = reviewer, timezone.now()
        revision.save()
        audit.record(
            action="employer.profile.approved" if approve else "employer.profile.rejected",
            object_type="employer_profile",
            object_id=revision.profile_id,
            actor_id=reviewer.pk,
            severity=Severity.PRIVILEGED,
            changes={"revision": revision.version_no},
        )
        return revision

    return _run("employer.profile.decide", reviewer, "employer_profile", None, body)


def _as_uuid(value: uuid.UUID | str | None) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) or value is None else uuid.UUID(str(value))
    except ValueError:
        return None


__all__ = [
    "active_membership",
    "clean_profile",
    "decide_claim",
    "decide_profile_revision",
    "end_all_roles_for_deleted_account",
    "is_verified",
    "revoke_membership",
    "revoke_verification",
    "submit_claim",
    "submit_profile_revision",
    "withdraw_claim",
    "withdraw_profile_revision",
]
