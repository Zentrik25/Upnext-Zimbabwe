"""Request and response shapes of the account endpoints (openapi tags `auth` and `me`)."""

from __future__ import annotations

from rest_framework import serializers

from .public_serializers import OpportunitySummarySerializer, PageInfoSerializer
from .serializers import StrictSerializer

PASSWORD = {"max_length": 128, "trim_whitespace": False, "style": {"input_type": "password"}}


class RegisterSerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(min_length=10, **PASSWORD)  # type: ignore[arg-type]
    display_name = serializers.CharField(min_length=1, max_length=80)
    phone_number = serializers.CharField(min_length=8, max_length=24)
    accept_terms = serializers.BooleanField()


class EmailOnlySerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)


class TokenSerializer(StrictSerializer):
    token = serializers.CharField(max_length=200)


class ResetConfirmSerializer(StrictSerializer):
    token = serializers.CharField(max_length=200)
    new_password = serializers.CharField(min_length=10, **PASSWORD)  # type: ignore[arg-type]


class ChangePasswordSerializer(StrictSerializer):
    current_password = serializers.CharField(**PASSWORD)  # type: ignore[arg-type]
    new_password = serializers.CharField(min_length=10, **PASSWORD)  # type: ignore[arg-type]


class EmailChangeSerializer(StrictSerializer):
    new_email = serializers.EmailField(max_length=254)
    password = serializers.CharField(**PASSWORD)  # type: ignore[arg-type]


class MeUpdateSerializer(StrictSerializer):
    display_name = serializers.CharField(min_length=1, max_length=80)


class PasswordOnlySerializer(StrictSerializer):
    password = serializers.CharField(**PASSWORD)  # type: ignore[arg-type]


class CodeSerializer(StrictSerializer):
    code = serializers.CharField(max_length=32, trim_whitespace=True)


class PasswordCodeSerializer(StrictSerializer):
    password = serializers.CharField(**PASSWORD)  # type: ignore[arg-type]
    code = serializers.CharField(max_length=32, trim_whitespace=True)


class AcceptedSerializer(serializers.Serializer[None]):
    status = serializers.ChoiceField(choices=["accepted"])


class SessionInfoSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    created_at = serializers.DateTimeField()
    last_seen_at = serializers.DateTimeField()
    user_agent_summary = serializers.CharField(allow_null=True)
    current = serializers.BooleanField()


class SessionListSerializer(serializers.Serializer[None]):
    data = SessionInfoSerializer(many=True)  # type: ignore[assignment]


class DeletionRequestedSerializer(serializers.Serializer[None]):
    deletion_requested_at = serializers.DateTimeField()
    scheduled_for = serializers.DateTimeField(allow_null=True)


class SavedItemSerializer(serializers.Serializer[None]):
    opportunity_id = serializers.UUIDField()
    saved_at = serializers.DateTimeField()
    availability = serializers.ChoiceField(choices=["open", "expired", "withdrawn", "unavailable"])
    opportunity = OpportunitySummarySerializer(allow_null=True, required=False)


class SavedListSerializer(serializers.Serializer[None]):
    data = SavedItemSerializer(many=True)  # type: ignore[assignment]
    page = PageInfoSerializer()
