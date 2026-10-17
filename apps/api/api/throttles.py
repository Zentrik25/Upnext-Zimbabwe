"""Rate limiting backed by the database cache (shared across worker processes; Redis is deferred)."""

from __future__ import annotations

import hashlib
import hmac
import re
from typing import Any

from django.conf import settings
from django.core.cache import cache
from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle

_RATE = re.compile(r"^(\d+)/(\d+)([smhd])$")
_UNIT = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def hash_key(value: str) -> str:
    """Peppered hash so raw identifiers (e-mail addresses) never reach the cache table."""
    pepper = settings.UPNEXT_THROTTLE_PEPPER.encode()
    return hmac.new(pepper, value.strip().lower().encode(), hashlib.sha256).hexdigest()[:32]


class LoginIpThrottle(SimpleRateThrottle):
    """Per-IP limit on login attempts. Rate syntax: `<count>/<n><s|m|h|d>`, e.g. `20/15m`."""

    scope = "login_ip"

    def parse_rate(self, rate: str | None) -> tuple[int | None, int | None]:
        if rate is None:
            return (None, None)
        match = _RATE.match(rate)
        if not match:
            raise ValueError(f"Invalid throttle rate {rate!r}")
        return int(match.group(1)), int(match.group(2)) * _UNIT[match.group(3)]

    def get_cache_key(self, request: Request, view: Any) -> str:
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class EmailFailureLimiter:
    """Counts failed logins per e-mail hash; no permanent lock-out, only a rolling window."""

    @staticmethod
    def _key(email: str) -> str:
        return f"login-fail:{hash_key(email)}"

    @classmethod
    def blocked(cls, email: str) -> bool:
        return int(cache.get(cls._key(email), 0)) >= settings.UPNEXT_LOGIN_FAILURES_PER_EMAIL

    @classmethod
    def record_failure(cls, email: str) -> None:
        key = cls._key(email)
        window = settings.UPNEXT_LOGIN_FAILURE_WINDOW_SECONDS
        if cache.add(key, 1, window):
            return
        try:
            cache.incr(key)
        except ValueError:  # expired between add() and incr()
            cache.add(key, 1, window)

    @classmethod
    def reset(cls, email: str) -> None:
        cache.delete(cls._key(email))
