"""Routine removal of data that is no longer needed (provisional defaults P4-06; OQ-09 still open).

Audit events are not removed here: how long they are kept is undecided, and they hold only an opaque account
number and one-way hashes.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.sessions.models import Session
from django.db.models import Q
from django.utils import timezone

from employers.models import ListingDailyStat
from notifications.models import EmailOutbox, OutboxStatus

from .models import AuthToken, UserSession

SCRUBBED_ADDRESS = "scrubbed@deleted.invalid"


def run(now: datetime | None = None) -> dict[str, int]:
    now = now or timezone.now()
    token_cutoff = now - timedelta(days=settings.UPNEXT_RETENTION_TOKEN_DAYS)
    counts: dict[str, int] = {}
    counts["tokens"] = AuthToken.objects.filter(
        Q(used_at__lt=token_cutoff) | Q(invalidated_at__lt=token_cutoff) | Q(expires_at__lt=token_cutoff)
    ).delete()[0]
    counts["sessions"] = Session.objects.filter(expire_date__lt=now).delete()[0]
    counts["session_records"] = UserSession.objects.filter(
        revoked_at__lt=now - timedelta(days=settings.UPNEXT_RETENTION_REVOKED_SESSION_DAYS)
    ).delete()[0]
    counts["outbox_sent"] = (
        EmailOutbox.objects.filter(
            status=OutboxStatus.SENT,
            sent_at__lt=now - timedelta(days=settings.UPNEXT_RETENTION_OUTBOX_SENT_DAYS),
        )
        .exclude(to_address=SCRUBBED_ADDRESS)
        .update(to_address=SCRUBBED_ADDRESS, payload={})
    )
    counts["outbox_dead"] = (
        EmailOutbox.objects.filter(
            status=OutboxStatus.DEAD,
            created_at__lt=now - timedelta(days=settings.UPNEXT_RETENTION_OUTBOX_DEAD_DAYS),
        )
        .exclude(to_address=SCRUBBED_ADDRESS)
        .update(to_address=SCRUBBED_ADDRESS, payload={})
    )
    counts["listing_stats"] = ListingDailyStat.objects.filter(
        day__lt=(now - timedelta(days=settings.UPNEXT_RETENTION_LISTING_STATS_DAYS)).date()
    ).delete()[0]
    return counts
