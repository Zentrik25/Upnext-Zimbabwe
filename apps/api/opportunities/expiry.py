"""Scheduled expiry of listings whose deadline has passed (T11, M1 A-02).

`workflow.expire_due()` does the work and is already safe to repeat: each listing is re-checked under its row
lock, and a listing with an unknown deadline is never expired. This module adds what a scheduler needs: only
one run at a time, and a `core_jobrun` row so monitoring can see that it ran (`job.expiry_*` alerts).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone

from core.joblock import job_lock
from core.models import JobRun

from . import workflow

logger = logging.getLogger("upnext.expiry")
JOB_NAME = "expiry"


@dataclass(frozen=True)
class ExpiryRun:
    status: str  # "ran" | "skipped" (another run holds the lock; nothing was done)
    expired: int = 0


def run(now: datetime | None = None) -> ExpiryRun:
    """Expire every published listing whose live deadline has passed, unless another run is in progress.

    A skipped run writes no `JobRun` row: the run that holds the lock records itself. A failed run records
    the failure, then re-raises so the caller sees it."""
    started = timezone.now()
    with job_lock(JOB_NAME) as acquired:
        if not acquired:
            logger.info("expiry skipped: another run is in progress", extra={"event": "expiry.skipped"})
            return ExpiryRun("skipped")
        try:
            expired = workflow.expire_due(now)
        except Exception:
            JobRun.record(JOB_NAME, ok=False, detail="expire_due raised; see the log", started_at=started)
            raise
        JobRun.record(JOB_NAME, detail=f"expired={expired}", started_at=started)
    if expired:
        logger.info("listings expired", extra={"event": "expiry.expired", "count": expired})
    return ExpiryRun("ran", expired)
