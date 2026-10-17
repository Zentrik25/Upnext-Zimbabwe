"""Read-only admin shell (Phase 1). Role management arrives with the workflow in Phase 2 (OQ-13)."""

from __future__ import annotations

from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from .models import StaffRoleAssignment, User


class ReadOnlyAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    def has_add_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False


@admin.register(User)
class UserAdmin(ReadOnlyAdmin):
    list_display = ("id", "status", "email_verified_at", "created_at")  # no e-mail in list views
    list_filter = ("status",)
    exclude = ("password",)
    readonly_fields = ("id", "created_at", "updated_at", "last_login")


@admin.register(StaffRoleAssignment)
class StaffRoleAssignmentAdmin(ReadOnlyAdmin):
    list_display = ("user", "role", "granted_at", "revoked_at")
    list_filter = ("role",)
