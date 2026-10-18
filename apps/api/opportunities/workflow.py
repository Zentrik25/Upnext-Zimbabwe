"""The publishing service: the only code that changes listing status, revision state, review,
verification or history (EDITORIAL_WORKFLOW §3-§5, ADR-0011/0015/0018).

Every public function runs one transition inside a database transaction that
1. locks the listing row (`SELECT … FOR UPDATE`) and compares `expected_row_version`,
2. re-reads every fact it needs *under that lock* and asks the pure policy in `access.policy`,
3. applies the change and writes a `PublishingEvent` and an `AuditEvent` in the same transaction.

A refused attempt rolls everything back and is then recorded as a `security` audit event in its own
transaction (guard failures are evidence, EDITORIAL_WORKFLOW §4.7). PostgreSQL triggers re-assert the
same invariants, so a bug here cannot publish unapproved content.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.db import connection, transaction
from django.utils import timezone

from access import policy
from access.policy import Actor, Reason, RevisionFacts
from access.registry import DEFAULT_REGISTRY, EMPLOYER_AUTHOR_PERMISSIONS, Permission, Role
from accounts.models import User
from audit import services as audit
from audit.models import ActorType, Severity
from catalog.models import Category, DetailSchema, DetailSchemaStatus
from catalog.validators import make_slug
from core.context import get_request_id
from employers import capability as employer_capability

from . import content as content_mod
from .duplicates import find_duplicates
from .errors import (
    InvalidTransition,
    NotFoundError,
    PermissionDeniedError,
    SeparationOfDuties,
    StateConflict,
    ValidationFailed,
    WorkflowError,
)
from .models import (
    ArchiveReason,
    Decision,
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    PublishingEvent,
    ReviewDecision,
    VerificationLevel,
    VerificationMethod,
    VerificationOutcome,
    VerificationRecord,
    VersionState,
)
from .validation import fee_lint_triggers, validate_publishable

REASON_CODES_TAKEDOWN = frozenset({"legal", "error", "fraud", "other"})
_LEVEL_ORDER = {
    VerificationLevel.NOT_VERIFIED: 0,
    VerificationLevel.SOURCE_CHECKED: 1,
    VerificationLevel.ISSUER_VERIFIED: 2,
}
# Method rules (P2-08): a source check is never presented as direct confirmation with the issuer.
_LEVEL_METHODS = {
    VerificationLevel.SOURCE_CHECKED: {
        VerificationMethod.SOURCE_PAGE_REVIEW,
        VerificationMethod.DOCUMENT_REVIEW,
    },
    VerificationLevel.ISSUER_VERIFIED: {VerificationMethod.ISSUER_CONTACT},
}


@dataclass(frozen=True)
class Context:
    """What a transition knows about itself, for the history and audit rows."""

    transition: str
    audit_action: str
    permission: Permission


# --- helpers ----------------------------------------------------------------------------------
def _actor(user: User) -> Actor:
    return Actor(user_id=user.pk, roles=user.active_roles())


def _capacity(user: User, permission: Permission) -> str:
    """The role through which the actor exercised the permission (recorded for AC-EDIT-03)."""
    for role in (Role.EDITOR, Role.ADMINISTRATOR, Role.CONTRIBUTOR):
        if role in user.active_roles() and DEFAULT_REGISTRY.has([role], permission):
            return str(role)
    return "employer" if employer_capability.is_employer(user) else "none"


def _require(user: User, permission: Permission) -> bool:
    """Raise unless the actor may attempt `permission`. Returns True when the authority comes *only* from an
    employer membership (author actions; Phase 6A), in which case the caller must also pass the listing
    through `employer_capability.enforce`."""
    if not user.is_active:
        raise PermissionDeniedError()
    if DEFAULT_REGISTRY.has(user.active_roles(), permission):
        return False
    if permission in EMPLOYER_AUTHOR_PERMISSIONS and employer_capability.is_employer(user):
        return True
    raise PermissionDeniedError()


def _lock(opportunity_id: uuid.UUID | str, expected_row_version: int | None) -> Opportunity:
    try:
        opportunity = (
            Opportunity.objects.select_for_update().select_related("category").get(pk=opportunity_id)
        )
    except Opportunity.DoesNotExist, ValueError:
        raise NotFoundError() from None
    if expected_row_version is not None and opportunity.row_version != expected_row_version:
        raise StateConflict()
    return opportunity


def _version(opportunity: Opportunity, version_id: uuid.UUID | None) -> OpportunityVersion:
    if version_id is None:
        raise InvalidTransition("There is no open revision.")
    return OpportunityVersion.objects.select_related("opportunity__category").get(pk=version_id)


def chain_author_ids(version: OpportunityVersion) -> frozenset[uuid.UUID]:
    """Authors and submitters of the revision and of its unpublished ancestors (same walk as the
    database function `upnext_chain_authors`); a published ancestor ends the chain."""
    ids: set[uuid.UUID] = set()
    current: OpportunityVersion | None = version
    first = True
    while current is not None:
        if not first and current.state in (VersionState.PUBLISHED, VersionState.SUPERSEDED):
            break
        ids.add(current.author_id)
        if current.submitted_by_id:
            ids.add(current.submitted_by_id)
        first = False
        current = current.based_on_version
    return frozenset(ids)


def _facts(version: OpportunityVersion) -> RevisionFacts:
    approved = (
        ReviewDecision.objects.filter(version=version, decision=Decision.APPROVED)
        .order_by("-decided_at")
        .first()
    )
    return RevisionFacts(
        state=version.state,
        chain_author_ids=chain_author_ids(version),
        content_hash=bytes(version.content_hash or b""),
        approved_by=version.approved_by_id,
        approved_hash=bytes(approved.content_hash) if approved and version.approved_by_id else None,
    )


def _enforce(decision: policy.Decision) -> None:
    if decision:
        return
    if decision.reason == Reason.SEPARATION_OF_DUTIES:
        raise SeparationOfDuties()
    if decision.reason == Reason.APPROVAL_STALE:
        raise WorkflowError("approval_stale", "The approval does not cover this exact revision.")
    if decision.reason == Reason.PERMISSION_DENIED:
        raise PermissionDeniedError()
    raise InvalidTransition()


def _record(
    ctx: Context,
    actor: User,
    opportunity: Opportunity,
    version: OpportunityVersion | None,
    from_status: str,
    reason: str | None = None,
    *,
    actor_type: str = "user",
    extra: Mapping[str, Any] | None = None,
) -> None:
    """History + audit in the caller's transaction; a failure here rolls the transition back."""
    PublishingEvent.objects.create(
        opportunity=opportunity,
        version=version,
        transition=ctx.transition,
        from_status=from_status,
        to_status=opportunity.status,
        actor_type=actor_type,
        actor=None if actor_type == "system" else actor,
        reason=reason,
        request_id=get_request_id(),
    )
    audit.record(
        action=ctx.audit_action,
        object_type="opportunity",
        object_id=opportunity.pk,
        actor_id=None if actor_type == "system" else actor.pk,
        actor_type=ActorType.SYSTEM if actor_type == "system" else ActorType.USER,
        severity=Severity.INFO,
        changes={
            "transition": ctx.transition,
            "from_status": from_status,
            "to_status": opportunity.status,
            "capacity": "system" if actor_type == "system" else _capacity(actor, ctx.permission),
            "version_no": version.version_no if version else None,
            "version_id": str(version.pk) if version else None,
            "reason": reason,
            **(extra or {}),
        },
    )


