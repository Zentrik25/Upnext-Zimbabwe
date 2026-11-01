"""Trusted devices (D-59): skip the second step on a browser the person trusted, never skip it unsafely.

How it works, in one place:

* After a *successful* code (or recovery code) the person may tick "Trust this device for 30 days". The server
  then creates a `TrustedDevice` row and sends the browser a random value in an HttpOnly, Secure, SameSite=Lax
  cookie. Only a keyed hash of that value is stored. Nothing client side (local storage, fingerprints, a flag the
  browser controls) is ever believed.
* A later sign-in that supplies the *correct password* may skip the code only if the cookie names a live device of
  that same person: not revoked, not past its 30 days, used by the same browser family and system it was trusted
  on, with no run of recent failed attempts, and with its last *proved* code no older than the limit for that
  account: 24 hours for any account that holds a staff role, otherwise the 30 days of the device itself.
  Skipping a code never refreshes that proof; only a verified code does, so the 24-hour rule cannot be dodged by
  signing in again.
* Everything that changes who can sign in revokes every device: a new password, any change to two-step
  verification, an administrator's revocation, suspension, removal and role changes. Revocation is a row update, so
  it takes effect on the next sign-in at once; a revoked or unknown cookie is simply ignored.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from audit import services as audit
from audit.models import Severity

from .models import TrustedDevice, User
from .sessions import client_ip, summarise_agent, truncate_ip

TOUCH_EVERY = timedelta(minutes=10)
FAILURES_BEFORE_DOUBT = 3  # this many failed passwords or codes in the window: ask for a code regardless


def _hash(token: str) -> str:
    return hmac.new(
        settings.UPNEXT_TOKEN_KEY.encode(), b"trusted-device|" + token.encode(), hashlib.sha256
    ).hexdigest()


def is_staff_like(user: User) -> bool:
    return bool(user.active_roles())


def max_mfa_age(user: User) -> timedelta:
    """The longest a device may go without a proven code before this person is asked again."""
    if is_staff_like(user):
        return timedelta(seconds=settings.UPNEXT_STAFF_MFA_MAX_AGE_SECONDS)
    return timedelta(days=settings.UPNEXT_TRUSTED_DEVICE_DAYS)


def _audit(
    user: User, action: str, device: TrustedDevice | None, severity: str = Severity.INFO, **extra: Any
) -> None:
    audit.record(
        action=f"auth.{action}",
        object_type="user",
        object_id=user.pk,
        actor_id=user.pk,
        severity=severity,
        changes={"device": str(device.pk) if device else None, **extra},
    )


def cookie_value(request: HttpRequest) -> str | None:
    value = request.COOKIES.get(settings.TRUSTED_DEVICE_COOKIE_NAME)
    return value if value and 20 <= len(value) <= 128 else None


def _current(request: HttpRequest, user: User) -> TrustedDevice | None:
    """The device the cookie names, if it belongs to `user` and is neither revoked nor expired (nothing else)."""
    token = cookie_value(request)
    if token is None:
        return None
    device = TrustedDevice.objects.filter(token_hash=_hash(token), user=user).first()
    now = timezone.now()
    if device is None or device.revoked_at is not None or device.expires_at <= now:
        return None
    return device


def current_device(request: HttpRequest, user: User) -> TrustedDevice | None:
    return _current(request, user)


def recognise(request: HttpRequest, user: User, *, failures: int = 0) -> TrustedDevice | None:
    """The device that may stand in for a code at this sign-in, or None (then a code is required).

    `failures` is how many wrong passwords or codes were counted against this account just before this sign-in."""
    device = _current(request, user)
    if device is None:
        return None
    now = timezone.now()
    if device.label != summarise_agent(request.headers.get("User-Agent", ""))[:80]:
        # The cookie turned up in a different kind of browser: copied or stolen. Kill it and ask for a code.
        revoke(device, "agent_changed", user=user, severity=Severity.SECURITY)
        return None
    if failures >= FAILURES_BEFORE_DOUBT:
        _audit(user, "trusted_device_doubted", device, Severity.SECURITY, reason="recent_failures")
        return None
    if now - device.last_mfa_at > max_mfa_age(user):
        return None  # still trusted, but a code is due; proving one refreshes it
    if now - device.last_used_at > TOUCH_EVERY:
        device.last_used_at = now
        device.ip_prefix = truncate_ip(client_ip(request)) or device.ip_prefix
        device.save(update_fields=["last_used_at", "ip_prefix"])
    return device


def note_verified(request: HttpRequest, user: User) -> None:
    """A code was just proven on this browser: refresh the proof of the device the cookie names (if any)."""
    device = _current(request, user)
    if device is not None:
        device.last_mfa_at = timezone.now()
        device.save(update_fields=["last_mfa_at"])


def _set_cookie(response: HttpResponse, token: str, expires_at: datetime) -> None:
    response.set_cookie(
        settings.TRUSTED_DEVICE_COOKIE_NAME,
        token,
        max_age=int((expires_at - timezone.now()).total_seconds()),
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="Lax",
        path="/",
    )


def clear_cookie(response: HttpResponse) -> None:
    response.delete_cookie(settings.TRUSTED_DEVICE_COOKIE_NAME, path="/", samesite="Lax")


def trust(request: HttpRequest, response: HttpResponse, user: User) -> TrustedDevice:
    """Trust this browser for 30 days (call only straight after a verified code). Replaces the device the cookie
    already names, and keeps each person to a bounded number of devices (the oldest are revoked)."""
    now = timezone.now()
    previous = _current(request, user)
    if previous is not None:
        revoke(previous, "replaced", user=user, quiet=True)
    live = list(
        TrustedDevice.objects.filter(user=user, revoked_at__isnull=True, expires_at__gt=now).order_by(
            "created_at"
        )
    )
    for old in live[: max(0, len(live) - settings.UPNEXT_TRUSTED_DEVICE_LIMIT + 1)]:
        revoke(old, "limit", user=user, quiet=True)
    token = secrets.token_urlsafe(32)
    device = TrustedDevice.objects.create(
        user=user,
        token_hash=_hash(token),
        label=summarise_agent(request.headers.get("User-Agent", ""))[:80],
        ip_prefix=truncate_ip(client_ip(request)),
        expires_at=now + timedelta(days=settings.UPNEXT_TRUSTED_DEVICE_DAYS),
    )
    _set_cookie(response, token, device.expires_at)
    _audit(user, "trusted_device_added", device, Severity.SECURITY)
    return device


def revoke(
    device: TrustedDevice, reason: str, *, user: User, severity: str = Severity.SECURITY, quiet: bool = False
) -> bool:
    if device.revoked_at is not None:
        return False
    device.revoked_at, device.revoked_reason = timezone.now(), reason[:40]
    device.save(update_fields=["revoked_at", "revoked_reason"])
    if not quiet:
        _audit(user, "trusted_device_revoked", device, severity, reason=reason)
    return True


def revoke_all(user: User, reason: str, *, actor_id: Any = None) -> int:
    """Revoke every live device of `user` (password or two-step change, administrator action, suspension...)."""
    now = timezone.now()
    count = TrustedDevice.objects.filter(user=user, revoked_at__isnull=True).update(
        revoked_at=now, revoked_reason=reason[:40]
    )
    if count:
        audit.record(
            action="auth.trusted_devices_revoked",
            object_type="user",
            object_id=user.pk,
            actor_id=actor_id or user.pk,
            severity=Severity.SECURITY,
            changes={"reason": reason[:40], "count": count},
        )
    return count


def live_devices(user: User) -> list[TrustedDevice]:
    return list(
        TrustedDevice.objects.filter(
            user=user, revoked_at__isnull=True, expires_at__gt=timezone.now()
        ).order_by("-last_used_at")
    )


def revoke_by_id(user: User, device_id: Any) -> TrustedDevice | None:
    device = TrustedDevice.objects.filter(pk=device_id, user=user, revoked_at__isnull=True).first()
    if device is None:
        return None
    revoke(device, "user_revoked", user=user)
    return device
