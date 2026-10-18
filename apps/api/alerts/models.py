"""Job alerts (Phase 6B, D-38, ADR-0023): one opt-in alert per account and a ledger of what was sent.

Holds the choices (categories, places, frequency), the consent proof (time and wording version) and a
watermark, nothing else. No address is stored here: the message goes to the account's current verified
address at the moment it is built.
"""

from __future__ import annotations

from django.db import models
from django.db.models import Q
from django.utils import timezone

from catalog.models import Category, Location

CONSENT_WORDING_VERSION = "alerts-consent-v1"


class Frequency(models.TextChoices):
    DAILY = "daily"
    WEEKLY = "weekly"


class JobAlert(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField("accounts.User", on_delete=models.CASCADE, related_name="job_alert")
    enabled = models.BooleanField(default=False)
    frequency = models.CharField(max_length=8, choices=Frequency.choices, default=Frequency.WEEKLY)
    categories = models.ManyToManyField(Category, blank=True, related_name="+")
    locations = models.ManyToManyField(Location, blank=True, related_name="+")
    # Consent proof: set when the person switches alerts on, kept (with the wording version) after
    # switching off so a withdrawal can be shown to follow a consent.
    consented_at = models.DateTimeField(null=True, blank=True)
    consent_wording_version = models.CharField(max_length=24, blank=True, default="")
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    # Listings published after this moment are "new". Set when alerts are switched on (no backlog) and moved
    # forward by every check, whether or not an e-mail was needed.
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(enabled=True) | Q(consented_at__isnull=False, last_checked_at__isnull=False),
                name="alert_enabled_has_consent_and_watermark",
            )
        ]
        indexes = [models.Index(fields=["last_checked_at"], condition=Q(enabled=True), name="alert_due_idx")]

    def __str__(self) -> str:
        return str(self.user_id)


class AlertDelivery(models.Model):
    """A listing that has been put into an alert e-mail for this alert: it is never offered again."""

    id = models.BigAutoField(primary_key=True)
    alert = models.ForeignKey(JobAlert, on_delete=models.CASCADE, related_name="deliveries")
    opportunity = models.ForeignKey("opportunities.Opportunity", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["alert", "opportunity"], name="alert_delivery_once_per_listing")
        ]
        indexes = [models.Index(fields=["created_at"], name="alertdelivery_created_idx")]

    def __str__(self) -> str:
        return f"{self.alert_id}:{self.opportunity_id}"