def _bump(opportunity: Opportunity) -> None:
    opportunity.row_version += 1
    opportunity.save()


def _run[T](ctx: Context, actor: User, opportunity_id: uuid.UUID | str | None, body: Callable[[], T]) -> T:
    """Execute `body` atomically; audit a refused attempt (outside the rolled-back transaction)."""
    try:
        with transaction.atomic():
            return body()
    except WorkflowError as exc:
        if exc.code in {"separation_of_duties", "permission_denied", "approval_stale", "invalid_transition"}:
            audit.record(
                action=f"{ctx.audit_action}.denied",
                object_type="opportunity",
                object_id=_as_uuid(opportunity_id),
                actor_id=actor.pk,
                severity=Severity.SECURITY,
                changes={
                    "transition": ctx.transition,
                    "code": exc.code,
                    "capacity": _capacity(actor, ctx.permission),
                },
            )
        raise


def _as_uuid(value: uuid.UUID | str | None) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) or value is None else uuid.UUID(str(value))
    except ValueError:
        return None


def _active_schema_version(category: Category) -> int:
    schema = DetailSchema.objects.filter(category=category, status=DetailSchemaStatus.ACTIVE).first()
    if schema is None:  # pragma: no cover - seeded by migration
        raise WorkflowError("validation_failed", "This category has no active schema.")
    return schema.version


def _reason(reason: str | None, minimum: int = 10, maximum: int = 2000) -> str:
    text = (reason or "").strip()
    if not minimum <= len(text) <= maximum:
        raise ValidationFailed(
            {"reason": [("too_short", f"Give a reason of {minimum}-{maximum} characters.")]}
        )
    return text


