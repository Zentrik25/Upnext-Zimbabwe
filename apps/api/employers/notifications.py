"""Employer e-mail notifications (M2): claims, listing submission, publication, rejection, expiry reminders
and expiry. Everything goes through the existing outbox, so retries, back-off, suppression and the
provider webhook are unchanged.

Rules, in the order they are applied:

* **Off until delivery is verified.** While `delivery_verified()` is false nothing is written at all (the same
  rule as job alerts, B-01). The outbox therefore never fills with rows that cannot be delivered, and no
  real e-mail can leave before the provider is approved, configured and verified by a person.
* **Only the right people.** A listing's notices go to its creator (if still an active member of the
  organisation) and to the organisation's active owners, and only if the account is active, its address is
  confirmed and it is not on the suppression list. A claim's notices go to the claimant only. Membership
  is read at the moment of sending, so someone who left or was removed gets nothing.
* **Once.** Every row has a deterministic idempotency key (event, version or claim, plus recipient), so a
  repeated call, a retry or two concurrent callers write one row. Delivery itself stays at-least-once.
* **Never in the way.** Each entry point runs in its own savepoint and swallows its own failures (logged
  without addresses or content): a notification problem can never roll back an editorial decision, a claim
  decision or the worker.
* **Links are plain, authenticated pages** (`/employer/...`, the public listing). No token and no secret
  is ever put in an employer e-mail.
"""

from __future__ import annotations

import functools
import logging
import math
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.dispatch import receiver
from django.utils import timezone

from accounts.models import AccountStatus, User
from notifications import suppression, verification
from notifications.models import EmailKind
from notifications.services import enqueue_once
from opportunities.models import Opportunity, OpportunityVersion, PublishingEvent
from opportunities.signals import transition_recorded

from .models import EmployerListing, EmployerMembership, MemberRole, OrganisationClaim

logger = logging.getLogger("upnext.employer_notify")

# Workflow transition -> notice (EDITORIAL_WORKFLOW §3). Approval alone (T04) is not announced: the employer
# hears when the listing is published, or when it is returned.
_TRANSITION_KINDS = {
    "T03": EmailKind.EMPLOYER_LISTING_SUBMITTED,
    "T07": EmailKind.EMPLOYER_LISTING_PUBLISHED,
    "T05": EmailKind.EMPLOYER_LISTING_REJECTED,
    "T06": EmailKind.EMPLOYER_LISTING_REJECTED,
    "T11": EmailKind.EMPLOYER_LISTING_EXPIRED,
}


def _isolated(fn: Callable[..., int]) -> Callable[..., int]:
    """Run in a savepoint; log and swallow any failure. Returns 0 (nothing queued) on failure."""

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> int:
        try:
            with transaction.atomic():
                return fn(*args, **kwargs)
        except Exception:
            logger.exception(
                "employer notification failed", extra={"event": "employer_notify.failed", "step": fn.__name__}
            )
            return 0

    return wrapper


def _base_url() -> str:
    return str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip("/")


def _deliverable(user: User) -> bool:
    return (
        user.status == AccountStatus.ACTIVE
        and user.email_verified_at is not None
        and not suppression.is_suppressed(user.email)
    )


def listing_recipients(binding: EmployerListing) -> list[User]:
    """The listing's creator and the organisation's owners, as active members now, who can be e-mailed."""
    members = EmployerMembership.objects.filter(
        organisation_id=binding.organisation_id, revoked_at__isnull=True
    ).select_related("user")
    chosen: dict[Any, User] = {}
    for member in members:
        if member.role == MemberRole.OWNER or member.user_id == binding.created_by_id:
            chosen[member.user_id] = member.user
    return [user for user in chosen.values() if _deliverable(user)]


def _subject(text: str) -> str:
    """One line, no control characters, at most 150 characters (a title is employer-supplied text)."""
    cleaned = " ".join("".join(ch if ch.isprintable() else " " for ch in text).split())
    return cleaned[:150]


def _deadline_text(version: OpportunityVersion) -> str:
    moment = version.deadline_at
    if moment is None:
        return ""
    try:
        local = moment.astimezone(ZoneInfo(version.deadline_timezone or "UTC"))
    except Exception:
        local = moment
    if version.deadline_is_date_only:
        return f"{local:%d %B %Y}"
    return f"{local:%d %B %Y, %H:%M} ({version.deadline_timezone or 'UTC'})"


def _queue(
    kind: str,
    users: list[User],
    *,
    key: Callable[[User], str],
    context: dict[str, Any],
    subject: str | None = None,
) -> int:
    queued = 0
    for user in users:
        payload = {**context, "display_name": user.display_name}
        if subject:
            payload["subject"] = _subject(subject)
        if enqueue_once(kind, user, user.email, idempotency_key=key(user), context=payload) is not None:
            queued += 1
    return queued


# --- claims ------------------------------------------------------------------------------------------
@_isolated
def claim_received(claim: OrganisationClaim) -> int:
    if not verification.delivery_verified():
        return 0
    return _queue(
        EmailKind.EMPLOYER_CLAIM_RECEIVED,
        [claim.user] if _deliverable(claim.user) else [],
        key=lambda user: f"empclaim:{claim.pk}:received:{user.pk}",
        context={"organisation_name": claim.organisation_name, "dashboard_url": f"{_base_url()}/employer"},
    )


