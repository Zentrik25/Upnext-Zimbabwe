"""Append-only audit log (ERD §3.8). Rows are written by `audit.services.record` and never changed."""

from __future__ import annotations

from django.db import models
from django.utils import timezone


class ActorType(models.TextChoices):
    USER = "user"
    SYSTEM = "system"
    ANONYMOUS = "anonymous"


class Severity(models.TextChoices):
    INFO = "info"
    PRIVILEGED = "privileged"
    SECURITY = "security"


class AuditEvent(models.Model):
    id = models.BigAutoField(primary_key=True)
    occurred_at = models.DateTimeField(default=timezone.now, editable=False)
    actor_type = models.CharField(max_length=16, choices=ActorType.choices)
    actor_ref = models.UUIDField(null=True, blank=True)  # no FK: survives user deletion (OQ-09)
    action = models.CharField(max_length=64)
    object_type = models.CharField(max_length=48)
    object_id = models.UUIDField(null=True, blank=True)
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.INFO)
    request_id = models.CharField(max_length=64, default="-")
    # Field names with old/new values for non-sensitive fields only; never passwords, tokens, e-mails.
    changes = models.JSONField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["object_type", "object_id", "occurred_at"], name="audit_object_idx"),
            models.Index(fields=["actor_ref", "occurred_at"], name="audit_actor_idx"),
            models.Index(fields=["action", "occurred_at"], name="audit_action_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.action}#{self.pk}"
