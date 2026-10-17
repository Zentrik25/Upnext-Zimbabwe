"""Read-only outbox view for Administrators (SC-13): status, attempts, errors; addresses are masked."""

from __future__ import annotations

from typing import Any

from django.contrib import admin, messages
from django.db.models import QuerySet
from django.http import HttpRequest

from audit import services as audit
from audit.models import Severity

from .models import EmailOutbox, OutboxStatus
from .services import retry


def mask(address: str) -> str:
    local, _, domain = address.partition("@")
    return f"{local[:1]}***@{domain[:1]}***" if domain else "***"


@admin.register(EmailOutbox)
class EmailOutboxAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("created_at", "kind", "status", "attempts", "masked_address", "last_error", "sent_at")
    list_filter = ("status", "kind")
    ordering = ("-created_at",)
    actions = ["retry_selected"]
    list_per_page = 50

    @admin.display(description="Address")
    def masked_address(self, obj: EmailOutbox) -> str:
        return mask(obj.to_address)

    def get_fields(self, request: HttpRequest, obj: Any = None) -> Any:
        return [
            "id",
            "kind",
            "status",
            "attempts",
            "masked_address",
            "last_error",
            "created_at",
            "sent_at",
            "next_attempt_at",
        ]

    def get_readonly_fields(self, request: HttpRequest, obj: Any = None) -> Any:
        return self.get_fields(request, obj)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        user = request.user
        return bool(
            user.is_authenticated
            and getattr(user, "has_permission_code", None)
            and user.has_permission_code("settings.manage")
        )

    @admin.action(description="Retry the selected failed or dead messages")
    def retry_selected(self, request: HttpRequest, queryset: QuerySet[EmailOutbox]) -> None:
        if not self.has_view_permission(request):
            self.message_user(request, "Only Administrators can retry mail.", messages.ERROR)
            return
        count = 0
        for row in queryset.filter(status__in=[OutboxStatus.FAILED, OutboxStatus.DEAD]):
            retry(row)
            audit.record(
                action="outbox.retry",
                object_type="email_outbox",
                object_id=row.pk,
                actor_id=request.user.pk,
                severity=Severity.PRIVILEGED,
            )
            count += 1
        self.message_user(request, f"{count} message(s) queued again.")
