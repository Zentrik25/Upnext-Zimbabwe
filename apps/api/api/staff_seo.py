"""Administrator-only SEO monitoring: Indexing API submission history and Search Console figures (ADR-0027).

Read only. It never sends a notification and never changes a setting; submissions are switched on by configuration
and the owner's written approval, not from this page.
"""

from __future__ import annotations

from typing import Any

from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from seo import console, indexing

from .errors import error_response
from .staff_views import StaffView

DEFINITIONS = {
    "queued": "A notification UPNEXT has recorded and not yet sent, or will retry.",
    "accepted": (
        "Google's Indexing API answered HTTP 200 to a notification. That means Google received it. It does not "
        "mean the page is crawled, indexed or shown."
    ),
    "indexed": "Whether Google has the page in its index. Only Search Console's URL Inspection reports this.",
    "impressions": "How often a UPNEXT page appeared in Google Search results.",
    "clicks": "How often a searcher clicked through to UPNEXT from Google Search.",
}


def _iso(value: Any) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


class SeoView(StaffView):
    @method_decorator(never_cache)
    @extend_schema(
        operation_id="getStaffSeo",
        tags=["staff"],
        responses={
            200: OpenApiResponse(description="Indexing submissions and Search Console figures"),
            403: None,
        },
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not user.has_permission_code(Permission.SETTINGS_MANAGE):  # administrators only
            return error_response("permission_denied", "You do not have access to this page.", 403)
        submissions = indexing.summary()
        submissions["recent"] = [
            {
                "id": str(row.pk),
                "url": row.url,
                "kind": row.kind,
                "trigger": row.trigger,
                "status": row.status,
                "attempts": row.attempts,
                "http_status": row.http_status,
                "detail": row.detail,
                "created_at": _iso(row.created_at),
                "sent_at": _iso(row.sent_at),
                "google_notify_time": _iso(row.google_notify_time),
                "next_attempt_at": _iso(row.next_attempt_at) if row.status in ("pending", "retry") else None,
            }
            for row in indexing.recent(50)
        ]
        return Response(
            {"submissions": submissions, "search_console": console.report(), "definitions": DEFINITIONS}
        )