def _never_published(opportunity: Opportunity) -> bool:
    return opportunity.first_published_at is None


# --- T01 / T02 ----------------------------------------------------------------------------------
def create_draft(actor: User, *, category_code: str, content: Mapping[str, Any]) -> Opportunity:
    """T01. `content` must at least name the organisation; everything else may be filled in later."""
    ctx = Context("T01", "opportunity.create", Permission.OPP_DRAFT_CREATE)

    def body() -> Opportunity:
        employer = _require(actor, ctx.permission)
        category = Category.objects.filter(code=category_code, active=True).first()
        if category is None:
            raise ValidationFailed({"category": [("not_found_reference", "Unknown category.")]})
        cleaned, errors = content_mod.clean_draft(content)
        if "organisation" not in cleaned:
            errors.setdefault("organisation_id", []).append(("required", "Choose an organisation."))
        content_mod.raise_if_errors(errors)
        if employer:
            employer_capability.check_content(None, cleaned, content)
            employer_capability.enforce_create(actor, category_code, cleaned["organisation"])
        opportunity = Opportunity.objects.create(category=category, created_by=actor)
        if employer:
            employer_capability.bind_listing(actor, opportunity, cleaned["organisation"])
        version = OpportunityVersion.objects.create(
            opportunity=opportunity,
            version_no=1,
            author=actor,
            organisation=cleaned["organisation"],
            detail_schema_version=_active_schema_version(category),
        )
        content_mod.apply_to_version(version, cleaned, actor_id=actor.pk)
        opportunity.pending_version = version
        opportunity.save()
        _record(ctx, actor, opportunity, version, "")
        return opportunity

    return _run(ctx, actor, None, body)


def save_draft(
    actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int, content: Mapping[str, Any]
) -> OpportunityVersion:
    """T02: only the author of the open draft, only while it is a draft."""
    ctx = Context("T02", "opportunity.save", Permission.OPP_DRAFT_EDIT_OWN)

    def body() -> OpportunityVersion:
        employer = _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        binding = employer_capability.enforce(actor, opportunity) if employer else None
        version = _version(opportunity, opportunity.pending_version_id)
        if version.state != VersionState.DRAFT:
            raise InvalidTransition("Only a draft can be edited.")
        if version.author_id != actor.pk:
            raise PermissionDeniedError("permission_denied", "Only the author can edit this draft.")
        cleaned, errors = content_mod.clean_draft(content)
        content_mod.raise_if_errors(errors)
        if employer:
            employer_capability.check_content(binding, cleaned, content)
        content_mod.apply_to_version(version, cleaned, actor_id=actor.pk)
        _bump(opportunity)
        _record(ctx, actor, opportunity, version, opportunity.status)
        return version

    return _run(ctx, actor, opportunity_id, body)


# --- T03 submit ---------------------------------------------------------------------------------
def submit(
    actor: User,
    opportunity_id: uuid.UUID | str,
    *,
    expected_row_version: int,
    duplicate_acknowledgement: Mapping[str, Any] | None = None,
) -> OpportunityVersion:
    ctx = Context("T03", "opportunity.submit", Permission.OPP_SUBMIT)

    def body() -> OpportunityVersion:
        employer = _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        binding = employer_capability.enforce(actor, opportunity) if employer else None
        version = _version(opportunity, opportunity.pending_version_id)
        if version.state != VersionState.DRAFT:
            raise InvalidTransition("Only a draft can be submitted.")
        if version.author_id != actor.pk:
            raise PermissionDeniedError("permission_denied", "Only the author can submit this draft.")
        if binding is not None:
            employer_capability.prepare_submission(actor, version, binding)
        errors = validate_publishable(version)
        duplicates = find_duplicates(version)
        hard = [d for d in duplicates if d.level == "hard"]
        if hard:
            ack = duplicate_acknowledgement or {}
            reason = str(ack.get("reason", "")).strip()
            if str(ack.get("duplicate_of", "")) not in {d.opportunity_id for d in hard} or len(reason) < 10:
                named = "; ".join(f"{d.title or 'untitled'} ({d.opportunity_id}): {d.reason}" for d in hard)
                errors.setdefault("duplicate_acknowledgement", []).append(
                    (
                        "duplicate_detected",
                        f"This looks like an existing listing: {named}. If it is a separate listing, give "
                        "its id and explain why.",
                    )
                )
            else:
                version.duplicate_acknowledgement = {
                    "duplicate_of": str(ack["duplicate_of"]),
                    "reason": reason,
                }
                version.save()
        if errors:
            codes = {c for items in errors.values() for c, _ in items}
            if codes == {"duplicate_detected"}:
                raise WorkflowError("duplicate_detected", "Possible duplicate listing.", fields=errors)
            raise ValidationFailed(errors)
        before = opportunity.status
        version.content_hash = content_mod.content_hash(version)
        version.state = VersionState.IN_REVIEW
        version.submitted_by = actor
        version.submitted_at = timezone.now()
        version.save()
        if _never_published(opportunity):
            opportunity.status = ListingStatus.IN_REVIEW
        _bump(opportunity)
        _record(
            ctx,
            actor,
            opportunity,
            version,
            before,
            extra={"soft_duplicates": [d.opportunity_id for d in duplicates if d.level == "soft"]},
        )
        return version

    return _run(ctx, actor, opportunity_id, body)


