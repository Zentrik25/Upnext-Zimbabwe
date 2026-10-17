"""Throttle the staff login like the public one: per-IP and per-e-mail failure limits on the shared cache.

The Django admin login does not go through the API's throttles, so without this the staff interface would
be the easiest place to guess passwords (SECURITY_ARCHITECTURE §3; MFA and network restriction remain OQ-16).
"""

from __future__ import annotations

from typing import Any

from django.contrib.admin.forms import AdminAuthenticationForm
from django.core.cache import cache
from django.core.exceptions import ValidationError
from rest_framework.throttling import BaseThrottle

from api.throttles import EmailFailureLimiter, hash_key

IP_LIMIT, IP_WINDOW = 30, 15 * 60  # PROPOSED values, like the public login throttle (OQ-17)


def _ip(request: Any) -> str:
    """Same client identification as the API throttles (X-Forwarded-For aware), not the proxy's address."""
    return str(BaseThrottle().get_ident(request)) if request is not None else "-"


class ThrottledAdminAuthenticationForm(AdminAuthenticationForm):
    def clean(self) -> dict[str, Any]:
        email = str(self.data.get(self.username_field.name, ""))
        ip_key = f"admin-login-ip:{hash_key(_ip(self.request))}"
        if EmailFailureLimiter.blocked(email) or int(cache.get(ip_key, 0)) >= IP_LIMIT:
            raise ValidationError("Too many failed sign-in attempts. Try again later.", code="throttled")
        try:
            cleaned: dict[str, Any] = super().clean()
        except ValidationError:
            EmailFailureLimiter.record_failure(email)
            if not cache.add(ip_key, 1, IP_WINDOW):
                try:
                    cache.incr(ip_key)
                except ValueError:
                    cache.add(ip_key, 1, IP_WINDOW)
            raise
        EmailFailureLimiter.reset(email)
        return cleaned


__all__ = ["ThrottledAdminAuthenticationForm"]
