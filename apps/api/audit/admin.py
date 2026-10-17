"""Read-only audit viewer for Administrators (permission `audit.read_all`)."""

from __future__ import annotations

from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from access.registry import Permission

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("id", "occurred_at", "severity", "action", "object_type", "object_id", "actor_ref")
    list_filter = ("severity", "action", "object_type")
    search_fields = ("object_id", "actor_ref", "request_id")
    date_hierarchy = "occurred_at"
    ordering = ("-id",)
    list_per_page = 50

    def _allowed(self, request: HttpRequest) -> bool:
        user: Any = request.user
        return bool(user.is_authenticated and user.has_permission_code(Permission.AUDIT_READ_ALL))

    def has_module_permission(self, request: HttpRequest) -> bool:
        return self._allowed(request)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return self._allowed(request)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False
