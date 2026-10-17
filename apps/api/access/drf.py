"""DRF integration: permission classes backed by the registry."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from .registry import DEFAULT_REGISTRY


def roles_of(user: Any) -> frozenset[str]:
    roles = getattr(user, "active_roles", None)
    return roles() if callable(roles) else frozenset()


class HasRequiredPermission(BasePermission):
    """Views declare `required_permission = "<code>"`. Anonymous users hold public codes only."""

    def has_permission(self, request: Request, view: Any) -> bool:
        code = getattr(view, "required_permission", None)
        if code is None:
            return False  # a view that forgot to declare a permission is denied
        user = request.user
        authenticated = bool(user and user.is_authenticated)
        roles = roles_of(user) if authenticated else frozenset()
        return DEFAULT_REGISTRY.has(roles, code, authenticated=authenticated)
