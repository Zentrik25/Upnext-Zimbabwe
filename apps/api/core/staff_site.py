"""The UPNEXT staff site: Django Admin with the dashboard as its home page and the shared page shell.

Only presentation and read-only figures are added here. Authentication, the two-step gate, every permission
check and every state change stay where they were (Django Admin views, `access.policy`,
`opportunities.workflow`, the database triggers).
"""

from __future__ import annotations

from typing import Any

from django.contrib.admin import AdminSite
from django.http import HttpRequest
from django.template.response import TemplateResponse


class StaffAdminSite(AdminSite):
    def each_context(self, request: HttpRequest) -> dict[str, Any]:
        # Imported here: these modules import ModelAdmin modules, which register against this very site.
        from core import staff_shell

        context = super().each_context(request)
        context["staff_shell"] = staff_shell.build(request, context["available_apps"])
        return context

    def index(self, request: HttpRequest, extra_context: dict[str, Any] | None = None) -> TemplateResponse:
        from core import staff_dashboard, staff_shell

        extra: dict[str, Any] = dict(extra_context or {})
        if staff_shell.shell_enabled(request):
            user: Any = request.user
            extra["dashboard"] = {
                "kpis": staff_dashboard.kpis(user),
                "attention": staff_shell.attention_for(request),
                "activity": staff_dashboard.recent_activity(user),
                "listings": staff_dashboard.listing_rows(user),
            }
        return super().index(request, extra)
