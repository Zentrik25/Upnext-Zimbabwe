"""Employer portal data (Phase 6A, D-35): organisation claims, verification, memberships, company profiles,
the marker for employer-originated listings and aggregate listing counters.

State changes are made only by `employers.services` (and the publishing service for listings); the staff
screens call those services. Nothing here stores a secret or a document.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from catalog.models import Organisation, Sector


class ClaimStatus(models.TextChoices):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class MemberRole(models.TextChoices):
    OWNER = "owner"  # may also submit company-profile changes
    RECRUITER = "recruiter"  # posts listings only


class VerificationMethod(models.TextChoices):
    DOCUMENT_REVIEW = "document_review"
    OFFICIAL_EMAIL_DOMAIN = "official_email_domain"
    WEBSITE_CONTROL = "website_control"
    PHONE_CALLBACK = "phone_callback"
    OTHER = "other"


class OrganisationClaim(models.Model):
    """A request to act for an organisation. It grants nothing until staff decide it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="org_claims")
    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.PROTECT, related_name="claims"
    )
    organisation_name = models.CharField(max_length=200)
    website_url = models.CharField(max_length=2048, null=True, blank=True)
    registration_number = models.CharField(max_length=60, null=True, blank=True)
    role_title = models.CharField(max_length=100)
    evidence_note = models.TextField()
    status = models.CharField(max_length=10, choices=ClaimStatus.choices, default=ClaimStatus.PENDING)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_reason = models.TextField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "created_at"], name="claim_status_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organisation"],
                condition=Q(status="pending", organisation__isnull=False),
                name="claim_one_pending_per_user_org",
            ),
            models.CheckConstraint(
                condition=~Q(status__in=["approved", "rejected"])
                | (Q(decided_by__isnull=False) & Q(decided_at__isnull=False)),
                name="claim_decided_has_decider",
            ),
            models.CheckConstraint(
                condition=~Q(status="rejected") | Q(decision_reason__isnull=False),
                name="claim_rejection_has_reason",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.organisation_name} ({self.status})"


class OrganisationVerification(models.Model):
    """How and by whom an organisation was verified. Verified means: an unrevoked record exists (D-14 spirit:
    never inferred from posting, publication or membership)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="verifications")
    claim = models.ForeignKey(
        OrganisationClaim, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    method = models.CharField(max_length=24, choices=VerificationMethod.choices)
    evidence_note = models.TextField()
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    verified_at = models.DateTimeField(default=timezone.now)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.TextField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation"],
                condition=Q(revoked_at__isnull=True),
                name="orgverification_one_active",
            ),
            models.CheckConstraint(
                condition=Q(revoked_at__isnull=True)
                | (Q(revoked_by__isnull=False) & Q(revoked_reason__isnull=False)),
                name="orgverification_revocation_has_actor_and_reason",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.organisation_id}:{self.method}"


class EmployerMembership(models.Model):
    """Authority to act for an organisation. Revoked, never deleted (history)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="employer_roles"
    )
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="members")
    role = models.CharField(max_length=10, choices=MemberRole.choices, default=MemberRole.RECRUITER)
    claim = models.ForeignKey(
        OrganisationClaim, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    granted_at = models.DateTimeField(default=timezone.now)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.TextField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organisation"],
                condition=Q(revoked_at__isnull=True),
                name="membership_one_active_per_user_org",
            ),
            models.CheckConstraint(
                condition=Q(revoked_at__isnull=True) | Q(revoked_reason__isnull=False),
                name="membership_revocation_has_reason",
            ),
        ]
        indexes = [models.Index(fields=["user", "revoked_at"], name="membership_user_idx")]

    def __str__(self) -> str:
        return f"{self.user_id}@{self.organisation_id}:{self.role}"


class SizeBand(models.TextChoices):
    MICRO = "1-10"
    SMALL = "11-50"
    MEDIUM = "51-200"
    LARGE = "201-500"
    ENTERPRISE = "501+"


class ProfileState(models.TextChoices):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    SUPERSEDED = "superseded"


class EmployerProfile(models.Model):
    """The public company profile shell; the visible text is always an approved `ProfileRevision`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.OneToOneField(
        Organisation, on_delete=models.PROTECT, related_name="employer_profile"
    )
    slug = models.SlugField(max_length=80, unique=True, editable=False)
    live_revision = models.ForeignKey(
        "ProfileRevision", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    def __str__(self) -> str:
        return self.slug


class ProfileRevision(models.Model):
    """Frozen when submitted (content hash); approved or rejected by a different person."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(EmployerProfile, on_delete=models.PROTECT, related_name="revisions")
    version_no = models.PositiveIntegerField()
    state = models.CharField(max_length=12, choices=ProfileState.choices, default=ProfileState.PENDING)
    tagline = models.CharField(max_length=120, blank=True, default="")
    about = models.TextField(blank=True, default="")
    sector = models.ForeignKey(Sector, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    size_band = models.CharField(max_length=8, choices=SizeBand.choices, null=True, blank=True)
    founded_year = models.PositiveSmallIntegerField(null=True, blank=True)
    location_text = models.CharField(max_length=120, null=True, blank=True)
    content_hash = models.BinaryField(max_length=32)
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    submitted_at = models.DateTimeField(default=timezone.now)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_reason = models.TextField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["profile", "version_no"], name="profilerev_version_unique"),
            models.UniqueConstraint(
                fields=["profile"], condition=Q(state="pending"), name="profilerev_one_pending"
            ),
            models.CheckConstraint(
                condition=~Q(state__in=["approved", "rejected"])
                | (Q(decided_by__isnull=False) & Q(decided_at__isnull=False)),
                name="profilerev_decided_has_decider",
            ),
            models.CheckConstraint(
                condition=~Q(state="rejected") | Q(decision_reason__isnull=False),
                name="profilerev_rejection_has_reason",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.profile_id}:v{self.version_no}"


class EmployerListing(models.Model):
    """Marks a listing as employer-originated and binds it to one organisation for good."""

    opportunity = models.OneToOneField(
        "opportunities.Opportunity", on_delete=models.PROTECT, related_name="employer_binding"
    )
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="employer_listings")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        indexes = [models.Index(fields=["organisation"], name="emplisting_org_idx")]

    def __str__(self) -> str:
        return str(self.opportunity_id)


class ListingDailyStat(models.Model):
    """Aggregate counters per listing and UTC day. No visitor identifier of any kind is stored."""

    id = models.BigAutoField(primary_key=True)
    opportunity = models.ForeignKey("opportunities.Opportunity", on_delete=models.PROTECT, related_name="+")
    day = models.DateField()
    views = models.PositiveIntegerField(default=0)
    apply_clicks = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["opportunity", "day"], name="dailystat_unique")]
        indexes = [models.Index(fields=["opportunity", "-day"], name="dailystat_recent_idx")]

    def __str__(self) -> str:
        return f"{self.opportunity_id}@{self.day}"
