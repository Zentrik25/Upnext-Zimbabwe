"""Response shapes of the public catalogue endpoints.

They document `docs/engineering/openapi/openapi.yaml`; the views build plain dicts and a contract test
validates real responses against the contract schemas."""

from __future__ import annotations

from rest_framework import serializers

from opportunities.models import (
    ApplicationMethod,
    EmploymentType,
    ExperienceLevel,
    SalaryPeriod,
    SourceKind,
    VerificationLevel,
    WorkMode,
)


class CategorySerializer(serializers.Serializer[None]):
    code = serializers.CharField()
    name = serializers.CharField()


class LocationSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    slug = serializers.CharField()
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=["country", "province", "city", "remote"])
    parent_slug = serializers.CharField(allow_null=True)


class SectorSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    slug = serializers.CharField()
    name = serializers.CharField()


class SkillSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    name = serializers.CharField()


class PageInfoSerializer(serializers.Serializer[None]):
    limit = serializers.IntegerField()
    has_more = serializers.BooleanField()
    next_cursor = serializers.CharField(allow_null=True)
    total = serializers.IntegerField(allow_null=True)


class DeadlineSerializer(serializers.Serializer[None]):
    at = serializers.DateTimeField(allow_null=True)
    timezone = serializers.CharField(allow_null=True)
    is_date_only = serializers.BooleanField()
    state = serializers.ChoiceField(choices=["open", "closing_soon", "unknown", "expired"])


class MoneySerializer(serializers.Serializer[None]):
    min = serializers.CharField(allow_null=True)
    max = serializers.CharField(allow_null=True)
    currency = serializers.CharField()
    period = serializers.ChoiceField(choices=SalaryPeriod.values, allow_null=True)


class VerificationSerializer(serializers.Serializer[None]):
    level = serializers.ChoiceField(choices=VerificationLevel.values)
    checked_at = serializers.DateTimeField(allow_null=True)


class SourceSerializer(serializers.Serializer[None]):
    kind = serializers.ChoiceField(choices=SourceKind.values)
    name = serializers.CharField()
    url = serializers.CharField(allow_null=True)
    citation = serializers.CharField(allow_null=True)
    observed_on = serializers.DateField()
    is_primary = serializers.BooleanField()


class SummaryLocationSerializer(serializers.Serializer[None]):
    slug = serializers.CharField()
    name = serializers.CharField()
    is_primary = serializers.BooleanField()


class SummaryOrganisationSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    name = serializers.CharField()


class OpportunitySummarySerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    slug = serializers.CharField()
    title = serializers.CharField()
    summary = serializers.CharField()
    category = CategorySerializer()
    organisation = SummaryOrganisationSerializer()
    locations = SummaryLocationSerializer(many=True)
    work_mode = serializers.ChoiceField(choices=WorkMode.values, allow_null=True)
    employment_type = serializers.ChoiceField(choices=EmploymentType.values, allow_null=True)
    deadline = DeadlineSerializer()
    salary = MoneySerializer(allow_null=True)
    verification = VerificationSerializer()
    primary_source_name = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=["published", "expired", "withdrawn"])
    published_at = serializers.DateTimeField()
    is_saved = serializers.BooleanField(allow_null=True)


class ApplicationSerializer(serializers.Serializer[None]):
    method = serializers.ChoiceField(choices=ApplicationMethod.values)
    url = serializers.CharField(allow_null=True)
    email = serializers.EmailField(allow_null=True)
    instructions = serializers.CharField(allow_null=True)


class DetailSkillSerializer(serializers.Serializer[None]):
    name = serializers.CharField()
    is_required = serializers.BooleanField()


class OpportunityDetailSerializer(OpportunitySummarySerializer):
    description_html = serializers.CharField()
    requirements_html = serializers.CharField(allow_null=True)
    geographic_eligibility = serializers.CharField(allow_null=True)
    location_text = serializers.CharField(allow_null=True)
    experience_level = serializers.ChoiceField(choices=ExperienceLevel.values, allow_null=True)
    funding = MoneySerializer(allow_null=True)
    skills = DetailSkillSerializer(many=True)
    sectors = SectorSerializer(many=True)
    reference_number = serializers.CharField(allow_null=True)
    contact_details = serializers.CharField(allow_null=True)
    application = ApplicationSerializer()
    sources = SourceSerializer(many=True)
    detail = serializers.DictField()
    detail_schema_version = serializers.IntegerField()
    canonical_path = serializers.CharField()
    updated_at = serializers.DateTimeField()


class OpportunityListSerializer(serializers.Serializer[None]):
    data = OpportunitySummarySerializer(many=True)  # type: ignore[assignment]
    page = PageInfoSerializer()


class SitemapEntrySerializer(serializers.Serializer[None]):
    slug = serializers.CharField()
    updated_at = serializers.DateTimeField()


class SitemapSerializer(serializers.Serializer[None]):
    data = SitemapEntrySerializer(many=True)  # type: ignore[assignment]


class CategoryListSerializer(serializers.Serializer[None]):
    data = CategorySerializer(many=True)  # type: ignore[assignment]


class LocationListSerializer(serializers.Serializer[None]):
    data = LocationSerializer(many=True)  # type: ignore[assignment]


class SectorListSerializer(serializers.Serializer[None]):
    data = SectorSerializer(many=True)  # type: ignore[assignment]


class SkillListSerializer(serializers.Serializer[None]):
    data = SkillSerializer(many=True)  # type: ignore[assignment]