# --- T04-T06 review -----------------------------------------------------------------------------
def _review(
    actor: User,
    opportunity_id: uuid.UUID | str,
    expected_row_version: int,
    ctx: Context,
    check: Callable[[Actor, RevisionFacts], policy.Decision],
    decision: str,
    new_state: str,
    new_status: str,
    *,
    reason: str | None,
    reason_code: str | None,
    checklist: Mapping[str, Any] | None,
    extra_check: Callable[[OpportunityVersion], None] | None = None,
) -> OpportunityVersion:
    def body() -> OpportunityVersion:
        _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        version = _version(opportunity, opportunity.pending_version_id)
        _enforce(check(_actor(actor), _facts(version)))
        if extra_check is not None:
            extra_check(version)
        current = content_mod.content_hash(version)
        if current != bytes(version.content_hash or b""):
            raise WorkflowError("approval_stale", "The stored revision no longer matches its recorded hash.")
        ReviewDecision.objects.create(
            version=version,
            decision=decision,
            reason_code=reason_code,
            reason=reason,
            checklist=dict(checklist or {}),
            content_hash=current,
            decided_by=actor,
        )
        before = opportunity.status
        version.state = new_state
        if decision == Decision.APPROVED:
            version.approved_by = actor
            version.approved_at = timezone.now()
        elif decision == Decision.RETURNED:
            version.approved_by = None  # approval is void; the hash trigger would also refuse publication
            version.approved_at = None
        version.save()
        if _never_published(opportunity):
            opportunity.status = new_status
        _bump(opportunity)
        _record(ctx, actor, opportunity, version, before, reason)
        return version

    return _run(ctx, actor, opportunity_id, body)


def approve(
    actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int, checklist: Mapping[str, Any]
) -> OpportunityVersion:
    ctx = Context("T04", "opportunity.approve", Permission.OPP_REVIEW_APPROVE)
    required = ["source_reviewed", "duplicates_reviewed", "content_matches_source"]
    unknown = set(checklist) - set(required) - {"applicant_payment_reviewed"}
    if unknown or not all(checklist.get(k) is True for k in required):
        raise ValidationFailed({"checklist": [("required", "Complete every checklist item to approve.")]})

    def fee_acknowledged(version: OpportunityVersion) -> None:
        # AC-CAT-05: where the text mentions applicant payments the reviewer must acknowledge it.
        if fee_lint_triggers(version) and checklist.get("applicant_payment_reviewed") is not True:
            raise ValidationFailed(
                {
                    "checklist.applicant_payment_reviewed": [
                        (
                            "required",
                            "The text mentions applicant payments; "
                            "confirm you reviewed this, or reject the listing.",
                        )
                    ]
                }
            )

    return _review(
        actor,
        opportunity_id,
        expected_row_version,
        ctx,
        policy.can_approve,
        Decision.APPROVED,
        VersionState.APPROVED,
        ListingStatus.APPROVED,
        reason=None,
        reason_code=None,
        checklist=checklist,
        extra_check=fee_acknowledged,
    )


def reject(
    actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int, reason_code: str, reason: str
) -> OpportunityVersion:
    ctx = Context("T05", "opportunity.reject", Permission.OPP_REVIEW_REJECT)
    return _review(
        actor,
        opportunity_id,
        expected_row_version,
        ctx,
        policy.can_reject,
        Decision.REJECTED,
        VersionState.REJECTED,
        ListingStatus.REJECTED,
        reason=_reason(reason),
        reason_code=_code(reason_code),
        checklist=None,
    )


