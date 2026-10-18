"""Small read-only staff pages that are not tied to one model."""

from __future__ import annotations

from django.contrib import admin
from django.http import HttpRequest, HttpResponse
from django.template.response import TemplateResponse

from access.registry import Role
from opportunities import health


def content_health(request: HttpRequest) -> HttpResponse:
    roles = request.user.active_roles()  # type: ignore[union-attr]
    if Role.EDITOR not in roles and Role.ADMINISTRATOR not in roles:
        return HttpResponse("You do not have access to this page.", status=403)
    data = health.report()
    context = {
        **admin.site.each_context(request),
        "title": "Content health",
        "data": data,
        "per_category": sorted(data["live_per_category"].items()),
        "pipeline": sorted(data["pipeline"].items()),
    }
    return TemplateResponse(request, "admin/content_health.html", context)
