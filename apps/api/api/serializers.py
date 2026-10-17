"""Request/response serializers for the implemented Phase 1 endpoints."""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.models import AccountStatus, User


class LoginSerializer(serializers.Serializer[None]):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, style={"input_type": "password"})

    def to_internal_value(self, data: object) -> dict[str, str]:
        """Reject unknown fields *and* report ordinary field errors in the same response."""
        errors: dict[str, Any] = {}
        if isinstance(data, dict):
            errors.update({key: ["Unknown field."] for key in sorted(set(data) - set(self.fields))})
        try:
            validated: dict[str, str] = super().to_internal_value(data)
        except serializers.ValidationError as exc:
            errors = {**dict(exc.detail), **errors} if isinstance(exc.detail, dict) else errors
            validated = {}
        if errors:
            raise serializers.ValidationError(errors)
        return validated


class UserSerializer(serializers.ModelSerializer[User]):
    email_verified = serializers.SerializerMethodField()
    status = serializers.ChoiceField(choices=AccountStatus.choices, read_only=True)
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "email_verified", "display_name", "status", "roles", "created_at"]
        read_only_fields = fields

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