def return_approved(
    actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int, reason_code: str, reason: str
) -> OpportunityVersion:
    ctx = Context("T06", "opportunity.return", Permission.OPP_REVIEW_RETURN)
    return _review(
        actor,
        opportunity_id,
        expected_row_version,
        ctx,
        policy.can_return,
        Decision.RETURNED,
        VersionState.REJECTED,
        ListingStatus.REJECTED,
        reason=_reason(reason),
        reason_code=_code(reason_code),
        checklist=None,
    )


def _code(value: str | None) -> str:
    text = (value or "").strip()
    if not text or len(text) > 40:
        raise ValidationFailed({"reason_code": [("required", "Give a short reason code.")]})
    return text


# --- T07 publish --------------------------------------------------------------------------------
def publish(actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int) -> Opportunity:
    ctx = Context("T07", "opportunity.publish", Permission.OPP_PUBLISH)

    def body() -> Opportunity:
        _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        if opportunity.status == ListingStatus.ARCHIVED:
            raise InvalidTransition()
        version = _version(opportunity, opportunity.pending_version_id)
        _enforce(policy.can_publish(_actor(actor), _facts(version)))
        if content_mod.content_hash(version) != bytes(version.content_hash or b""):
            raise WorkflowError("approval_stale", "The stored revision no longer matches the approved hash.")
        errors = validate_publishable(version)
        if errors:
            if set(errors) == {"deadline_at"} and {c for c, _ in errors["deadline_at"]} == {"in_past"}:
                raise WorkflowError(
                    "deadline_in_past", "The deadline has passed; a new revision is needed.", fields=errors
                )
            raise ValidationFailed(errors)
        now = timezone.now()
        before = opportunity.status
        previous = opportunity.live_version
        if previous is not None:
            previous.state = VersionState.SUPERSEDED
            previous.save()
        version.state = VersionState.PUBLISHED
        version.published_by = actor
        version.published_at = now
        version.save()
        _index(version)
        if opportunity.slug is None:
            opportunity.slug = _assign_slug(opportunity, version.title)
            opportunity.first_published_at = now
        opportunity.status = ListingStatus.PUBLISHED
        opportunity.live_version = version
        opportunity.pending_version = None
        opportunity.last_published_at = now
        opportunity.closed_at = None
        _apply_verification(opportunity, version)
        _bump(opportunity)
        _record(ctx, actor, opportunity, version, before, extra={"approved_by": str(version.approved_by_id)})
        return opportunity

    return _run(ctx, actor, opportunity_id, body)


def _assign_slug(opportunity: Opportunity, title: str) -> str:
    for _ in range(8):
        slug = make_slug(title)
        if not Opportunity.objects.filter(slug=slug).exists():
            return slug
    raise WorkflowError("conflict", "Could not allocate a unique slug.")  # pragma: no cover


def _index(version: OpportunityVersion) -> None:
    """Refresh the full-text vector of a published revision (title A; organisation+summary B; body C)."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE opportunities_opportunityversion v SET search_vector =
                setweight(to_tsvector('english', v.title), 'A')
                || setweight(to_tsvector('english', o.name || ' ' || v.summary), 'B')
                || setweight(to_tsvector('english', v.description_md || ' ' || coalesce(v.requirements_md, '')
                                         || ' ' || coalesce(v.location_text, '')), 'C')
            FROM catalog_organisation o
            WHERE o.id = v.organisation_id AND v.id = %s
            """,
            [version.pk],
        )


def refresh_search_vectors_for_organisation(organisation: Any) -> int:
    """A renamed organisation changes what published listings display, so refresh their vectors."""
    versions = list(
        OpportunityVersion.objects.filter(organisation=organisation, state=VersionState.PUBLISHED)
    )
    for version in versions:
        _index(version)
    return len(versions)


def effective_level(version: OpportunityVersion) -> tuple[str, datetime | None]:
    """Highest confirmed, non-superseded verification level of a revision (D-14); publication adds none."""
    every = list(VerificationRecord.objects.filter(version=version))
    superseded = {r.supersedes_id for r in every if r.supersedes_id}
    records = [r for r in every if r.outcome == VerificationOutcome.CONFIRMED]
    best, checked_at = VerificationLevel.NOT_VERIFIED, None
    for record in records:
        level = VerificationLevel(record.level)
        if record.pk not in superseded and _LEVEL_ORDER[level] > _LEVEL_ORDER[best]:
            best, checked_at = level, record.checked_at
    return str(best), checked_at


