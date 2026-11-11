"""SEO monitoring for Administrators: `GET /staff/seo`, `GET /staff/seo/notifications`,
`POST /staff/seo/notifications/<id>/retry`, `POST /staff/seo/notifications/retry-dead`.

Administrators only (the same test as staff management: they hold `settings.manage`), second step required
like every staff endpoint. The answers describe what UPNEXT asked Google and how Google answered the
request; they never claim that a page is indexed. No credential, token or response body is ever returned.
"""

from __future__ import annotations

import uuid
from typing import Any

from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from indexing import monitoring

from .errors import CodedPermissionDenied, error_response
from .staff_views import StaffView


class SeoView(StaffView):
    """Administrators only. The check runs before anything is read."""

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        super().initial(request, *args, **kwargs)
        if not self.user_of(request).has_permission_code(Permission.SETTINGS_MANAGE):
            raise CodedPermissionDenied("permission_denied")


class SeoOverviewView(SeoView):
    @extend_schema(
        operation_id="getStaffSeo",
        tags=["staff"],
        responses={
            200: OpenApiResponse(description="Indexing queue, sitemap and structured-data figures"),
            403: None,
        },
    )
    def get(self, request: Request) -> Response:
        return Response(monitoring.overview())


class SeoNotificationsView(SeoView):
    @extend_schema(
        operation_id="listStaffSeoNotifications",
        tags=["staff"],
        parameters=[
            OpenApiParameter("status", str, description="pending, sending, failed, sent, dead or superseded")
        ],
        responses={200: OpenApiResponse(description="The latest Indexing API notifications"), 403: None},
    )
    def get(self, request: Request) -> Response:
        return Response({"data": monitoring.notifications(request.query_params.get("status"))})


class SeoRetryView(SeoView):
    @extend_schema(
        operation_id="retryStaffSeoNotification",
        tags=["staff"],
        request=None,
        responses={
            200: OpenApiResponse(description="Queued again"),
            403: None,
            404: None,
            409: OpenApiResponse(description="not_retryable or superseded"),
        },
    )
    def post(self, request: Request, notification_id: uuid.UUID) -> Response:
        try:
            row = monitoring.retry(self.user_of(request).pk, notification_id)
        except monitoring.RetryRefused as exc:
            return error_response(exc.code, exc.message, exc.status)
        return Response({"id": str(row.pk), "status": row.status})


class SeoRetryDeadView(SeoView):
    @extend_schema(
        operation_id="retryStaffSeoDeadNotifications",
        tags=["staff"],
        request=None,
        responses={200: OpenApiResponse(description="How many were queued again"), 403: None},
    )
    def post(self, request: Request) -> Response:
        return Response({"requeued": monitoring.retry_all_dead(self.user_of(request).pk)})
