"""Rate limiting backed by the database cache (shared across worker processes; Redis is deferred)."""

from __future__ import annotations

import hashlib
import hmac
import re
from typing import Any

from django.conf import settings
from django.core.cache import cache, caches
from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle

_RATE = re.compile(r"^(\d+)/(\d+)([smhd])$")
_UNIT = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def hash_key(value: str) -> str:
    """Peppered hash so raw identifiers (e-mail addresses) never reach the cache table."""
    pepper = settings.UPNEXT_THROTTLE_PEPPER.encode()
    return hmac.new(pepper, value.strip().lower().encode(), hashlib.sha256).hexdigest()[:32]


class IpRateThrottle(SimpleRateThrottle):
    """Per-IP limit. Rate syntax: `<count>/<n><s|m|h|d>`, e.g. `20/15m`."""

    def parse_rate(self, rate: str | None) -> tuple[int | None, int | None]:
        if rate is None:
            return (None, None)
        match = _RATE.match(rate)
        if not match:
            raise ValueError(f"Invalid throttle rate {rate!r}")
        return int(match.group(1)), int(match.group(2)) * _UNIT[match.group(3)]

    def get_cache_key(self, request: Request, view: Any) -> str:
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class LoginIpThrottle(IpRateThrottle):
    scope = "login_ip"


class PublicReadThrottle(IpRateThrottle):
    """Anonymous read endpoints (SECURITY_ARCHITECTURE §8, PROPOSED values)."""

    scope = "public_read"
    # Counted in process memory: a database write on every anonymous read was the main database cost under
    # load (Phase 5 load test). Each worker counts separately, so the effective limit is at most the rate
    # times the number of workers, which is acceptable for abuse control on public data. Login, e-mail and
    # second-step counters stay in the shared database cache because their accuracy matters.
    cache = caches["local"]


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


class RegisterIpThrottle(IpRateThrottle):
    scope = "register_ip"


class EmailRequestIpThrottle(IpRateThrottle):
    """Resend-verification and password-reset requests."""

    scope = "email_request_ip"


class TokenIpThrottle(IpRateThrottle):
    """E-mail verification and password-reset confirmation."""

    scope = "token_ip"


class UserWriteThrottle(SimpleRateThrottle):
    """Authenticated `/me/*` writes, keyed by user (SECURITY_ARCHITECTURE §8)."""

    scope = "me_write"
    parse_rate = IpRateThrottle.parse_rate

    def get_cache_key(self, request: Request, view: Any) -> str | None:
        user = request.user
        if not user or not user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": str(user.pk)}


class UnsubscribeIpThrottle(IpRateThrottle):
    scope = "unsubscribe_ip"


class ForYouThrottle(UserWriteThrottle):
    """The personalised feed reads up to a few hundred listings per request, so reads are limited per user."""

    scope = "for_you_user"


def email_request_gate(email: str) -> None:
    """Per-address limits for e-mail-sending requests: 3 per hour and at least 60 s apart. Applies to every
    address alike, registered or not, so it reveals nothing. Raises `Throttled` when exceeded."""
    from rest_framework.exceptions import Throttled

    ident = hash_key(email)
    gap_key, count_key = f"email-gap:{ident}", f"email-count:{ident}"
    if not cache.add(gap_key, 1, settings.UPNEXT_EMAIL_REQUEST_GAP_SECONDS):
        raise Throttled(wait=settings.UPNEXT_EMAIL_REQUEST_GAP_SECONDS)
    if not cache.add(count_key, 1, 3600):
        try:
            if cache.incr(count_key) > settings.UPNEXT_EMAIL_REQUESTS_PER_HOUR:
                raise Throttled(wait=3600)
        except ValueError:
            cache.add(count_key, 1, 3600)