def _apply_verification(opportunity: Opportunity, version: OpportunityVersion) -> None:
    level, checked_at = effective_level(version)
    opportunity.verification_level = level
    opportunity.verification_checked_at = checked_at


# --- T09-T12 lifecycle actions (one-person safety/housekeeping actions) -----------------------------
def _lifecycle(
    actor: User,
    opportunity_id: uuid.UUID | str,
    expected_row_version: int,
    ctx: Context,
    allowed_from: tuple[str, ...],
    new_status: str,
    *,
    reason: str | None,
    archive_reason: str | None = None,
) -> Opportunity:
    def body() -> Opportunity:
        _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        if opportunity.status not in allowed_from:
            raise InvalidTransition()
        before = opportunity.status
        opportunity.status = new_status
        opportunity.archive_reason = archive_reason
        if new_status in (ListingStatus.WITHDRAWN, ListingStatus.EXPIRED):
            opportunity.closed_at = timezone.now()
        _bump(opportunity)
        _record(ctx, actor, opportunity, opportunity.live_version, before, reason)
        return opportunity

    return _run(ctx, actor, opportunity_id, body)


def takedown(
    actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int, reason_code: str, reason: str
) -> Opportunity:
    if reason_code not in REASON_CODES_TAKEDOWN:
        raise ValidationFailed(
            {"reason_code": [("invalid_choice", f"Use one of: {', '.join(sorted(REASON_CODES_TAKEDOWN))}.")]}
        )
    ctx = Context("T09", "opportunity.takedown", Permission.OPP_TAKEDOWN)
    return _lifecycle(
        actor,
        opportunity_id,
        expected_row_version,
        ctx,
        (ListingStatus.PUBLISHED, ListingStatus.EXPIRED, ListingStatus.WITHDRAWN),
        ListingStatus.ARCHIVED,
        reason=f"{reason_code}: {_reason(reason, maximum=1000)}",
        archive_reason=ArchiveReason.TAKEDOWN,
    )


def withdraw(
    actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int, reason: str
) -> Opportunity:
    ctx = Context("T10", "opportunity.withdraw", Permission.OPP_WITHDRAW)
    return _lifecycle(
        actor,
        opportunity_id,
        expected_row_version,
        ctx,
        (ListingStatus.PUBLISHED,),
        ListingStatus.WITHDRAWN,
        reason=_reason(reason, maximum=1000),
    )


def expire(
    actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int, reason: str
) -> Opportunity:
    ctx = Context("T11", "opportunity.expire", Permission.OPP_EXPIRE)
    return _lifecycle(
        actor,
        opportunity_id,
        expected_row_version,
        ctx,
        (ListingStatus.PUBLISHED,),
        ListingStatus.EXPIRED,
        reason=_reason(reason, maximum=1000),
    )


def archive(actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int) -> Opportunity:
    ctx = Context("T12", "opportunity.archive", Permission.OPP_ARCHIVE)
    return _lifecycle(
        actor,
        opportunity_id,
        expected_row_version,
        ctx,
        (ListingStatus.EXPIRED, ListingStatus.WITHDRAWN),
        ListingStatus.ARCHIVED,
        reason=None,
        archive_reason=ArchiveReason.HOUSEKEEPING,
    )


def expire_due(now: datetime | None = None) -> int:
    """T11 as the system actor: expire published listings whose live deadline has passed.

    Idempotent and safe to run concurrently: each candidate is re-checked under its row lock. Listings
    with an unknown deadline are never expired automatically."""
    now = now or timezone.now()
    due = list(
        Opportunity.objects.filter(
            status=ListingStatus.PUBLISHED,
            live_version__deadline_at__isnull=False,
            live_version__deadline_at__lte=now,
        ).values_list("pk", flat=True)
    )
    system = _SystemActor()
    count = 0
    ctx = Context("T11", "opportunity.expire", Permission.OPP_EXPIRE)
    for pk in due:
        with transaction.atomic():
            opportunity = (
                Opportunity.objects.select_for_update(of=("self",)).select_related("live_version").get(pk=pk)
            )
            live = opportunity.live_version
            if (
                opportunity.status != ListingStatus.PUBLISHED
                or live is None
                or live.deadline_at is None
                or live.deadline_at > now
            ):
                continue
            before = opportunity.status
            opportunity.status = ListingStatus.EXPIRED
            opportunity.closed_at = now
            _bump(opportunity)
            _record(ctx, system, opportunity, live, before, "deadline passed", actor_type="system")  # type: ignore[arg-type]
            count += 1
    return count


class _SystemActor:
    pk = None

    def active_roles(self) -> frozenset[str]:
        return frozenset()


