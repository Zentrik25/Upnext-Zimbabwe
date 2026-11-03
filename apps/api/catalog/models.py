"""Taxonomies, organisations and the detail-schema registry (ERD §3.3-3.4).

Reference rows are deactivated, never deleted (PROTECT foreign keys everywhere they are used).
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import Q

from .text import normalise_name


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=40, unique=True)  # immutable: jobs, internships, ...
    name = models.CharField(max_length=80)
    detail_schema_key = models.CharField(max_length=40)
    sort_order = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "code"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name


class LocationKind(models.TextChoices):
    COUNTRY = "country"
    PROVINCE = "province"
    CITY = "city"
    REMOTE = "remote"


class Location(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=LocationKind.choices)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    slug = models.SlugField(max_length=80, unique=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Sector(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=80, unique=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class SkillStatus(models.TextChoices):
    APPROVED = "approved"
    PENDING = "pending"


class Skill(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    name_normalized = models.CharField(max_length=80, unique=True, editable=False)
    status = models.CharField(max_length=10, choices=SkillStatus.choices, default=SkillStatus.APPROVED)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args: object, **kwargs: object) -> None:
        self.name_normalized = normalise_name(self.name)
        super().save(*args, **kwargs)  # type: ignore[arg-type]


class Organisation(models.Model):
    """Issuer of an opportunity. No public pages in Release 1 (D-15), hence no slug."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    name_normalized = models.CharField(max_length=200, editable=False)
    website_url = models.URLField(max_length=2048, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+", editable=False
    )
    created_at = models.DateTimeField(auto_now_add=True)
    merged_into = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="merged_from"
    )
    row_version = models.PositiveIntegerField(default=0, editable=False)

    class Meta:
        ordering = ["name"]
        indexes = [
            GinIndex(fields=["name_normalized"], opclasses=["gin_trgm_ops"], name="org_name_trgm_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=~Q(name=""), name="org_name_not_blank"),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args: object, **kwargs: object) -> None:
        self.name_normalized = normalise_name(self.name)
        super().save(*args, **kwargs)  # type: ignore[arg-type]


class DetailSchemaStatus(models.TextChoices):
    DRAFT = "draft"
    ACTIVE = "active"
    RETIRED = "retired"


class DetailSchema(models.Model):
    """Records which schema version is active per category and its SHA-256 (documents live in
    `catalog/schemas/<code>/v<N>.json`, which are authoritative)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="detail_schemas")
    version = models.PositiveSmallIntegerField()
    schema_sha256 = models.BinaryField(max_length=32)
    status = models.CharField(max_length=8, choices=DetailSchemaStatus.choices)
    activated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["category", "version"], name="detail_schema_category_version"),
            models.UniqueConstraint(
                fields=["category"], condition=Q(status="active"), name="detail_schema_one_active"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.category_id}:v{self.version}"
