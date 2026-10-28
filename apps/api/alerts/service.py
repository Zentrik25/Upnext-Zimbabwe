"""Job alerts: preferences, consent, the due check, the digest builder and the gated worker pass.

Nothing here talks to a mail provider. A digest becomes an outbox row (`EmailKind.JOB_ALERT`) in the same
transaction that moves the watermark and writes the ledger, so a crash cannot send a listing twice or lose
the position. **While `delivery_verified()` is false `run_due` does nothing at all** (B-01, P6B-10).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounts.models import AccountStatus, User
from audit import services as audit
from audit.models import ActorType
from catalog.models import Category, Location
from catalog.places import with_descendants
from notifications import services as outbox
from notifications import suppression, verification
from notifications.models import EmailKind
from opportunities import public
from opportunities.models import OpportunityVersion

from .models import CONSENT_WORDING_VERSION, AlertDelivery, Frequency, JobAlert

logger = logging.getLogger("upnext.alerts")

MAX_PER_DIGEST = 10  # PROVISIONAL (P6B-08)
MAX_CATEGORIES, MAX_LOCATIONS = 6, 10
INTERVAL = {Frequency.DAILY: timedelta(days=1), Frequency.WEEKLY: timedelta(days=7)}
SLACK = timedelta(minutes=10)  # the worker pass runs every few minutes; do not wait a whole extra cycle
LEDGER_DAYS = 30  # PROVISIONAL (P6B-11)


class AlertError(Exception):
    """A rule failed; `fields` maps a field name to messages (rendered as a 400 `validation_failed`)."""

    def __init__(self, fields: dict[str, list[str]], code: str = "validation_failed") -> None:
        super().__init__(str(fields))
        self.fields, self.code = fields, code


@dataclass
class Item:
    title: str
    organisation: str
    place: str
    closes: str
    path: str

    def as_payload(self) -> dict[str, str]:
        return {
            "title": self.title,
            "organisation": self.organisation,
            "place": self.place,
            "closes": self.closes,
            "path": self.path,
        }


@dataclass
class Digest:
    items: list[Item]
    more_count: int
    versions: list[OpportunityVersion] = field(default_factory=list)


@dataclass
class RunResult:
    status: str  # "ran" or "delivery_unverified"
    checked: int = 0
    queued: int = 0
    skipped: int = 0  # ineligible account, or nothing new
    listings: int = 0


def get(user: User) -> JobAlert | None:
    return JobAlert.objects.filter(user=user).prefetch_related("categories", "locations").first()


def eligible(user: User) -> bool:
    """Active, confirmed address, no deletion pending, not on the suppression list."""
    return (
        user.status == AccountStatus.ACTIVE
        and user.email_verified_at is not None
        and user.deletion_requested_at is None
        and user.deleted_at is None
        and not suppression.is_suppressed(user.email)
    )


def update(user: User, data: dict[str, Any], *, now: datetime | None = None) -> JobAlert:
    """Apply a validated change. `data` may hold: enabled, frequency, categories, locations (model
    instances), consent. Switching on needs explicit consent, a confirmed address and at least one choice."""
    now = now or timezone.now()
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        alert, _ = JobAlert.objects.select_for_update().get_or_create(user=locked)
        was_enabled = alert.enabled
        categories: list[Category] = (
            data["categories"] if "categories" in data else list(alert.categories.all())
        )
        locations: list[Location] = data["locations"] if "locations" in data else list(alert.locations.all())
        wants = data.get("enabled", was_enabled)
        if wants:
            problems: dict[str, list[str]] = {}
            if locked.email_verified_at is None or locked.status != AccountStatus.ACTIVE:
                raise AlertError({"enabled": ["Confirm your e-mail address first."]}, "email_not_verified")
            if not categories and not locations:
                problems["categories"] = ["Choose at least one category or place."]
            if not was_enabled and data.get("consent") is not True:
                problems["consent"] = ["Tick the box to agree to receive these e-mails."]
            if problems:
                raise AlertError(problems)
        if "frequency" in data:
            alert.frequency = data["frequency"]
        if wants and not was_enabled:
            alert.enabled, alert.consented_at, alert.withdrawn_at = True, now, None
            alert.consent_wording_version = CONSENT_WORDING_VERSION
            alert.last_checked_at = now  # no backlog: only listings published from now on
        elif not wants and was_enabled:
            alert.enabled, alert.withdrawn_at = False, now
        alert.save()
        if "categories" in data:
            alert.categories.set(categories)
        if "locations" in data:
            alert.locations.set(locations)
        action = (
            "alerts.enabled"
            if wants and not was_enabled
            else "alerts.disabled"
            if was_enabled and not wants
            else "alerts.updated"
        )
        audit.record(action=action, object_type="user", object_id=locked.pk, actor_id=locked.pk)
    return get(user) or alert


def withdraw(user_id: uuid.UUID, *, now: datetime | None = None) -> bool:
    """Switch the alert off (the unsubscribe link). Idempotent; True if it was on."""
    now = now or timezone.now()
    with transaction.atomic():
        alert = JobAlert.objects.select_for_update().filter(user_id=user_id).first()
        if alert is None or not alert.enabled:
            return False
        alert.enabled, alert.withdrawn_at = False, now
        alert.save()
        audit.record(
            action="alerts.unsubscribed",
            object_type="user",
            object_id=user_id,
            actor_id=user_id,
            actor_type=ActorType.USER,
        )
    return True


def delete_for(user: User) -> int:
    """Remove the alert, its choices and its ledger (account deletion)."""
    return JobAlert.objects.filter(user=user).delete()[0]


# --- digest -------------------------------------------------------------------------------------
def _matching(alert: JobAlert, now: datetime) -> Any:
    assert alert.last_checked_at is not None
    qs = public.visible_versions().filter(
        Q(deadline_at__isnull=True) | Q(deadline_at__gt=now),
        opportunity__first_published_at__gt=alert.last_checked_at,
        opportunity__first_published_at__lte=now,
    )
    codes = [c.code for c in alert.categories.all()]
    if codes:
        qs = qs.filter(opportunity__category__code__in=codes)
    place_ids = [loc.pk for loc in alert.locations.all()]
    if place_ids:
        qs = qs.filter(locations__location__in=with_descendants(place_ids)).distinct()
    sent = AlertDelivery.objects.filter(alert=alert).values("opportunity_id")
    return qs.exclude(opportunity_id__in=sent).order_by(
        "-opportunity__first_published_at", "-opportunity__slug"
    )


def _item(version: OpportunityVersion) -> Item:
    places = sorted(version.locations.all(), key=lambda r: (not r.is_primary, r.location.name))
    if version.deadline_at:
        closes = f"Closes {version.deadline_at.astimezone(timezone.get_default_timezone()):%d %b %Y}"
    else:
        closes = "No closing date stated"
    return Item(
        title=version.title,
        organisation=version.organisation.name,
        place=places[0].location.name if places else "Location not stated",
        closes=closes,
        path=f"/opportunities/{version.opportunity.slug}",
    )


def build_digest(alert: JobAlert, now: datetime) -> Digest | None:
    """Newly published, still open listings matching the alert; None when there are none. Writes nothing."""
    qs = _matching(alert, now)
    total = qs.count()
    if total == 0:
        return None
    versions = list(qs.prefetch_related("locations__location")[:MAX_PER_DIGEST])
    return Digest(
        items=[_item(v) for v in versions], more_count=max(total - len(versions), 0), versions=versions
    )


def due_ids(now: datetime) -> list[int]:
    rows = JobAlert.objects.filter(enabled=True, last_checked_at__isnull=False).values_list(
        "pk", "frequency", "last_checked_at"
    )
    return [
        pk for pk, freq, checked in rows if checked and checked + INTERVAL[Frequency(freq)] - SLACK <= now
    ]


def _headline(digest: Digest) -> tuple[str, str]:
    shown, total = len(digest.items), len(digest.items) + digest.more_count
    noun = "opportunity" if total == 1 else "opportunities"
    subject = f"{total} new {noun} matching your {settings.UPNEXT_BRAND_NAME} alert"
    headline = (
        f"{total} new {noun} matching your alert."
        if not digest.more_count
        else f"{total} new opportunities matching your alert. The {shown} newest are below."
    )
    return subject, headline


def _process(alert_id: int, now: datetime, *, dry_run: bool, result: RunResult) -> None:
    with transaction.atomic():
        alert = (
            JobAlert.objects.select_for_update(skip_locked=True)
            .select_related("user")
            .prefetch_related("categories", "locations")
            .filter(pk=alert_id, enabled=True)
            .first()
        )
        if alert is None or alert.last_checked_at is None:
            return
        if alert.last_checked_at + INTERVAL[Frequency(alert.frequency)] - SLACK > now:
            return  # another worker handled it
        result.checked += 1
        previous = alert.last_checked_at
        digest = build_digest(alert, now) if eligible(alert.user) else None
        if digest is None:
            result.skipped += 1
        else:
            result.listings += len(digest.items)
        if dry_run:
            result.queued += int(digest is not None)
            return
        if digest is not None:
            subject, headline = _headline(digest)
            outbox.enqueue(
                EmailKind.JOB_ALERT,
                alert.user,
                alert.user.email,
                idempotency_key=f"job_alert:{alert.pk}:{previous.isoformat()}",
                context={
                    "display_name": alert.user.display_name,
                    "subject": subject,
                    "headline": headline,
                    "frequency": alert.frequency,
                    "items": [i.as_payload() for i in digest.items],
                    "more_count": digest.more_count,
                    "search_query": _search_query(alert),
                },
            )
            AlertDelivery.objects.bulk_create(
                [AlertDelivery(alert=alert, opportunity=v.opportunity) for v in digest.versions],
                ignore_conflicts=True,
            )
            alert.last_sent_at = now
            result.queued += 1
        alert.last_checked_at = now
        alert.save(update_fields=["last_checked_at", "last_sent_at", "updated_at"])


def _search_query(alert: JobAlert) -> str:
    parts = []
    if codes := sorted(c.code for c in alert.categories.all()):
        parts.append("category=" + ",".join(codes))
    if slugs := sorted(loc.slug for loc in alert.locations.all()):
        parts.append("location=" + ",".join(slugs))
    parts.append("sort=newest")
    return "&".join(parts)


def run_due(now: datetime | None = None, *, dry_run: bool = False) -> RunResult:
    """One worker pass. Does nothing, and writes nothing, unless e-mail delivery has been verified."""
    if not verification.delivery_verified():
        return RunResult("delivery_unverified")
    now = now or timezone.now()
    result = RunResult("ran")
    for alert_id in due_ids(now):
        try:
            _process(alert_id, now, dry_run=dry_run, result=result)
        except Exception:  # one failing account must not stop the others
            logger.exception("alert failed", extra={"event": "alerts.failed", "alert_id": alert_id})
    return result


def purge_ledger(now: datetime | None = None) -> int:
    now = now or timezone.now()
    return AlertDelivery.objects.filter(created_at__lt=now - timedelta(days=LEDGER_DAYS)).delete()[0]
