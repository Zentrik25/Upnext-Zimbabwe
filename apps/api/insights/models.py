"""Career Insights data model (D-78).

An `Article` holds the **working copy** that editors change and, once published, a **live snapshot** (`live`
and the
`live_*` columns) that the public reads. Editing never changes what readers see: a new version reaches the
public
only through review, approval of its exact material content (`approved_hash`) and publication. Reviews and
events
are append-only. Categories, tags and author profiles are managed by staff; nothing public is invented.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class ArticleStatus(models.TextChoices):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ReviewDecision(models.TextChoices):
    APPROVED = "approved"
    REJECTED = "rejected"
    RETURNED = "returned"


class ArticleCategory(models.Model):
    """An administrator-managed category (`/insights/category/<slug>`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    description = models.TextField(blank=True, default="")
    seo_title = models.CharField(max_length=70, blank=True, default="")
    seo_description = models.CharField(max_length=170, blank=True, default="")
    display_order = models.PositiveSmallIntegerField(default=100)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]

    def __str__(self) -> str:
        return self.name


class ArticleTag(models.Model):
    """A tag; `slug` is the normalised form, so "CV", "cv " and "Cv" are one tag."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=60)
    slug = models.SlugField(max_length=60, unique=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class AuthorProfile(models.Model):
    """The public editorial profile of a staff account. Nothing here is filled in automatically."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE, related_name="author_profile"
    )
    display_name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    bio = models.TextField(blank=True, default="")
    image = models.CharField(max_length=120, blank=True, default="")  # a Media Library name
    expertise = models.JSONField(default=list, blank=True)  # list of short strings, as the author states them
    is_public = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.display_name


class Article(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=120, unique=True)
    status = models.CharField(max_length=12, choices=ArticleStatus.choices, default=ArticleStatus.DRAFT)

    # --- working copy: material content (covered by approval) ---
    headline = models.CharField(max_length=160)
    summary = models.TextField(blank=True, default="")
    body_html = models.TextField(blank=True, default="")  # sanitised on every save (insights.sanitize)
    body_text = models.TextField(
        blank=True, default=""
    )  # plain text of the body, for search and reading time
    in_short = models.JSONField(default=list, blank=True)  # reader aid: takeaways
    why_it_matters = models.TextField(blank=True, default="")  # reader aid
    category = models.ForeignKey(
        ArticleCategory, null=True, blank=True, on_delete=models.PROTECT, related_name="articles"
    )
    sources = models.JSONField(
        default=list, blank=True
    )  # [{title, publisher, url, published_on, accessed_on}]
    featured_image = models.CharField(max_length=120, blank=True, default="")  # a Media Library name
    image_alt = models.CharField(max_length=250, blank=True, default="")
    image_caption = models.CharField(max_length=300, blank=True, default="")
    image_credit = models.CharField(max_length=200, blank=True, default="")
    opportunity_categories = models.JSONField(default=list, blank=True)  # catalogue codes the article serves

    # --- working copy: not material (changing them keeps the approval) ---
    tags = models.ManyToManyField(ArticleTag, blank=True, related_name="articles")
    canonical_url = models.CharField(max_length=500, blank=True, default="")
    search_title = models.CharField(max_length=70, blank=True, default="")
    search_description = models.CharField(max_length=170, blank=True, default="")
    social_title = models.CharField(max_length=95, blank=True, default="")
    social_description = models.CharField(max_length=200, blank=True, default="")
    social_image = models.CharField(max_length=120, blank=True, default="")  # a Media Library name

    # --- placement (editorial, applies to the live article immediately) ---
    is_featured = models.BooleanField(default=False)
    is_carousel = models.BooleanField(default=False)
    is_top_story = models.BooleanField(default=False)

    # --- people and workflow ---
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    row_version = models.PositiveIntegerField(default=1)
    content_hash = models.CharField(max_length=64, blank=True, default="")
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_hash = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    # --- live snapshot (what the public sees; null when not live) ---
    live = models.JSONField(null=True, blank=True)
    live_slug = models.SlugField(max_length=120, blank=True, default="")
    live_headline = models.CharField(max_length=160, blank=True, default="")
    live_summary = models.TextField(blank=True, default="")
    live_text = models.TextField(blank=True, default="")  # headline, summary, body, category and tag names
    live_category = models.ForeignKey(
        ArticleCategory, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    live_tags = models.JSONField(default=list, blank=True)  # tag slugs
    live_opportunity_categories = models.JSONField(default=list, blank=True)
    live_hash = models.CharField(max_length=64, blank=True, default="")
    first_published_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)  # last publication
    material_updated_at = models.DateTimeField(
        null=True, blank=True
    )  # last change of the live material content
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=[s.value for s in ArticleStatus]), name="article_known_status"
            ),
            models.CheckConstraint(
                condition=Q(live__isnull=True) | Q(first_published_at__isnull=False),
                name="article_live_has_publication_date",
            ),
        ]
        indexes = [
            models.Index(fields=["-first_published_at"], name="article_live_recent_idx"),
            models.Index(fields=["status", "-updated_at"], name="article_status_idx"),
        ]

    def __str__(self) -> str:
        return self.headline


class ArticleSlugRedirect(models.Model):
    """An earlier public address of an article, answered with a permanent redirect."""

    old_slug = models.SlugField(max_length=120, unique=True)
    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name="redirects")
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    def __str__(self) -> str:
        return self.old_slug


class ArticleReview(models.Model):
    """Append-only review decision, with the editorial checklist and the content hash it covers."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article = models.ForeignKey(Article, on_delete=models.PROTECT, related_name="reviews")
    decision = models.CharField(max_length=10, choices=ReviewDecision.choices)
    checklist = models.JSONField(default=dict, blank=True)
    note = models.TextField(blank=True, default="")
    content_hash = models.CharField(max_length=64)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    decided_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-decided_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(decision="approved") | ~Q(note=""), name="article_review_negative_has_note"
            ),
        ]

    def __str__(self) -> str:
        return self.decision


class ArticleEvent(models.Model):
    """Append-only history of an article (every transition, save, placement change and publication)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article = models.ForeignKey(Article, on_delete=models.PROTECT, related_name="events")
    action = models.CharField(max_length=40)
    from_status = models.CharField(max_length=12, blank=True, default="")
    to_status = models.CharField(max_length=12, blank=True, default="")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    detail = models.JSONField(default=dict, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-at"]

    def __str__(self) -> str:
        return self.action
