"""Session authentication that enforces CSRF on *every* unsafe request, including anonymous ones.

DRF's stock SessionAuthentication only checks CSRF for authenticated users. SECURITY_ARCHITECTURE §3.1
requires CSRF on login/registration/reset too (login CSRF), so the check always runs; safe methods
(GET/HEAD/OPTIONS) are skipped by Django's CSRF machinery itself.
"""

from __future__ import annotations

from rest_framework.authentication import SessionAuthentication
from rest_framework.request import Request


class CsrfEnforcingSessionAuthentication(SessionAuthentication):
    def authenticate(self, request: Request) -> tuple[object, None] | None:
        user = getattr(request._request, "user", None)
        self.enforce_csrf(request)
        if not user or not user.is_active:
            return None
        return (user, None)
