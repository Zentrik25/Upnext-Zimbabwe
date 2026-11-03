"""Request correlation id and one structured log line per request."""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Callable
from typing import Any

from django.http import HttpRequest, HttpResponse
from django.utils import timezone

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
    """Keeps the API out of search indexes and applies session lifetime limits.

    * `X-Robots-Tag: noindex, nofollow` on /api/ and /health/ (the public pages live in Next.js; the staff
      workspace marks itself noindex there).
    * Idle and absolute session limits (SECURITY_ARCHITECTURE §3, PROPOSED values, OQ-17): seekers 7 days idle
      and 30 days absolute; any account holding a staff role 30 minutes idle and 8 hours absolute. An expired
      session is logged out and the request continues as anonymous.
    """

    PREFIXES = ("/api/", "/health/")
    TOUCH_EVERY = 60  # seconds between writes of the activity stamp

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def _limits(self, user: Any) -> tuple[int, int]:
        from django.conf import settings

        if user.active_roles():
            return settings.UPNEXT_STAFF_IDLE_SECONDS, settings.UPNEXT_STAFF_SESSION_SECONDS
        return settings.UPNEXT_SEEKER_IDLE_SECONDS, settings.UPNEXT_SEEKER_ABSOLUTE_SECONDS

    def _enforce(self, request: HttpRequest) -> None:
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return
        from django.contrib.auth import logout

        now = time.time()
        idle, absolute = self._limits(user)
        session = request.session
        login_at = float(session.get("login_at", now))
        last = float(session.get("last_activity", now))
        if now - login_at > absolute or now - last > idle:
            logout(request)
            return
        if "login_at" not in session:
            session["login_at"] = login_at
        if now - last >= self.TOUCH_EVERY or "last_activity" not in session:
            session["last_activity"] = now
            if now - last >= 300:
                from accounts.models import UserSession

                UserSession.objects.filter(session_key=session.session_key, revoked_at__isnull=True).update(
                    last_seen_at=timezone.now()
                )

    def __call__(self, request: HttpRequest) -> HttpResponse:
        self._enforce(request)
        response = self.get_response(request)
        if request.path.startswith(self.PREFIXES):
            response["X-Robots-Tag"] = "noindex, nofollow"
        return response
