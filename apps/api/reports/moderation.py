"""Staff handling of public reports (M2). Used by the Django Admin; no other entry point exists.

* A report never changes a listing by itself. Only `act_on_listing` does, and it goes through the editorial
  workflow (`workflow.expire / withdraw / takedown`), so its permissions, locking and audit are the same
  as any other lifecycle change.
* Separation of duties (D-18, D-22): a person who authored, submitted or created any revision of the listing
  cannot resolve or dismiss a report about it or act on the listing through it. They may add notes and
  escalate, so their knowledge still reaches the case.
* An escalated report is closed only by someone holding `report.resolve_escalated` (Administrators).
* Every step writes a `ReportEvent` (append-only) and an `AuditEvent` in the same transaction, and uses
  optimistic locking on the report's `row_version`.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction
from django.utils import timezone

from access.registry import Permission
from accounts.models import User
from audit import services as audit
from audit.models import Severity
from catalog.text import TextError, clean_multiline
from opportunities import workflow
from opportunities.errors import (
    InvalidTransition,
    NotFoundError,
    PermissionDeniedError,
    SeparationOfDuties,
    StateConflict,
    ValidationFailed,
)
from opportunities.models import Opportunity, OpportunityVersion, PublishingEvent

from .models import (
    DISMISSAL_REASONS,
    OPEN_STATUSES,
    RESOLVED_OUTCOMES,
    ListingReport,
    ReportAction,
    ReportEvent,
    ReportStatus,
    Resolution,
)

NOTE_MIN, NOTE_MAX = 10, 2000
# Outcomes that are only reachable by really changing the listing, through `act_on_listing`.
LISTING_OUTCOMES = {
    "expire": Resolution.LISTING_EXPIRED,
    "withdraw": Resolution.LISTING_WITHDRAWN,
    "takedown": Resolution.LISTING_TAKEN_DOWN,
}
_PLAIN_OUTCOMES = tuple(r for r in RESOLVED_OUTCOMES if r not in LISTING_OUTCOMES.values())


def _need(actor: User, code: Permission) -> None:
    if not actor.has_permission_code(code):
        raise PermissionDeniedError()


def _note(text: Any, *, required: bool = True) -> str:
    if text in (None, ""):
        if required:
            raise ValidationFailed({"note": [("required", "Write a note explaining what you found or did.")]})
        return ""
    try:
        cleaned = clean_multiline(str(text))
    except TextError as exc:
        raise ValidationFailed({"note": [(exc.code, str(exc))]}) from None
    if len(cleaned) < NOTE_MIN:
        raise ValidationFailed({"note": [("too_short", f"Write at least {NOTE_MIN} characters.")]})
    if len(cleaned) > NOTE_MAX:
        raise ValidationFailed({"note": [("too_long", f"Write at most {NOTE_MAX} characters.")]})
    return cleaned


def participants(opportunity: Opportunity) -> set[uuid.UUID]:
    """Everyone who authored, submitted or created any revision of the listing, or created the listing."""
    people: set[uuid.UUID] = {opportunity.created_by_id}
    for author, submitter in OpportunityVersion.objects.filter(opportunity=opportunity).values_list(
        "author_id", "submitted_by_id"
    ):
        people.add(author)
        if submitter is not None:
            people.add(submitter)
    return people


def is_participant(actor: User, opportunity: Opportunity) -> bool:
    return actor.pk in participants(opportunity)


def _lock(report_id: uuid.UUID | str, expected_row_version: int) -> ListingReport:
    try:
        report = ListingReport.objects.select_for_update().select_related("opportunity").get(pk=report_id)
    except ListingReport.DoesNotExist, ValueError:
        raise NotFoundError() from None
    if report.row_version != expected_row_version:
        raise StateConflict("The report changed; reload and try again.")
    return report


def _step(
    report: ListingReport,
    actor: User,
    action: str,
    *,
    to_status: str | None = None,
    note: str = "",
    listing_event: PublishingEvent | None = None,
    **fields: Any,
) -> ListingReport:
    """Apply `fields`, record the event and the audit row, bump the version. Caller holds the row lock."""
    before = report.status
    if to_status is not None:
        report.status = to_status
    for name, value in fields.items():
        setattr(report, name, value)
    report.row_version += 1
    report.save()
    ReportEvent.objects.create(
        report=report,
        action=action,
        actor=actor,
        from_status=before,
        to_status=report.status,
        note=note,
        listing_event=listing_event,
    )
    audit.record(
        action=f"report.{action}",
        object_type="listing_report",
        object_id=report.pk,
        actor_id=actor.pk,
        severity=Severity.PRIVILEGED if action == ReportAction.LISTING_ACTION else Severity.INFO,
        changes={  # no free text: the note lives in the append-only report history
            "from": before,
            "to": report.status,
            "opportunity_id": str(report.opportunity_id),
            **({"resolution": report.resolution} if report.resolution else {}),
        },
    )
    return report


def _require_open(report: ListingReport) -> None:
    if report.status not in OPEN_STATUSES:
        raise InvalidTransition("This report is already closed.")


def _may_close(actor: User, report: ListingReport) -> None:
    """Common checks for resolving, dismissing and acting on the listing."""
    _require_open(report)
    _need(actor, Permission.REPORT_RESOLVE)
    if report.status == ReportStatus.ESCALATED:
        _need(actor, Permission.REPORT_RESOLVE_ESCALATED)
    if is_participant(actor, report.opportunity):
        raise SeparationOfDuties(
            "You authored, submitted or created this listing, so you cannot decide a report about it."
        )


@transaction.atomic
def investigate(actor: User, report_id: uuid.UUID | str, *, expected_row_version: int) -> ListingReport:
    _need(actor, Permission.REPORT_TRIAGE)
    report = _lock(report_id, expected_row_version)
    if report.status != ReportStatus.OPEN:
        raise InvalidTransition("Only an open report can be taken for investigation.")
    return _step(
        report, actor, ReportAction.INVESTIGATING, to_status=ReportStatus.INVESTIGATING, assigned_to=actor
    )


@transaction.atomic
def add_note(
    actor: User, report_id: uuid.UUID | str, *, expected_row_version: int, note: Any
) -> ListingReport:
    _need(actor, Permission.REPORT_TRIAGE)
    text = _note(note)
    report = _lock(report_id, expected_row_version)
    _require_open(report)
    return _step(report, actor, ReportAction.NOTE, note=text)


@transaction.atomic
def escalate(
    actor: User, report_id: uuid.UUID | str, *, expected_row_version: int, note: Any
) -> ListingReport:
    """Hand the report to an Administrator. Open to everyone who can triage, including a participant."""
    _need(actor, Permission.REPORT_TRIAGE)
    text = _note(note)
    report = _lock(report_id, expected_row_version)
    if report.status not in (ReportStatus.OPEN, ReportStatus.INVESTIGATING):
        raise InvalidTransition("Only an open report can be escalated.")
    return _step(report, actor, ReportAction.ESCALATED, to_status=ReportStatus.ESCALATED, note=text)


def _close(
    actor: User,
    report: ListingReport,
    action: str,
    status: str,
    resolution: str,
    note: str,
    listing_event: PublishingEvent | None = None,
) -> ListingReport:
    return _step(
        report,
        actor,
        action,
        to_status=status,
        note=note,
        listing_event=listing_event,
        resolution=resolution,
        closed_by=actor,
        closed_at=timezone.now(),
    )


@transaction.atomic
def resolve(
    actor: User, report_id: uuid.UUID | str, *, expected_row_version: int, resolution: str, note: Any
) -> ListingReport:
    """Close a report whose concern was found true and put right, or checked and found fine. The three
    outcomes that change the listing are reached only through `act_on_listing`."""
    if resolution not in _PLAIN_OUTCOMES:
        raise ValidationFailed({"resolution": [("invalid_choice", "Choose how this report was resolved.")]})
    text = _note(note)
    report = _lock(report_id, expected_row_version)
    _may_close(actor, report)
    return _close(actor, report, ReportAction.RESOLVED, ReportStatus.RESOLVED, resolution, text)


@transaction.atomic
def dismiss(
    actor: User, report_id: uuid.UUID | str, *, expected_row_version: int, resolution: str, note: Any
) -> ListingReport:
    if resolution not in DISMISSAL_REASONS:
        raise ValidationFailed({"resolution": [("invalid_choice", "Choose why this report is dismissed.")]})
    text = _note(note)
    report = _lock(report_id, expected_row_version)
    _may_close(actor, report)
    return _close(actor, report, ReportAction.DISMISSED, ReportStatus.DISMISSED, resolution, text)


@transaction.atomic
def reopen(actor: User, report_id: uuid.UUID | str, *, expected_row_version: int, note: Any) -> ListingReport:
    """Administrators only: a closed report goes back to the open queue (for example after new evidence)."""
    _need(actor, Permission.REPORT_RESOLVE_ESCALATED)
    text = _note(note)
    report = _lock(report_id, expected_row_version)
    if report.status not in (ReportStatus.RESOLVED, ReportStatus.DISMISSED):
        raise InvalidTransition("Only a closed report can be reopened.")
    return _step(
        report,
        actor,
        ReportAction.REOPENED,
        to_status=ReportStatus.OPEN,
        note=text,
        resolution="",
        closed_by=None,
        closed_at=None,
    )


@transaction.atomic
def act_on_listing(
    actor: User,
    report_id: uuid.UUID | str,
    *,
    expected_row_version: int,
    action: str,
    reason: Any,
    reason_code: str = "other",
) -> ListingReport:
    """Expire, withdraw or take down the reported listing via the editorial workflow, then close the report.

    One transaction: the report row is locked first, then the workflow takes the listing's lock and writes its
    own transition and audit. If the workflow refuses (permission, state), nothing at all is changed."""
    if action not in LISTING_OUTCOMES:
        raise ValidationFailed({"action": [("invalid_choice", "Choose expire, withdraw or take down.")]})
    text = _note(reason)
    report = _lock(report_id, expected_row_version)
    _may_close(actor, report)
    version = Opportunity.objects.values_list("row_version", flat=True).get(pk=report.opportunity_id)
    summary = f"Report {report.reference}: {text}"[:1000]
    if action == "expire":
        workflow.expire(actor, report.opportunity_id, expected_row_version=version, reason=summary)
    elif action == "withdraw":
        workflow.withdraw(actor, report.opportunity_id, expected_row_version=version, reason=summary)
    else:
        workflow.takedown(
            actor,
            report.opportunity_id,
            expected_row_version=version,
            reason_code=reason_code,
            reason=summary,
        )
    event = (
        PublishingEvent.objects.filter(opportunity_id=report.opportunity_id).order_by("-occurred_at").first()
    )
    return _close(
        actor,
        report,
        ReportAction.LISTING_ACTION,
        ReportStatus.RESOLVED,
        LISTING_OUTCOMES[action],
        text,
        listing_event=event,
    )
