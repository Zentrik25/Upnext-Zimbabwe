"""Expiry reminders for employer listings (M2): every housekeeping cycle the worker looks for published
employer listings whose deadline falls within the reminder window (seven days,
`UPNEXT_EXPIRY_REMINDER_DAYS`) and queues one notice per recipient per live revision
(`employers.notifications.listing_expiring`).

Like the expiry job it takes a PostgreSQL advisory lock (one run at a time across worker processes),
records itself in `core_jobrun` as `expiry_reminders`, and does nothing while e-mail delivery is
unverified (B-01). A listing published with fewer than seven days left is reminded on the first run
after publication.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from core.joblock import job_lock
from core.models import JobRun
from notifications import verification
from opportunities.models import ListingStatus, Opportunity

from . import notifications

logger = logging.getLogger("upnext.employer_notify")
JOB_NAME = "expiry_reminders"


@dataclass(frozen=True)
class ReminderRun:
    status: str  # "ran" | "skipped" (another run holds the lock) | "delivery_unverified"
    listings: int = 0
    queued: int = 0


def due_listings(now: datetime) -> list[Opportunity]:
    return list(
        Opportunity.objects.filter(
            status=ListingStatus.PUBLISHED,
            employer_binding__isnull=False,
            live_version__deadline_at__gt=now,
            live_version__deadline_at__lte=now + notifications.reminder_window(),
        ).select_related("live_version")
    )


def run(now: datetime | None = None) -> ReminderRun:
    """One reminder sweep. A failure in one listing is logged and the sweep goes on; a failure of the
    sweep itself is recorded as failed and re-raised."""
    started = timezone.now()
    if not verification.delivery_verified():
        JobRun.record(JOB_NAME, detail="delivery_unverified", started_at=started)
        return ReminderRun("delivery_unverified")
    now = now or started
    with job_lock(JOB_NAME) as acquired:
        if not acquired:
            logger.info("reminders skipped: another run is in progress", extra={"event": "reminders.skipped"})
            return ReminderRun("skipped")
        try:
            listings = queued = 0
            for opportunity in due_listings(now):
                listings += 1
                with transaction.atomic():
                    queued += notifications.listing_expiring(opportunity, now)
        except Exception:
            JobRun.record(JOB_NAME, ok=False, detail="sweep raised; see the log", started_at=started)
            raise
        JobRun.record(JOB_NAME, detail=f"listings={listings} queued={queued}", started_at=started)
    return ReminderRun("ran", listings, queued)
