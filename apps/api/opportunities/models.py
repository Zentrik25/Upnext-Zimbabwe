"""Opportunity aggregate, immutable revisions, provenance, verification and review records
(ERD §3.5, EDITORIAL_WORKFLOW). State columns are written only by `opportunities.workflow`; database
triggers (migration 0002) re-assert immutability and separation of duties.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from django.db.models import Q
from django.utils import timezone

from catalog.models import Category, Location, Organisation, Sector, Skill


class ListingStatus(models.TextChoices):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    PUBLISHED = "published"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"
    ARCHIVED = "archived"


class ArchiveReason(models.TextChoices):
    HOUSEKEEPING = "housekeeping"
    TAKEDOWN = "takedown"
    ABANDONED = "abandoned"


class VersionState(models.TextChoices):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    PUBLISHED = "published"
    SUPERSEDED = "superseded"
    DISCARDED = "discarded"


OPEN_STATES = (VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED)
PUBLIC_STATUSES = (ListingStatus.PUBLISHED, ListingStatus.EXPIRED, ListingStatus.WITHDRAWN)


class WorkMode(models.TextChoices):
    ON_SITE = "on_site"
    HYBRID = "hybrid"
    REMOTE = "remote"


class EmploymentType(models.TextChoices):
    PERMANENT = "permanent"
    CONTRACT = "contract"
    TEMPORARY = "temporary"
    PART_TIME = "part_time"
    INTERNSHIP = "internship"
    TRAINEE = "trainee"


class ExperienceLevel(models.TextChoices):
    NONE = "none"
    ENTRY = "entry"
    MID = "mid"
    SENIOR = "senior"
    EXECUTIVE = "executive"


class SalaryPeriod(models.TextChoices):
    HOUR = "hour"
    DAY = "day"
    MONTH = "month"
    YEAR = "year"
    ONCE = "once"


class ApplicationMethod(models.TextChoices):
    EXTERNAL_URL = "external_url"
    EMAIL = "email"
    INSTRUCTIONS = "instructions"


class SourceKind(models.TextChoices):
    ISSUER_WEBSITE = "issuer_website"
    ISSUER_NOTICE = "issuer_notice"
    GOVERNMENT_GAZETTE = "government_gazette"
    NEWSPAPER = "newspaper"
    EMAIL_FROM_ISSUER = "email_from_issuer"
    SOCIAL_MEDIA = "social_media"
    AGGREGATOR = "aggregator"
    OTHER = "other"


class VerificationLevel(models.TextChoices):
    NOT_VERIFIED = "not_verified"
    SOURCE_CHECKED = "source_checked"
    ISSUER_VERIFIED = "issuer_verified"


class VerificationMethod(models.TextChoices):
    SOURCE_PAGE_REVIEW = "source_page_review"
    DOCUMENT_REVIEW = "document_review"
    ISSUER_CONTACT = "issuer_contact"


class VerificationOutcome(models.TextChoices):
    CONFIRMED = "confirmed"
    UNABLE_TO_CONFIRM = "unable_to_confirm"
    DISCREPANCY_FOUND = "discrepancy_found"


class Decision(models.TextChoices):
    APPROVED = "approved"
    REJECTED = "rejected"
    RETURNED = "returned"


class Opportunity(models.Model):
    """The listing and its lifecycle. Content lives in `OpportunityVersion`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.CharField(max_length=80, unique=True, null=True, blank=True, editable=False)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="opportunities")
    status = models.CharField(max_length=12, choices=ListingStatus.choices, default=ListingStatus.DRAFT)
    archive_reason = models.CharField(max_length=12, choices=ArchiveReason.choices, null=True, blank=True)
    # One-to-one: a revision is live for at most one listing. The reverse name lets the public queries join
    # on `live_version_id` alone, which PostgreSQL estimates correctly (an extra `opportunity_id = id` join
    # condition made it expect one row and pick a full sort; see PHASE4_REPORT).
    live_version = models.OneToOneField(
        "OpportunityVersion", null=True, blank=True, on_delete=models.PROTECT, related_name="live_for"
    )
    pending_version = models.ForeignKey(
        "OpportunityVersion", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    verification_level = models.CharField(
        max_length=16, choices=VerificationLevel.choices, default=VerificationLevel.NOT_VERIFIED
    )
    verification_checked_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    first_published_at = models.DateTimeField(null=True, blank=True)
    last_published_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    row_version = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "listing"
        verbose_name_plural = "listings"
        indexes = [
            models.Index(fields=["status"], name="opp_status_idx"),
            models.Index(fields=["category", "status"], name="opp_category_status_idx"),
            models.Index(fields=["created_by"], name="opp_created_by_idx"),
            # The default public list: newest first among live listings (see public.search).
            models.Index(
                fields=["-first_published_at", "-slug"],
                condition=Q(status="published"),
                name="opp_public_newest_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status__in=["published", "expired", "withdrawn"])
                | Q(live_version__isnull=False, slug__isnull=False),
                name="opp_public_status_has_live_version_and_slug",
            ),
            models.CheckConstraint(
                condition=Q(slug__isnull=True) | Q(first_published_at__isnull=False),
                name="opp_slug_requires_first_publication",
            ),
            models.CheckConstraint(
                condition=(Q(status="archived") & Q(archive_reason__isnull=False))
                | (~Q(status="archived") & Q(archive_reason__isnull=True)),
                name="opp_archive_reason_iff_archived",
            ),
            models.CheckConstraint(
                condition=~Q(status__in=["draft", "in_review", "approved", "rejected"])
                | Q(first_published_at__isnull=False)
                | Q(live_version__isnull=True),
                name="opp_unpublished_has_no_live_version",
            ),
        ]

    def __str__(self) -> str:
        version = self.live_version or self.pending_version
        return version.title if version is not None and version.title else (self.slug or "Untitled draft")


class OpportunityVersion(models.Model):
    """An immutable content snapshot once it leaves `draft`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(Opportunity, on_delete=models.PROTECT, related_name="versions")
    version_no = models.PositiveIntegerField()
    based_on_version = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    state = models.CharField(max_length=12, choices=VersionState.choices, default=VersionState.DRAFT)

    # core content
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="versions")
    title = models.CharField(max_length=200, blank=True, default="")
    summary = models.CharField(max_length=300, blank=True, default="")
    description_md = models.TextField(blank=True, default="")
    requirements_md = models.TextField(null=True, blank=True)

    # searchable facts
    work_mode = models.CharField(max_length=10, choices=WorkMode.choices, null=True, blank=True)
    employment_type = models.CharField(max_length=12, choices=EmploymentType.choices, null=True, blank=True)
    experience_level = models.CharField(max_length=12, choices=ExperienceLevel.choices, null=True, blank=True)
    location_text = models.CharField(max_length=200, null=True, blank=True)
    geographic_eligibility = models.CharField(max_length=500, null=True, blank=True)

    # money: never defaulted, never converted
    salary_min = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    salary_max = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    salary_currency = models.CharField(max_length=3, null=True, blank=True)
    salary_period = models.CharField(max_length=8, choices=SalaryPeriod.choices, null=True, blank=True)
    funding_min = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    funding_max = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)
    funding_currency = models.CharField(max_length=3, null=True, blank=True)
    funding_period = models.CharField(max_length=8, choices=SalaryPeriod.choices, null=True, blank=True)

    # deadline: NULL = unknown (never inferred)
    deadline_at = models.DateTimeField(null=True, blank=True)
    deadline_timezone = models.CharField(max_length=64, null=True, blank=True)
    deadline_is_date_only = models.BooleanField(default=False)

    # where to apply (UPNEXT never receives applications)
    application_method = models.CharField(
        max_length=14, choices=ApplicationMethod.choices, default=ApplicationMethod.EXTERNAL_URL
    )
    application_url = models.CharField(max_length=2048, null=True, blank=True)
    application_email = models.CharField(max_length=254, null=True, blank=True)
    application_instructions = models.TextField(null=True, blank=True)
    reference_number = models.CharField(max_length=100, null=True, blank=True)
    contact_details = models.CharField(max_length=500, null=True, blank=True)

    # category detail (versioned JSONB, D-12)
    detail = models.JSONField(default=dict)
    detail_schema_version = models.PositiveSmallIntegerField(default=1)

    # author-supplied reason for knowingly listing a hard duplicate (P2-09)
    duplicate_acknowledgement = models.JSONField(null=True, blank=True)  # {duplicate_of, reason}

    # search (maintained at publication and on organisation edits)
    search_vector = SearchVectorField(null=True, editable=False)

    # workflow
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    content_hash = models.BinaryField(max_length=32, null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        indexes = [
            models.Index(fields=["opportunity", "-version_no"], name="ver_opp_no_idx"),
            GinIndex(fields=["search_vector"], name="ver_search_idx", condition=Q(state="published")),
            models.Index(fields=["deadline_at"], name="ver_deadline_idx", condition=Q(state="published")),
            models.Index(
                fields=["deadline_at", "id"], name="ver_deadline_id_idx", condition=Q(state="published")
            ),
            models.Index(fields=["organisation"], name="ver_org_idx", condition=Q(state="published")),
            models.Index(
                fields=["employment_type", "work_mode"],
                name="ver_emp_mode_idx",
                condition=Q(state="published"),
            ),
            models.Index(
                fields=["-published_at", "-id"], name="ver_published_idx", condition=Q(state="published")
            ),
        ]
        constraints = [
            models.UniqueConstraint(fields=["opportunity", "version_no"], name="ver_opp_version_no_unique"),
            models.UniqueConstraint(
                fields=["opportunity"],
                condition=Q(state__in=["draft", "in_review", "approved"]),
                name="ver_one_open_per_opportunity",
            ),
            models.UniqueConstraint(
                fields=["opportunity"],
                condition=Q(state="published"),
                name="ver_one_published_per_opportunity",
            ),
            models.CheckConstraint(
                condition=Q(salary_min__isnull=True)
                | Q(salary_max__isnull=True)
                | Q(salary_min__lte=models.F("salary_max")),
                name="ver_salary_range_ordered",
            ),
            models.CheckConstraint(
                condition=Q(funding_min__isnull=True)
                | Q(funding_max__isnull=True)
                | Q(funding_min__lte=models.F("funding_max")),
                name="ver_funding_range_ordered",
            ),
            models.CheckConstraint(
                condition=(Q(salary_min__isnull=True) & Q(salary_max__isnull=True))
                | (Q(salary_currency__isnull=False) & Q(salary_period__isnull=False)),
                name="ver_salary_has_currency_and_period",
            ),
            models.CheckConstraint(
                condition=(Q(funding_min__isnull=True) & Q(funding_max__isnull=True))
                | Q(funding_currency__isnull=False),
                name="ver_funding_has_currency",
            ),
            models.CheckConstraint(
                condition=Q(deadline_at__isnull=True) | Q(deadline_timezone__isnull=False),
                name="ver_deadline_has_timezone",
            ),
            models.CheckConstraint(
                condition=~Q(deadline_is_date_only=True) | Q(deadline_at__isnull=False),
                name="ver_date_only_has_deadline",
            ),
            models.CheckConstraint(
                condition=~Q(state__in=["in_review", "approved", "published"])
                | (Q(content_hash__isnull=False) & Q(submitted_by__isnull=False)),
                name="ver_frozen_has_hash_and_submitter",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.opportunity_id}:v{self.version_no}"


class VersionLocation(models.Model):
    version = models.ForeignKey(OpportunityVersion, on_delete=models.PROTECT, related_name="locations")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    is_primary = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["version", "location"], name="verloc_unique"),
            models.UniqueConstraint(
                fields=["version"], condition=Q(is_primary=True), name="verloc_one_primary"
            ),
        ]
        indexes = [models.Index(fields=["location"], name="verloc_location_idx")]

    def __str__(self) -> str:
        return f"{self.version_id}@{self.location_id}"


class VersionSkill(models.Model):
    version = models.ForeignKey(OpportunityVersion, on_delete=models.PROTECT, related_name="skills")
    skill = models.ForeignKey(Skill, on_delete=models.PROTECT, related_name="+")
    is_required = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["version", "skill"], name="verskill_unique")]

    def __str__(self) -> str:
        return f"{self.version_id}+{self.skill_id}"


class VersionSector(models.Model):
    version = models.ForeignKey(OpportunityVersion, on_delete=models.PROTECT, related_name="sectors")
    sector = models.ForeignKey(Sector, on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["version", "sector"], name="versector_unique")]
        indexes = [models.Index(fields=["sector"], name="versector_sector_idx")]

    def __str__(self) -> str:
        return f"{self.version_id}/{self.sector_id}"


class OpportunitySource(models.Model):
    """Provenance: where the information came from. Independent of verification (D-14)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(Opportunity, on_delete=models.PROTECT, related_name="sources")
    version = models.ForeignKey(OpportunityVersion, on_delete=models.PROTECT, related_name="sources")
    kind = models.CharField(max_length=20, choices=SourceKind.choices)
    name = models.CharField(max_length=200)
    url = models.CharField(max_length=2048, null=True, blank=True)
    citation = models.CharField(max_length=500, null=True, blank=True)
    observed_on = models.DateField()
    is_primary = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(url__isnull=False) | Q(citation__isnull=False), name="source_has_url_or_citation"
            ),
            models.UniqueConstraint(
                fields=["version"], condition=Q(is_primary=True), name="source_one_primary"
            ),
        ]
        indexes = [models.Index(fields=["url"], name="source_url_idx")]

    def __str__(self) -> str:
        return self.name


