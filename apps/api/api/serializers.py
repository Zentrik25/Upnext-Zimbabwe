"""Request/response serializers for the implemented Phase 1 endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import AccountStatus, User


class StrictSerializer(serializers.Serializer[None]):
    """Rejects unknown fields *and* reports ordinary field errors in the same response."""

    def to_internal_value(self, data: object) -> dict[str, Any]:
        errors: dict[str, Any] = {}
        if isinstance(data, dict):
            errors.update({key: ["Unknown field."] for key in sorted(set(data) - set(self.fields))})
        try:
            validated: dict[str, Any] = super().to_internal_value(data)
        except serializers.ValidationError as exc:
            errors = {**dict(exc.detail), **errors} if isinstance(exc.detail, dict) else errors
            validated = {}
        if errors:
            raise serializers.ValidationError(errors)
        return validated


class LoginSerializer(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, style={"input_type": "password"})


class UserSerializer(serializers.ModelSerializer[User]):
    email_verified = serializers.SerializerMethodField()
    status = serializers.ChoiceField(choices=AccountStatus.choices, read_only=True)
    roles = serializers.SerializerMethodField()
    deletion_scheduled_for = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "email_verified",
            "display_name",
            "status",
            "roles",
            "created_at",
            "deletion_requested_at",
            "deletion_scheduled_for",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_deletion_scheduled_for(self, obj: User) -> datetime | None:
        from accounts.services import scheduled_for

        return scheduled_for(obj)

    @extend_schema_field(serializers.BooleanField())
    def get_email_verified(self, obj: User) -> bool:
        return obj.email_verified_at is not None

    @extend_schema_field(
        serializers.ListField(
            child=serializers.ChoiceField(choices=["contributor", "editor", "administrator"])
        )
    )
    def get_roles(self, obj: User) -> list[str]:
        return sorted(obj.active_roles())


class ApiRootSerializer(serializers.Serializer[None]):
    name = serializers.CharField()
    version = serializers.CharField()
    status = serializers.CharField()


class CsrfTokenSerializer(serializers.Serializer[None]):
    csrf_token = serializers.CharField()
