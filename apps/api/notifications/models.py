"""Transactional e-mail outbox (ERD §3.9, SECURITY_ARCHITECTURE §4, ADR-0004).

A request that needs an e-mail inserts a row in the same transaction as the state change; a worker sends it
later. No secret is stored: links are derived from the `auth_token` id at send time.
"""

from __future__ import annotations

import uuid

from django.db import models
from django.db.models import Q
from django.utils import timezone

from accounts.fields import CaseInsensitiveEmailField


class EmailKind(models.TextChoices):
    EMAIL_VERIFICATION = "email_verification"
    ACCOUNT_EXISTS = "account_exists"
    PASSWORD_RESET = "password_reset"  # noqa: S105
    PASSWORD_CHANGED_NOTICE = "password_changed_notice"  # noqa: S105
    ACCOUNT_DELETION_NOTICE = "account_deletion_notice"
    ACCOUNT_DELETION_COMPLETED = "account_deletion_completed"
    EMAIL_CHANGE_CONFIRM = "email_change_confirm"
    EMAIL_CHANGE_REQUESTED_NOTICE = "email_change_requested_notice"
    EMAIL_CHANGED_NOTICE = "email_changed_notice"


class OutboxStatus(models.TextChoices):
    PENDING = "pending"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"
    DEAD = "dead"


class EmailOutbox(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=32, choices=EmailKind.choices)
    user = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    to_address = CaseInsensitiveEmailField(max_length=254)
    template_key = models.CharField(max_length=64)
    template_version = models.PositiveSmallIntegerField(default=1)
    payload = models.JSONField(default=dict)  # variables and the auth_token id only; scrubbed after sending
    idempotency_key = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=10, choices=OutboxStatus.choices, default=OutboxStatus.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.CharField(max_length=64, null=True, blank=True)
    provider_message_id = models.CharField(max_length=200, null=True, blank=True)
    last_error = models.CharField(max_length=300, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["status", "next_attempt_at"],
                name="outbox_due_idx",
                condition=Q(status__in=["pending", "failed"]),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.status}"


class EmailSuppression(models.Model):
    """Addresses we must not send to (bounce, complaint, manual). Only a keyed hash is stored, so the
    list itself holds no addresses. A provider's bounce and complaint feed will call `suppression.suppress`
    once a provider is chosen (OQ-03)."""

    address_hash = models.CharField(max_length=64, unique=True)
    reason = models.CharField(max_length=32)  # bounce | complaint | manual
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    def __str__(self) -> str:
        return f"{self.reason}:{self.address_hash[:8]}"


from .verification import EmailDeliveryVerification  # noqa: E402,F401