class VerificationRecord(models.Model):
    """Verification activity, never inferred from publication (D-14). Append-only."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(Opportunity, on_delete=models.PROTECT, related_name="verifications")
    version = models.ForeignKey(OpportunityVersion, on_delete=models.PROTECT, related_name="verifications")
    level = models.CharField(max_length=16, choices=VerificationLevel.choices)
    method = models.CharField(max_length=20, choices=VerificationMethod.choices)
    outcome = models.CharField(max_length=20, choices=VerificationOutcome.choices)
    evidence_note = models.TextField()
    checked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    checked_at = models.DateTimeField(default=timezone.now)
    supersedes = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(level__in=["source_checked", "issuer_verified"]), name="verification_real_level"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.level}:{self.outcome}"


class ReviewDecision(models.Model):
    """Append-only review outcome; records the content hash that was reviewed."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.ForeignKey(OpportunityVersion, on_delete=models.PROTECT, related_name="decisions")
    decision = models.CharField(max_length=10, choices=Decision.choices)
    reason_code = models.CharField(max_length=40, null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    checklist = models.JSONField(default=dict)
    content_hash = models.BinaryField(max_length=32)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    decided_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(decision="approved") | Q(reason__isnull=False),
                name="decision_negative_has_reason",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.decision}@{self.version_id}"


