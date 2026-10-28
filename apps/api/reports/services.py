"""Public reporting (M2): validate, collapse repeats, store, audit. Nothing here touches a listing.

Protection against abuse, with no third-party service and no file upload:
* a per-client rate limit at the API (`ReportIpThrottle`) and a per-listing daily cap here;
* a honeypot field that humans never see: a filled one is answered like a success and stored nowhere;
* repeats from one client for the same listing and reason are collapsed into the open report (a keyed hash
  of client, listing and reason; not reversible without the server key, cleared once the report is closed),
  so one person cannot fill the queue;
* plain text only, length limits, control characters refused, one https link as evidence (never fetched).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import string
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from audit import services as audit
from audit.models import ActorType, Severity
from catalog.text import TextError, clean_multiline
from catalog.validators import validate_url
from opportunities.errors import FieldErrors, NotFoundError, ValidationFailed, WorkflowError
from opportunities.models import PUBLIC_STATUSES, Opportunity

from .models import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    ListingReport,
    ReportAction,
    ReportEvent,
    ReportReason,
)

logger = logging.getLogger("upnext.reports")

DETAILS_MIN, DETAILS_MAX = 10, 2000
EVIDENCE_MAX = 500
_REFERENCE_ALPHABET = "".join(
    c for c in string.ascii_uppercase + "23456789" if c not in "ILO"
)  # no 0/O/1/I/L


class ReportCapped(WorkflowError):
    """The listing already has more reports today than staff can use; ask the reporter to try later."""

    http_status = 429

    def __init__(self) -> None:
        super().__init__(
            "rate_limited", "This listing has already been reported many times today. Staff will see it."
        )


@dataclass(frozen=True)
class Receipt:
    reference: str
    repeated: bool = False


def _reference() -> str:
    return "R-" + "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(8))


def _hash(value: str) -> str:
    pepper = str(settings.UPNEXT_THROTTLE_PEPPER).encode()
    return hmac.new(pepper, value.encode(), hashlib.sha256).hexdigest()[:32]


def _err(errors: FieldErrors, field: str, code: str, message: str) -> None:
    errors.setdefault(field, []).append((code, message))


def clean(data: dict[str, Any]) -> dict[str, Any]:
    """Validate one submission. Raises `ValidationFailed` listing every problem."""
    errors: FieldErrors = {}
    out: dict[str, Any] = {}

    reason = data.get("reason")
    if reason not in ReportReason.values:
        _err(errors, "reason", "invalid_choice", "Choose what is wrong with this opportunity.")
    else:
        out["reason"] = reason

    details = data.get("details")
    if not isinstance(details, str):
        _err(errors, "details", "required", "Tell us what concerns you.")
    else:
        try:
            text = clean_multiline(details)
        except TextError as exc:
            _err(errors, "details", exc.code, str(exc))
        else:
            if len(text) < DETAILS_MIN:
                _err(errors, "details", "too_short", f"Write at least {DETAILS_MIN} characters.")
            elif len(text) > DETAILS_MAX:
                _err(errors, "details", "too_long", f"Write at most {DETAILS_MAX} characters.")
            else:
                out["details"] = text

    evidence = data.get("evidence_url")
    if evidence not in (None, ""):
        if not isinstance(evidence, str):
            _err(errors, "evidence_url", "invalid_url", "Give a web address.")
        else:
            try:
                url = validate_url(evidence, field_name="The link")
            except TextError as exc:
                _err(errors, "evidence_url", exc.code, str(exc))
            else:
                if len(url) > EVIDENCE_MAX:
                    _err(
                        errors,
                        "evidence_url",
                        "too_long",
                        f"The link may have at most {EVIDENCE_MAX} characters.",
                    )
                else:
                    out["evidence_url"] = url

    contact = data.get("contact_email")
    if contact not in (None, ""):
        if not isinstance(contact, str) or len(contact.strip()) > 254:
            _err(errors, "contact_email", "invalid_email", "Give a valid e-mail address, or leave it empty.")
        else:
            try:
                validate_email(contact.strip())
            except DjangoValidationError:
                _err(
                    errors,
                    "contact_email",
                    "invalid_email",
                    "Give a valid e-mail address, or leave it empty.",
                )
            else:
                out["contact_email"] = contact.strip().lower()

    if errors:
        raise ValidationFailed(errors, "Check the highlighted fields.")
    return out


def _new_report(
    opportunity: Opportunity, clean_data: dict[str, Any], dedupe_key: str, now: datetime
) -> ListingReport:
    report = ListingReport.objects.create(
        reference=_reference(),
        opportunity=opportunity,
        live_version=opportunity.live_version,
        dedupe_key=dedupe_key,
        created_at=now,
        **clean_data,
    )
    ReportEvent.objects.create(report=report, action=ReportAction.CREATED, to_status=report.status)
    audit.record(
        action="report.created",
        object_type="listing_report",
        object_id=report.pk,
        actor_id=None,
        actor_type=ActorType.ANONYMOUS,
        severity=Severity.INFO,
        changes={"opportunity_id": str(opportunity.pk), "reason": report.reason},  # never the free text
    )
    return report


def submit(slug: str, data: dict[str, Any], *, client_ident: str, now: datetime | None = None) -> Receipt:
    """Accept one public report about a public listing.

    Raises `ValidationFailed` (400), `NotFoundError` (404, also for a listing that is not public, so nothing
    is revealed about hidden listings) or `ReportCapped` (429)."""
    now = now or timezone.now()
    if data.get("website"):  # honeypot: answered like a success, stored nowhere
        logger.info("report honeypot filled", extra={"event": "report.honeypot"})
        return Receipt(_reference())
    clean_data = clean(data)
    opportunity = (
        Opportunity.objects.select_related("live_version")
        .filter(slug=slug.lower(), status__in=PUBLIC_STATUSES)
        .first()
    )
    if opportunity is None:
        raise NotFoundError()
    cap = int(getattr(settings, "UPNEXT_REPORT_LISTING_DAILY_CAP", 30))
    if (
        ListingReport.objects.filter(opportunity=opportunity, created_at__gte=now - timedelta(days=1)).count()
        >= cap
    ):
        raise ReportCapped()
    key = _hash(f"report|{client_ident}|{opportunity.pk}|{clean_data['reason']}")
    for _ in range(5):  # a clash of the random reference is astronomically unlikely, but handled
        try:
            with transaction.atomic():
                return Receipt(_new_report(opportunity, clean_data, key, now).reference)
        except IntegrityError:
            with transaction.atomic():
                existing = (
                    ListingReport.objects.select_for_update()
                    .filter(
                        opportunity=opportunity,
                        reason=clean_data["reason"],
                        dedupe_key=key,
                        status__in=OPEN_STATUSES,
                    )
                    .first()
                )
                if existing is not None:  # the same client reporting the same thing again: one report
                    ListingReport.objects.filter(pk=existing.pk).update(
                        duplicate_count=F("duplicate_count") + 1
                    )
                    ReportEvent.objects.create(report=existing, action=ReportAction.REPEATED)
                    return Receipt(existing.reference, repeated=True)
    raise WorkflowError("conflict", "Could not record the report; try again.")  # pragma: no cover


def purge_closed(now: datetime | None = None) -> int:
    """Privacy: clear the optional contact address and the repeat key of reports closed for a while
    (`UPNEXT_RETENTION_REPORT_CONTACT_DAYS`, provisional 30). The report and its history stay."""
    now = now or timezone.now()
    cutoff = now - timedelta(days=int(getattr(settings, "UPNEXT_RETENTION_REPORT_CONTACT_DAYS", 30)))
    stale = ListingReport.objects.filter(status__in=CLOSED_STATUSES, closed_at__lt=cutoff).exclude(
        contact_email__isnull=True, dedupe_key=""
    )
    return stale.update(contact_email=None, dedupe_key="")
