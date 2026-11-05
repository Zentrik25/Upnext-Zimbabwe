"""The Google Indexing API queue (D-68). Public listing addresses only: no personal data is stored here."""

from __future__ import annotations

import uuid

from django.db import models
from django.db.models import Q
from django.utils import timezone


class Action(models.TextChoices):
    UPDATED = "URL_UPDATED"  # a job page was published or materially changed
    DELETED = "URL_DELETED"  # a job page closed (noindex) or was removed (404)


class Status(models.TextChoices):
    PENDING = "pending"  # waiting for its first attempt
    SENDING = "sending"  # claimed by a worker
    FAILED = "failed"  # a temporary failure: waits for `next_attempt_at`
    SENT = "sent"  # Google accepted it (HTTP 200)
    DEAD = "dead"  # rejected for good, or out of attempts: needs a person (alert `indexing.dead`)
    SUPERSEDED = "superseded"  # a newer notification for the same address replaced it before it was sent


WAITING = (Status.PENDING, Status.FAILED)


class IndexingNotification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Deterministic: "event:<publishing event id>". A repeated signal or a retried transaction writes one row.
    idempotency_key = models.CharField(max_length=80, unique=True)
    opportunity = models.ForeignKey(
        "opportunities.Opportunity", on_delete=models.PROTECT, related_name="+", null=True
    )
    url = models.CharField(max_length=2048)  # the public listing address, absolute https
    action = models.CharField(max_length=12, choices=Action.choices)
    transition = models.CharField(max_length=8)  # the workflow transition that caused it (T07, T10, ...)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.CharField(max_length=64, null=True, blank=True)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    last_error = models.CharField(
        max_length=120, blank=True, default=""
    )  # a short code, never a response body
    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "indexing_notification"
        indexes = [
            models.Index(fields=["status", "next_attempt_at"], name="idx_notif_due"),
            models.Index(fields=["url", "-created_at"], name="idx_notif_url_latest"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(url__startswith="http"), name="idx_notif_url_absolute"),
            models.CheckConstraint(
                condition=Q(action__in=[Action.UPDATED, Action.DELETED]), name="idx_notif_action_known"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.url} ({self.status})"


class IndexingQuotaDay(models.Model):
    """Requests made on one Google quota day (quotas reset at midnight Pacific time). One small row per
    day."""

    day = models.DateField(unique=True)
    used = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "indexing_quota_day"

    def __str__(self) -> str:
        return f"{self.day}: {self.used}"