@_isolated
def claim_decided(claim: OrganisationClaim) -> int:
    """Call after a claim was approved or rejected. Any other status writes nothing."""
    if not verification.delivery_verified():
        return 0
    approved = claim.status == "approved"
    if not approved and claim.status != "rejected":
        return 0
    name = claim.organisation.name if claim.organisation is not None else claim.organisation_name
    return _queue(
        EmailKind.EMPLOYER_CLAIM_APPROVED if approved else EmailKind.EMPLOYER_CLAIM_REJECTED,
        [claim.user] if _deliverable(claim.user) else [],
        key=lambda user: f"empclaim:{claim.pk}:{claim.status}:{user.pk}",
        context={
            "organisation_name": name,
            "reason": "" if approved else (claim.decision_reason or ""),
            "dashboard_url": f"{_base_url()}/employer",
        },
    )


# --- listing transitions -----------------------------------------------------------------------------
@receiver(transition_recorded, dispatch_uid="employer_notifications_on_transition")
def on_transition(
    sender: Any,
    event: PublishingEvent,
    opportunity: Opportunity,
    version: OpportunityVersion | None,
    reason: str | None,
    **kwargs: Any,
) -> None:
    """Receiver for the publishing service (sent inside the transition's transaction)."""
    listing_event(event, opportunity, version, reason)


@_isolated
def listing_event(
    event: PublishingEvent, opportunity: Opportunity, version: OpportunityVersion | None, reason: str | None
) -> int:
    kind = _TRANSITION_KINDS.get(event.transition)
    if kind is None or not verification.delivery_verified():
        return 0
    binding = EmployerListing.objects.select_related("organisation").filter(opportunity=opportunity).first()
    if binding is None:
        return 0  # a listing staff entered themselves: there is no employer to tell
    shown = version or opportunity.live_version
    if shown is None:
        return 0
    # A listing that has ever been public is being amended; a never-public one is new.
    first = opportunity.first_published_at
    if kind == EmailKind.EMPLOYER_LISTING_PUBLISHED:
        amendment = first is not None and shown.published_at is not None and first < shown.published_at
    else:
        amendment = first is not None
    label = "amendment" if amendment else "listing"
    subjects = {
        EmailKind.EMPLOYER_LISTING_SUBMITTED: f"Your {label} “{shown.title}” was submitted for review",
        EmailKind.EMPLOYER_LISTING_PUBLISHED: (
            f"Your amendment to “{shown.title}” is now live"
            if amendment
            else f"Your listing “{shown.title}” is now published"
        ),
        EmailKind.EMPLOYER_LISTING_REJECTED: f"Your {label} “{shown.title}” needs changes",
        EmailKind.EMPLOYER_LISTING_EXPIRED: f"Your listing “{shown.title}” has closed",
    }
    context = {
        "organisation_name": binding.organisation.name,
        "title": shown.title,
        "amendment": amendment,
        "listing_url": f"{_base_url()}/employer/listings/{opportunity.pk}",
        "public_url": f"{_base_url()}/opportunities/{opportunity.slug}" if opportunity.slug else "",
        "reason": (reason or "") if kind == EmailKind.EMPLOYER_LISTING_REJECTED else "",
        "deadline_text": _deadline_text(shown),
    }
    return _queue(
        kind,
        listing_recipients(binding),
        key=lambda user: f"emplist:{event.pk}:{user.pk}",
        context=context,
        subject=subjects[kind],
    )


# --- expiry reminders --------------------------------------------------------------------------------
def reminder_window() -> timedelta:
    return timedelta(days=int(getattr(settings, "UPNEXT_EXPIRY_REMINDER_DAYS", 7)))


@_isolated
def listing_expiring(opportunity: Opportunity, now: datetime | None = None) -> int:
    """Tell the right people that a published listing closes within the reminder window.

    One notice per recipient per live revision: the key carries the revision, so repeating the sweep adds
    nothing, while an amendment with a new deadline (a new live revision) is reminded again if it is due."""
    if not verification.delivery_verified():
        return 0
    now = now or timezone.now()
    version = opportunity.live_version
    if version is None or version.deadline_at is None or opportunity.status != "published":
        return 0
    if not now < version.deadline_at <= now + reminder_window():
        return 0
    binding = EmployerListing.objects.select_related("organisation").filter(opportunity=opportunity).first()
    if binding is None:
        return 0
    days_left = max(1, math.ceil((version.deadline_at - now) / timedelta(days=1)))
    return _queue(
        EmailKind.EMPLOYER_LISTING_EXPIRING,
        listing_recipients(binding),
        key=lambda user: f"emprem:{version.pk}:{user.pk}",
        context={
            "organisation_name": binding.organisation.name,
            "title": version.title,
            "deadline_text": _deadline_text(version),
            "days_left": days_left,
            "listing_url": f"{_base_url()}/employer/listings/{opportunity.pk}",
        },
        subject=f"Your listing “{version.title}” closes in {days_left} day{'s' if days_left != 1 else ''}",
    )