class PublishingEvent(models.Model):
    """Typed, queryable history of every workflow transition (written with the matching audit event)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey(Opportunity, on_delete=models.PROTECT, related_name="events")
    version = models.ForeignKey(
        OpportunityVersion, null=True, blank=True, on_delete=models.PROTECT, related_name="events"
    )
    transition = models.CharField(max_length=24)
    from_status = models.CharField(max_length=12)
    to_status = models.CharField(max_length=12)
    actor_type = models.CharField(max_length=8, default="user")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reason = models.TextField(null=True, blank=True)
    request_id = models.CharField(max_length=64, default="-")
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["opportunity", "occurred_at"], name="pubevent_opp_time_idx")]
        ordering = ["occurred_at"]

    def __str__(self) -> str:
        return self.transition


class SavedOpportunity(models.Model):
    """A seeker's saved listing (ERD §3.5). Rows outlive the listing's public state; the API reports the
    current availability. Unique per (user, opportunity); owned by one user and cascade-deleted with them."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="saved_opportunities")
    opportunity = models.ForeignKey(Opportunity, on_delete=models.PROTECT, related_name="saved_by")
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "opportunity"], name="saved_unique_per_user_opportunity")
        ]
        indexes = [models.Index(fields=["user", "-created_at", "-id"], name="saved_user_recent_idx")]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.opportunity_id}"
