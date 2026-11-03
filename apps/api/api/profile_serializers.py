"""Request and response shapes of the seeker profile, For You and job-alert endpoints (Phase 6B)."""

from __future__ import annotations

import uuid
from typing import Any

from rest_framework import serializers

from alerts import service as alert_service
from alerts.models import Frequency
from catalog.models import LocationKind
from opportunities.models import EmploymentType, ExperienceLevel, WorkMode
from profiles import service as profile_service
from profiles.models import (
    MAX_CATEGORIES,
    MAX_LOCATIONS,
    MAX_SECTORS,
    MAX_SKILLS,
    Qualification,
)

from .public_serializers import OpportunitySummarySerializer, PageInfoSerializer
from .serializers import StrictSerializer


def _unique(values: list[Any]) -> list[Any]:
    return list(dict.fromkeys(values))


def _resolve(values: list[Any], found: list[Any], key: str, what: str) -> list[Any]:
    """The rows for `values`, or a validation error if any is unknown, inactive or not allowed."""
    if len(found) != len(values):
        raise serializers.ValidationError({key: [f"Choose {what} from the list."]})
    by_key = {getattr(row, "code", None) or row.pk: row for row in found}
    return [by_key[v] for v in values]


class ProfileUpdateSerializer(StrictSerializer):
    home_location = serializers.UUIDField(allow_null=True, required=False)
    highest_qualification = serializers.ChoiceField(
        choices=Qualification.choices, allow_null=True, required=False
    )
    experience_level = serializers.ChoiceField(
        choices=ExperienceLevel.choices, allow_null=True, required=False
    )
    categories = serializers.ListField(
        child=serializers.CharField(max_length=40), max_length=MAX_CATEGORIES, required=False
    )
    sectors = serializers.ListField(child=serializers.UUIDField(), max_length=MAX_SECTORS, required=False)
    preferred_locations = serializers.ListField(
        child=serializers.UUIDField(), max_length=MAX_LOCATIONS, required=False
    )
    skills = serializers.ListField(child=serializers.UUIDField(), max_length=MAX_SKILLS, required=False)
    employment_types = serializers.ListField(
        child=serializers.ChoiceField(choices=EmploymentType.choices), max_length=6, required=False
    )
    work_arrangements = serializers.ListField(
        child=serializers.ChoiceField(choices=WorkMode.choices), max_length=3, required=False
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs:
            raise serializers.ValidationError({"non_field_errors": ["Send at least one field."]})
        out: dict[str, Any] = dict(attrs)
        for key in ("employment_types", "work_arrangements"):
            if key in out:
                out[key] = _unique(out[key])
        if "categories" in out:
            codes = _unique(out["categories"])
            out["categories"] = _resolve(
                codes, profile_service.active_categories(codes), "categories", "categories"
            )
        if "sectors" in out:
            ids = _unique(out["sectors"])
            out["sectors"] = _resolve(ids, profile_service.active_sectors(ids), "sectors", "industries")
        if "preferred_locations" in out:
            ids = _unique(out["preferred_locations"])
            out["preferred_locations"] = _resolve(
                ids, profile_service.active_locations(ids), "preferred_locations", "places"
            )
        if "skills" in out:
            ids = _unique(out["skills"])
            out["skills"] = _resolve(ids, profile_service.approved_skills(ids), "skills", "skills")
        if out.get("home_location") is not None:
            ident: uuid.UUID = out["home_location"]
            places = [loc for loc in profile_service.active_locations([ident]) if loc.kind in HOME_KINDS]
            if not places:
                raise serializers.ValidationError({"home_location": ["Choose a city or province."]})
            out["home_location"] = places[0]
        return out


HOME_KINDS = (LocationKind.CITY, LocationKind.PROVINCE)


class NamedSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    slug = serializers.CharField()
    name = serializers.CharField()


class ProfileCategorySerializer(serializers.Serializer[None]):
    code = serializers.CharField()
    name = serializers.CharField()


class ProfileSkillSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    name = serializers.CharField()


class ProfileSerializer(serializers.Serializer[None]):
    exists = serializers.BooleanField()
    home_location = NamedSerializer(allow_null=True)
    highest_qualification = serializers.ChoiceField(choices=Qualification.choices, allow_null=True)
    experience_level = serializers.ChoiceField(choices=ExperienceLevel.choices, allow_null=True)
    work_arrangements = serializers.ListField(child=serializers.ChoiceField(choices=WorkMode.choices))
    employment_types = serializers.ListField(child=serializers.ChoiceField(choices=EmploymentType.choices))
    categories = ProfileCategorySerializer(many=True)
    sectors = NamedSerializer(many=True)
    preferred_locations = NamedSerializer(many=True)
    skills = ProfileSkillSerializer(many=True)
    fields_filled = serializers.IntegerField()
    fields_total = serializers.IntegerField()
    updated_at = serializers.DateTimeField(allow_null=True)


class ReasonSerializer(serializers.Serializer[None]):
    signal = serializers.CharField()
    text = serializers.CharField()


class MatchSerializer(serializers.Serializer[None]):
    reasons = ReasonSerializer(many=True)
    unknowns = ReasonSerializer(many=True)
    notes = ReasonSerializer(many=True)


class ForYouItemSerializer(serializers.Serializer[None]):
    opportunity = OpportunitySummarySerializer()
    match = MatchSerializer()


class ForYouMetaSerializer(serializers.Serializer[None]):
    model_version = serializers.CharField()
    mode = serializers.ChoiceField(choices=["matched", "newest"])
    fields_filled = serializers.IntegerField()
    fields_total = serializers.IntegerField()
    suggestions = ReasonSerializer(many=True)


class ForYouSerializer(serializers.Serializer[None]):
    data = ForYouItemSerializer(many=True)  # type: ignore[assignment]
    page = PageInfoSerializer()
    meta = ForYouMetaSerializer()


class AlertUpdateSerializer(StrictSerializer):
    enabled = serializers.BooleanField(required=False)
    frequency = serializers.ChoiceField(choices=Frequency.choices, required=False)
    categories = serializers.ListField(
        child=serializers.CharField(max_length=40), max_length=alert_service.MAX_CATEGORIES, required=False
    )
    locations = serializers.ListField(
        child=serializers.UUIDField(), max_length=alert_service.MAX_LOCATIONS, required=False
    )
    consent = serializers.BooleanField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs:
            raise serializers.ValidationError({"non_field_errors": ["Send at least one field."]})
        out: dict[str, Any] = dict(attrs)
        if "categories" in out:
            codes = _unique(out["categories"])
            out["categories"] = _resolve(
                codes, profile_service.active_categories(codes), "categories", "categories"
            )
        if "locations" in out:
            ids = _unique(out["locations"])
            out["locations"] = _resolve(ids, profile_service.active_locations(ids), "locations", "places")
        return out


class AlertSerializer(serializers.Serializer[None]):
    enabled = serializers.BooleanField()
    frequency = serializers.ChoiceField(choices=Frequency.choices)
    categories = ProfileCategorySerializer(many=True)
    locations = NamedSerializer(many=True)
    consented_at = serializers.DateTimeField(allow_null=True)
    consent_wording_version = serializers.CharField()
    last_sent_at = serializers.DateTimeField(allow_null=True)
    delivery_available = serializers.BooleanField()
    consent_wording = serializers.CharField()
    updated_at = serializers.DateTimeField(allow_null=True)


class UnsubscribeSerializer(StrictSerializer):
    token = serializers.CharField(max_length=500)
