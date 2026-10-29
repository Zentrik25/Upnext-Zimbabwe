"""Shared plumbing for the staff views: access control, error mapping, bodies and pagination."""

from __future__ import annotations

import uuid
from typing import Any, cast

from django.conf import settings
from django.db.models import QuerySet
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from access.registry import DEFAULT_REGISTRY
from accounts.models import User
from api.errors import CodedPermissionDenied, error_response
from api.throttles import UserWriteThrottle
from core.staff_mfa import SESSION_FLAG
from opportunities.errors import FieldErrors, WorkflowError

MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 25


class StaffAccess(BasePermission):
    """Signed in, active, holding a staff role, and past two-step verification when it is required.

    A view may declare `required_permission` (a registry code); the registry, never a role name, decides.
    Views that must work before verification (session, MFA) set `mfa_exempt = True`.
    """

    def has_permission(self, request: Request, view: Any) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            raise exceptions.NotAuthenticated()
        staff = user
        if not staff.active_roles():
            return False
        if (
            settings.UPNEXT_STAFF_MFA_REQUIRED
            and not getattr(view, "mfa_exempt", False)
            and not request.session.get(SESSION_FLAG)
        ):
            raise CodedPermissionDenied("mfa_required")
        code = getattr(view, "required_permission", None)
        return code is None or DEFAULT_REGISTRY.has(staff.active_roles(), code)


@method_decorator(never_cache, name="dispatch")
class StaffView(APIView):
    """Base class: every staff response is uncacheable and writes are throttled per user."""

    permission_classes = [StaffAccess]
    throttle_classes = [UserWriteThrottle]
    required_permission: str | None = None
    mfa_exempt = False
    schema = None  # documented in docs/engineering/STAFF_API.md, not in the public OpenAPI contract

    def get_throttles(self) -> list[Any]:
        return super().get_throttles() if self.request.method not in ("GET", "HEAD", "OPTIONS") else []

    @staticmethod
    def user_of(request: Request) -> User:
        return cast(User, request.user)

    @staticmethod
    def can(user: User, code: str) -> bool:
        return user.has_permission_code(code)


def fields_of(errors: FieldErrors) -> dict[str, list[dict[str, str]]]:
    return {path: [{"code": c, "message": m} for c, m in items] for path, items in errors.items()}


def refused(exc: WorkflowError) -> Response:
    return error_response(
        exc.code, exc.message, exc.http_status, fields_of(exc.fields) if exc.fields else None
    )


def body_of(request: Request) -> dict[str, Any] | None:
    data = request.data
    return dict(data) if isinstance(data, dict) else None


def bad_body(message: str = "The request body must be a JSON object.") -> Response:
    return error_response("validation_failed", message, 400)


def not_found() -> Response:
    return error_response("not_found", "Not found.", 404)


def invalid(field: str, message: str, code: str = "invalid") -> Response:
    return error_response(
        "validation_failed", "The request is invalid.", 400, {field: [{"code": code, "message": message}]}
    )


def as_uuid(value: Any) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except ValueError, AttributeError, TypeError:
        return None


def iso(value: Any) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


def int_param(request: Request, name: str, default: int, low: int, high: int) -> int:
    try:
        value = int(request.query_params.get(name, default))
    except ValueError:
        return default
    return max(low, min(high, value))


def paginate(request: Request, queryset: QuerySet[Any]) -> tuple[list[Any], dict[str, int]]:
    size = int_param(request, "page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    total = queryset.count()
    pages = max(1, -(-total // size))
    number = int_param(request, "page", 1, 1, pages)
    start = (number - 1) * size
    return list(queryset[start : start + size]), {
        "number": number,
        "size": size,
        "total": total,
        "pages": pages,
    }
