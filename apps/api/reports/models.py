"""Public reports about listings (M2): the report, and its append-only history.

A report never changes a listing. It is a message to staff; any action on the listing is taken by a person
through the publishing service (`opportunities.workflow`), with its own permission checks and audit trail.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from accounts.fields import CaseInsensitiveEmailField
from opportunities.models import Opportunity, OpportunityVersion, PublishingEvent


class ReportReason(models.TextChoices):
    FAKE_JOB = "fake_job", "Suspected fake job"
    PAYMENT_SCAM = "payment_scam", "Recruitment scam or payment request"
    INCORRECT_APPLICATION = "incorrect_application", "Incorrect application information"
    EXPIRED = "expired", "Expired listing"
    MISLEADING = "misleading", "Misleading content"
    DUPLICATE = "duplicate", "Duplicate listing"
    OTHER = "other", "Other concern"


class ReportStatus(models.TextChoices):
    OPEN = "open", "Open"
    INVESTIGATING = "investigating", "Investigating"
    ESCALATED = "escalated", "Escalated"
    RESOLVED = "resolved", "Resolved"
    DISMISSED = "dismissed", "Dismissed"


OPEN_STATUSES = (ReportStatus.OPEN, ReportStatus.INVESTIGATING, ReportStatus.ESCALATED)
CLOSED_STATUSES = (ReportStatus.RESOLVED, ReportStatus.DISMISSED)


class Resolution(models.TextChoices):
    # Outcomes of a resolved report (something was found, or done)
    LISTING_CORRECTED = "listing_corrected", "Listing corrected"
    LISTING_EXPIRED = "listing_expired", "Listing marked as expired"
    LISTING_WITHDRAWN = "listing_withdrawn", "Listing withdrawn"
    LISTING_TAKEN_DOWN = "listing_taken_down", "Listing taken down"
    NO_ACTION_NEEDED = "no_action_needed", "Checked; no action needed"
    # Reasons for dismissing a report
    NOT_SUBSTANTIATED = "not_substantiated", "Not substantiated"
    ALREADY_HANDLED = "already_handled", "Already handled"
    OUT_OF_SCOPE = "out_of_scope", "Out of scope"
    SPAM = "spam", "Spam or abuse"


RESOLVED_OUTCOMES = (
    Resolution.LISTING_CORRECTED,
    Resolution.LISTING_EXPIRED,
    Resolution.LISTING_WITHDRAWN,
    Resolution.LISTING_TAKEN_DOWN,
    Resolution.NO_ACTION_NEEDED,
)
DISMISSAL_REASONS = (
    Resolution.NOT_SUBSTANTIATED,
    Resolution.ALREADY_HANDLED,
    Resolution.OUT_OF_SCOPE,
    Resolution.SPAM,
)


class ListingReport(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=12, unique=True)  # what the reporter is shown, e.g. R-7K3QXM2P
    opportunity = models.ForeignKey(Opportunity, on_delete=models.PROTECT, related_name="reports")
    # The live revision when it was reported, so staff see what the reporter saw even after an amendment.
    live_version = models.ForeignKey(
        OpportunityVersion, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reason = models.CharField(max_length=24, choices=ReportReason.choices)
    details = models.TextField()  # plain text, 10 to 2000 characters
    evidence_url = models.CharField(max_length=500, null=True, blank=True)  # an https link, never fetched
    # Optional: only if the reporter wants to be asked a question. Cleared after the report is closed.
    contact_email = CaseInsensitiveEmailField(max_length=254, null=True, blank=True)
    # Keyed hash of (client, listing, reason): collapses repeats from one client while a report is open.
    # It is not reversible without the server's key and is cleared after the report is closed.
    dedupe_key = models.CharField(max_length=32, blank=True, default="")
    duplicate_count = models.PositiveIntegerField(default=0)  # repeats from the same client, collapsed
    status = models.CharField(max_length=14, choices=ReportStatus.choices, default=ReportStatus.OPEN)
    resolution = models.CharField(max_length=20, choices=Resolution.choices, blank=True, default="")
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    row_version = models.PositiveIntegerField(default=0)  # optimistic concurrency for staff actions

    class Meta:
        indexes = [
            models.Index(fields=["status", "created_at"], name="report_queue_idx"),
            models.Index(fields=["opportunity", "status"], name="report_listing_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["opportunity", "reason", "dedupe_key"],
                condition=Q(status__in=["open", "investigating", "escalated"]) & ~Q(dedupe_key=""),
                name="report_one_open_per_client_listing_reason",
            ),
            models.CheckConstraint(
                condition=~Q(status__in=["resolved", "dismissed"])
                | (~Q(resolution="") & Q(closed_by__isnull=False) & Q(closed_at__isnull=False)),
                name="report_closed_has_outcome_and_closer",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["resolved", "dismissed"])
                | (Q(resolution="") & Q(closed_at__isnull=True)),
                name="report_open_has_no_outcome",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reference} ({self.status})"


class ReportAction(models.TextChoices):
    CREATED = "created", "Report received"
    REPEATED = "repeated", "Repeated by the same client (collapsed)"
    INVESTIGATING = "investigating", "Investigation started"
    NOTE = "note", "Investigation note"
    ESCALATED = "escalated", "Escalated"
    RESOLVED = "resolved", "Resolved"
    DISMISSED = "dismissed", "Dismissed"
    REOPENED = "reopened", "Reopened"
    LISTING_ACTION = "listing_action", "Action taken on the listing"


class ReportEvent(models.Model):
    """Every step of a report's life. Append-only (a database trigger rejects UPDATE and DELETE)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(ListingReport, on_delete=models.PROTECT, related_name="events")
    action = models.CharField(max_length=16, choices=ReportAction.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )  # null for the public submission
    from_status = models.CharField(max_length=14, blank=True, default="")
    to_status = models.CharField(max_length=14, blank=True, default="")
    note = models.TextField(blank=True, default="")  # staff text, 10 to 2000 characters when required
    # For a listing action: the publishing-service event that records what was done to the listing.
    listing_event = models.ForeignKey(
        PublishingEvent, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["report", "created_at"], name="reportevent_report_idx")]

    def __str__(self) -> str:
        return f"{self.report_id}:{self.action}"
