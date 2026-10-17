"""Request correlation id and one structured log line per request."""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from .context import request_id_var

logger = logging.getLogger("upnext.request")
_VALID_ID = re.compile(r"^[A-Za-z0-9._\-]{8,64}$")
HEADER = "X-Request-ID"


class RequestIdMiddleware:
    """Accepts a well-formed inbound X-Request-ID or mints a new one; echoes it on the response."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        inbound = request.headers.get(HEADER, "")
        request_id = inbound if _VALID_ID.match(inbound) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        request.request_id = request_id  # type: ignore[attr-defined]
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response[HEADER] = request_id
        return response


class RequestLogMiddleware:
    """Logs method, path (no query string), status, duration and the user uuid."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        started = time.perf_counter()
        response = self.get_response(request)
        user = getattr(request, "user", None)
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.path,
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                "user_id": str(user.pk) if user is not None and user.is_authenticated else None,
            },
        )
        return response


class StaffHardeningMiddleware:
    """Keeps the staff interface and the API out of search indexes and limits staff session lifetime.

    * `X-Robots-Tag: noindex, nofollow` on /staff/, /api/ and /health/ (the public pages live in Next.js).
    * A signed-in staff session expires after `UPNEXT_STAFF_SESSION_SECONDS` (default 8 hours) instead of the
      30-day seeker default; the limit is applied once, the first time the session is seen on /staff/.
    """

    PREFIXES = ("/staff/", "/api/", "/health/")

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        on_staff = request.path.startswith("/staff/")
        user = getattr(request, "user", None)
        if (
            on_staff
            and user is not None
            and user.is_authenticated
            and not request.session.get("staff_expiry")
        ):
            from django.conf import settings

            request.session.set_expiry(settings.UPNEXT_STAFF_SESSION_SECONDS)
            request.session["staff_expiry"] = True
        response = self.get_response(request)
        if request.path.startswith(self.PREFIXES):
            response["X-Robots-Tag"] = "noindex, nofollow"
        return response