# --- T13-T15 author actions -----------------------------------------------------------------------
def discard(actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int) -> Opportunity:
    ctx = Context("T13", "opportunity.discard", Permission.OPP_DISCARD_OWN)

    def body() -> Opportunity:
        employer = _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        if employer:
            employer_capability.enforce(actor, opportunity)
        version = _version(opportunity, opportunity.pending_version_id)
        if version.state not in (VersionState.DRAFT, VersionState.REJECTED):
            raise InvalidTransition("Only a draft or a rejected revision can be discarded.")
        if version.author_id != actor.pk:
            raise PermissionDeniedError("permission_denied", "Only the author can discard this revision.")
        before = opportunity.status
        version.state = VersionState.DISCARDED
        version.save()
        opportunity.pending_version = None
        if _never_published(opportunity):
            opportunity.status = ListingStatus.ARCHIVED
            opportunity.archive_reason = ArchiveReason.ABANDONED
        _bump(opportunity)
        _record(ctx, actor, opportunity, version, before)
        return opportunity

    return _run(ctx, actor, opportunity_id, body)


def reopen(actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int) -> OpportunityVersion:
    ctx = Context("T14", "opportunity.reopen", Permission.OPP_DRAFT_EDIT_OWN)

    def body() -> OpportunityVersion:
        employer = _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        if employer:
            employer_capability.enforce(actor, opportunity)
        rejected = _version(opportunity, opportunity.pending_version_id)
        if rejected.state != VersionState.REJECTED:
            raise InvalidTransition("Only a rejected revision can be reopened.")
        if rejected.author_id != actor.pk:
            raise PermissionDeniedError("permission_denied", "Only the author can reopen this revision.")
        before = opportunity.status
        draft = _copy_version(opportunity, rejected, actor)
        opportunity.pending_version = draft
        if _never_published(opportunity):
            opportunity.status = ListingStatus.DRAFT
        _bump(opportunity)
        _record(ctx, actor, opportunity, draft, before)
        return draft

    return _run(ctx, actor, opportunity_id, body)


def amend(actor: User, opportunity_id: uuid.UUID | str, *, expected_row_version: int) -> OpportunityVersion:
    ctx = Context("T15", "opportunity.amend", Permission.OPP_AMEND)

    def body() -> OpportunityVersion:
        employer = _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, expected_row_version)
        if employer:
            employer_capability.enforce(actor, opportunity)
        if opportunity.status not in (
            ListingStatus.PUBLISHED,
            ListingStatus.EXPIRED,
            ListingStatus.WITHDRAWN,
        ):
            raise InvalidTransition("Only a published, expired or withdrawn listing can be amended.")
        if OpportunityVersion.objects.filter(
            opportunity=opportunity,
            state__in=[VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED],
        ).exists():
            raise WorkflowError("amendment_already_open", "An amendment is already in progress.")
        live = _version(opportunity, opportunity.live_version_id)
        draft = _copy_version(opportunity, live, actor)
        opportunity.pending_version = draft
        before = opportunity.status
        _bump(opportunity)
        _record(ctx, actor, opportunity, draft, before)
        return draft

    return _run(ctx, actor, opportunity_id, body)


def _copy_version(opportunity: Opportunity, source: OpportunityVersion, actor: User) -> OpportunityVersion:
    next_no = (
        OpportunityVersion.objects.filter(opportunity=opportunity)
        .order_by("-version_no")
        .values_list("version_no", flat=True)
        .first()
        or 0
    ) + 1
    values = {c: getattr(source, c) for c in content_mod.COPIED_COLUMNS}
    values["detail_schema_version"] = _active_schema_version(opportunity.category)
    draft = OpportunityVersion.objects.create(
        opportunity=opportunity, version_no=next_no, author=actor, based_on_version=source, **values
    )
    content_mod.copy_children(source, draft, actor_id=actor.pk)
    return draft


