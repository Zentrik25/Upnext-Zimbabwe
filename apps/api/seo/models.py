"""The Indexing API outbox (ADR-0027).

One row is one notification to send to Google about one public listing address. It is written in the same
transaction as the editorial transition that caused it (a transactional outbox, like the e-mail outbox of
ADR-0004), and sent later by the worker, so publishing never waits for or fails because of Google.

A row is *open* while it is `pending` or `retry`. At most one open row exists per address: a newer decision about the
same address replaces the kind of the open row instead of adding a second notification (duplicate prevention).

Nothing here says a page is indexed. `sent` means Google's API accepted the notification (HTTP 200); Google decides
later whether and when to crawl, and no response from this API reports indexing.
"""

from __future__ import annotations

import uuid

from django.db import models
from django.db.models import Q
from django.utils import timezone


class NotificationKind(models.TextChoices):
    UPDATED = "URL_UPDATED"
    DELETED = "URL_DELETED"


class NotificationStatus(models.TextChoices):
    PENDING = "pending"  # waiting for the worker
    RETRY = "retry"  # a send failed in a way worth repeating; `next_attempt_at` says when
    SENT = "sent"  # accepted by the API
    DEAD = "dead"  # permanent failure, or out of attempts
    SKIPPED = "skipped"  # not sent on purpose; `detail` says why


OPEN_STATUSES = (NotificationStatus.PENDING, NotificationStatus.RETRY)


class IndexingNotification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(
        "opportunities.Opportunity", null=True, on_delete=models.SET_NULL, related_name="+"
    )
    url = models.CharField(max_length=500)
    kind = models.CharField(max_length=12, choices=NotificationKind.choices)
    # Why it was queued: the workflow transition code (T07 publish, T09 takedown, T10 withdraw, T11 expire, ...)
    # or "backfill".
    trigger = models.CharField(max_length=12)
    status = models.CharField(
        max_length=8, choices=NotificationStatus.choices, default=NotificationStatus.PENDING
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    # Short machine-readable note: the skip reason or the last error class. Never a credential or a response body.
    detail = models.CharField(max_length=300, blank=True, default="")
    # The time Google reports it received the notification (urlNotificationMetadata.latestUpdate.notifyTime).
    google_notify_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["status", "next_attempt_at"],
                name="idxnotif_due_idx",
                condition=Q(status__in=["pending", "retry"]),
            ),
            models.Index(fields=["url", "-created_at"], name="idxnotif_url_idx"),
            models.Index(fields=["-created_at"], name="idxnotif_created_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["url"],
                condition=Q(status__in=["pending", "retry"]),
                name="idxnotif_one_open_per_url",
            ),
            models.CheckConstraint(
                condition=Q(kind__in=["URL_UPDATED", "URL_DELETED"]), name="idxnotif_kind_valid"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.kind} {self.url} [{self.status}]"
