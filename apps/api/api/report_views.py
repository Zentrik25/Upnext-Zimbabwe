"""Public reporting endpoint (M2). Anonymous, no cookie, no CSRF (no session is used), rate limited."""

from __future__ import annotations

import json
from typing import Any

from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from opportunities.errors import WorkflowError
from reports import services

from .employer_views import _fields
from .errors import error_response
from .throttles import ReportIpThrottle, hash_key

MAX_BODY = 8 * 1024


@method_decorator(never_cache, name="dispatch")
class CreateListingReportView(APIView):
    """Report a public listing. The listing is never changed by a report; staff review it (Django Admin)."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ReportIpThrottle]

    @extend_schema(
        operation_id="createListingReport",
        tags=["public"],
        request=None,
        responses={
            202: OpenApiResponse(description="Received. Returns a reference the reporter can quote."),
            400: None,
            404: None,
            413: None,
            429: None,
        },
    )
    def post(self, request: Request, slug: str) -> Response:
        try:
            length = int(request.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            return error_response("too_large", "That report is too long.", 413)
        try:
            payload = json.loads(request.body or b"{}")
        except ValueError:
            payload = None
        if not isinstance(payload, dict):
            return error_response("validation_failed", "Send a JSON object.", 400)
        client = hash_key(ReportIpThrottle().get_ident(request))
        try:
            receipt = services.submit(slug, payload, client_ident=client)
        except WorkflowError as exc:
            return error_response(
                exc.code, exc.message, exc.http_status, _fields(exc.fields) if exc.fields else None
            )
        return Response(
            {"reference": receipt.reference, "message": "Thank you. Staff will review your report."},
            status=status.HTTP_202_ACCEPTED,
        )