# --- V01 verification ---------------------------------------------------------------------------
def record_verification(
    actor: User,
    opportunity_id: uuid.UUID | str,
    *,
    version_no: int,
    level: str,
    method: str,
    outcome: str,
    evidence_note: str,
    supersedes_id: uuid.UUID | None = None,
) -> VerificationRecord:
    ctx = Context("V01", "verification.record", Permission.OPP_VERIFY_RECORD)

    def body() -> VerificationRecord:
        _require(actor, ctx.permission)
        opportunity = _lock(opportunity_id, None)
        try:
            version = OpportunityVersion.objects.select_related("opportunity__category").get(
                opportunity=opportunity, version_no=version_no
            )
        except OpportunityVersion.DoesNotExist:
            raise NotFoundError() from None
        _enforce(policy.can_verify(_actor(actor), _facts(version)))
        errors: dict[str, list[tuple[str, str]]] = {}
        if level not in _LEVEL_METHODS:
            errors["level"] = [("invalid_choice", "Level must be source_checked or issuer_verified.")]
        elif method not in _LEVEL_METHODS[VerificationLevel(level)]:
            allowed = ", ".join(sorted(_LEVEL_METHODS[VerificationLevel(level)]))
            errors["method"] = [("invalid_choice", f"This level needs method: {allowed}.")]
        if outcome not in VerificationOutcome.values:
            errors["outcome"] = [("invalid_choice", "Not a valid outcome.")]
        note = (evidence_note or "").strip()
        if not 20 <= len(note) <= 2000:
            errors["evidence_note"] = [("too_short", "Describe the evidence in 20-2000 characters.")]
        if errors:
            raise ValidationFailed(errors)
        superseded = None
        if supersedes_id is not None:
            superseded = VerificationRecord.objects.filter(pk=supersedes_id, version=version).first()
            if superseded is None:
                raise ValidationFailed({"supersedes_id": [("not_found_reference", "Unknown record.")]})
        record = VerificationRecord.objects.create(
            opportunity=opportunity,
            version=version,
            level=level,
            method=method,
            outcome=outcome,
            evidence_note=note,
            checked_by=actor,
            supersedes=superseded,
        )
        if opportunity.live_version_id == version.pk:
            _apply_verification(opportunity, version)
        _bump(opportunity)
        before = opportunity.status
        _record(ctx, actor, opportunity, version, before, extra={"level": level, "outcome": outcome})
        return record

    return _run(ctx, actor, opportunity_id, body)


# --- queries used by the staff interface --------------------------------------------------------
def _has_open_version(opportunity: Opportunity) -> bool:
    return OpportunityVersion.objects.filter(
        opportunity=opportunity, state__in=[VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED]
    ).exists()


def allowed_actions(actor: User, opportunity: Opportunity) -> list[str]:
    """Actions the actor could attempt right now (advisory; every action is re-checked on execution)."""
    if not actor.is_active:
        return []
    version = opportunity.pending_version
    roles = actor.active_roles()

    def has(code: Permission) -> bool:
        return DEFAULT_REGISTRY.has(roles, code)

    out: list[str] = []
    if version is not None:
        facts = _facts(version)
        me = _actor(actor)
        if version.state == VersionState.DRAFT and version.author_id == actor.pk:
            if has(Permission.OPP_SUBMIT):
                out.append("submit")
            if has(Permission.OPP_DISCARD_OWN):
                out.append("discard")
        if version.state == VersionState.REJECTED and version.author_id == actor.pk:
            if has(Permission.OPP_DRAFT_EDIT_OWN):
                out.append("reopen")
            if has(Permission.OPP_DISCARD_OWN):
                out.append("discard")
        if policy.can_approve(me, facts):
            out += ["approve", "reject"]
        if policy.can_return(me, facts):
            out.append("return")
        if policy.can_publish(me, facts):
            out.append("publish")
    if opportunity.status == ListingStatus.PUBLISHED:
        out += [
            a for a, p in (("withdraw", Permission.OPP_WITHDRAW), ("expire", Permission.OPP_EXPIRE)) if has(p)
        ]
    if opportunity.status in (
        ListingStatus.PUBLISHED,
        ListingStatus.EXPIRED,
        ListingStatus.WITHDRAWN,
    ) and has(Permission.OPP_TAKEDOWN):
        out.append("takedown")
    if opportunity.status in (ListingStatus.EXPIRED, ListingStatus.WITHDRAWN) and has(Permission.OPP_ARCHIVE):
        out.append("archive")
    public = (ListingStatus.PUBLISHED, ListingStatus.EXPIRED, ListingStatus.WITHDRAWN)
    if opportunity.status in public and has(Permission.OPP_AMEND) and not _has_open_version(opportunity):
        out.append("amend")
    return out


__all__ = [
    "allowed_actions",
    "amend",
    "approve",
    "archive",
    "chain_author_ids",
    "create_draft",
    "discard",
    "effective_level",
    "expire",
    "expire_due",
    "publish",
    "record_verification",
    "refresh_search_vectors_for_organisation",
    "reject",
    "reopen",
    "return_approved",
    "save_draft",
    "submit",
    "takedown",
    "withdraw",
]
