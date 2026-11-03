"""Proof that e-mail really reaches people (P5-07). Features that depend on delivery stay off without it.

An operator runs `record_email_verification` after a real test send to real mailboxes and after the sender
domain's SPF, DKIM and DMARC were set up. The record is tied to a hash of the live sender configuration, so
changing provider, host or sender address makes the old record stop counting. The repository never writes a
record by itself and no record exists until a person has done the checks; the feature that needs it is
`requestEmailChange`.
"""

from __future__ import annotations

import hashlib
import os
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

MAILBOX_FAMILIES = ("gmail", "outlook", "local-isp", "other")


class EmailDeliveryVerification(models.Model):
    id = models.BigAutoField(primary_key=True)
    verified_at = models.DateTimeField(default=timezone.now, editable=False)
    provider = models.CharField(max_length=40)  # a name the operator types, for example the chosen service
    config_hash = models.CharField(max_length=64)  # of the sender configuration, never of a secret
    mailboxes = models.JSONField(default=list)  # families of mailbox the test messages reached the inbox of
    spf_ok = models.BooleanField(default=False)
    dkim_ok = models.BooleanField(default=False)
    dmarc_ok = models.BooleanField(default=False)
    operator = models.CharField(max_length=80)  # who ran the checks (a name, not a contact detail)
    note = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["-verified_at"], name="emailverif_recent_idx")]

    def __str__(self) -> str:
        return f"{self.provider} verified {self.verified_at:%Y-%m-%d} by {self.operator}"


def config_hash(conf: Any = settings) -> str:
    """Hash of what identifies the sending setup: backend, host, port, security, sender address, reply-to."""
    parts = [
        conf.UPNEXT_EMAIL_BACKEND,
        conf.UPNEXT_SMTP_HOST,
        str(conf.UPNEXT_SMTP_PORT),
        conf.UPNEXT_SMTP_SECURITY,
        conf.UPNEXT_EMAIL_FROM,
        conf.UPNEXT_EMAIL_REPLY_TO,
    ]
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()


def current() -> EmailDeliveryVerification | None:
    """The newest record that matches the live configuration and is not older than the allowed age."""
    max_age = timedelta(days=int(getattr(settings, "UPNEXT_EMAIL_VERIFICATION_MAX_AGE_DAYS", 180)))
    return (
        EmailDeliveryVerification.objects.filter(
            config_hash=config_hash(), verified_at__gte=timezone.now() - max_age
        )
        .order_by("-verified_at")
        .first()
    )


def delivery_verified() -> bool:
    """True only when mail is sent by a real provider and a current verification record exists.

    Throwaway stacks (the file backend with demo tools on, which production refuses at start-up) count as
    verified so the browser tests can exercise the whole feature; nothing else does.
    """
    if settings.UPNEXT_EMAIL_BACKEND == "file" and os.environ.get("UPNEXT_DEMO_TOOLS") == "1":
        return True
    return settings.UPNEXT_EMAIL_BACKEND == "smtp" and current() is not None
