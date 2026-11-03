"""Staff analytics endpoints (D-65): `GET /staff/analytics`, `GET /staff/analytics/opportunities`.

Both need the second step like every staff endpoint and `analytics.read` (Editors and Administrators).
What a person sees is scoped on the server: an Administrator every listing, anybody else the listings
their staff scope allows. Nothing here is reachable without a staff session, and no endpoint returns
anything about a visitor."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from employers import staff_analytics as stats

from .errors import error_response
from .staff_views import StaffView


def _forbidden() -> Response:
    return error_response("permission_denied", "You cannot view analytics.", 403)


def _day(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


def _int(value: Any, default: int) -> int:
    try:
        return int(value)
    except TypeError, ValueError:
        return default


class AnalyticsOverviewView(StaffView):
    @extend_schema(
        operation_id="getStaffAnalytics",
        tags=["staff"],
        parameters=[OpenApiParameter("period", str, description="24h, 7d, 30d, 90d or all (default 30d)")],
        responses={
            200: OpenApiResponse(description="Traffic, chart, operations and top listings"),
            403: None,
        },
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not user.has_permission_code(Permission.ANALYTICS_READ):
            return _forbidden()
        return Response(stats.overview(user, request.query_params.get("period", "30d")))


class AnalyticsOpportunitiesView(StaffView):
    @extend_schema(
        operation_id="listStaffAnalyticsOpportunities",
        tags=["staff"],
        parameters=[
            OpenApiParameter("period", str),
            OpenApiParameter(
                "from", str, description="First Harare day (YYYY-MM-DD); with `to`, replaces period"
            ),
            OpenApiParameter("to", str),
            OpenApiParameter("q", str),
            OpenApiParameter("sort", str, description="views, all_views, clicks, ctr, published or title"),
            OpenApiParameter("dir", str, description="asc or desc"),
            OpenApiParameter("page", int),
            OpenApiParameter("page_size", int),
        ],
        responses={
            200: OpenApiResponse(description="Listings with views, clicks and click-through rate"),
            400: None,
            403: None,
        },
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not user.has_permission_code(Permission.ANALYTICS_READ):
            return _forbidden()
        params = request.query_params
        now: datetime = timezone.now()
        start, end = _day(params.get("from")), _day(params.get("to"))
        if bool(params.get("from")) != bool(params.get("to")) or (
            params.get("from") and (start is None or end is None)
        ):
            return error_response("validation_failed", "Give both dates as YYYY-MM-DD.", 400)
        if start and end:
            if end < start or (end - start).days >= stats.MAX_RANGE_DAYS:
                return error_response(
                    "validation_failed", f"Choose a range of at most {stats.MAX_RANGE_DAYS} days.", 400
                )
            window = stats.window_for("custom", now, start=start, end=end)
        else:
            period = params.get("period", "30d")
            window = stats.window_for(period if period in stats.PERIODS else "30d", now)
        data = stats.opportunity_rows(
            stats.scope_for(user),
            window,
            q=params.get("q", ""),
            sort=params.get("sort", "views"),
            descending=params.get("dir", "desc") != "asc",
            page=_int(params.get("page"), 1),
            size=_int(params.get("page_size"), 25),
        )
        return Response({**data, "window": window.key, "tracking": stats.tracking(now)})
