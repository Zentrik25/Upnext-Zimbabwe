"""Staff two-step verification: time-based one-time passwords (RFC 6238) and single-use recovery codes.

OQ-16 is open; this is the provisional default P3-07. No third-party dependency: the algorithm is small, and
the secret is derived (never stored) so a database leak alone does not reveal it.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from dataclasses import dataclass
from urllib.parse import quote

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from audit import services as audit
from audit.models import ActorType, Severity

from .models import StaffMfaDevice, StaffRecoveryCode, User

PERIOD = 30
DIGITS = 6
WINDOW = 1  # accept the previous and next step (clock drift)
RECOVERY_CODES = 8
MAX_FAILURES, FAILURE_WINDOW = 5, 15 * 60  # PROPOSED, OQ-17


def _key() -> bytes:
    return settings.UPNEXT_TOKEN_KEY.encode()


def _action(user: User, name: str) -> str:
    """Staff events keep the `staff.` prefix (the alert rules count them); everyone else's are `auth.`."""
    return f"{'staff' if user.is_staff else 'auth'}.mfa_{name}"


def secret_for(device: StaffMfaDevice) -> bytes:
    """20 bytes derived from the server key and the device's random nonce."""
    message = b"totp|" + device.id.bytes + b"|" + device.nonce.encode()
    return hmac.new(_key(), message, hashlib.sha256).digest()[:20]


def secret_text(device: StaffMfaDevice) -> str:
    """Base32 for typing into an authenticator app, in groups of four."""
    raw = base64.b32encode(secret_for(device)).decode().rstrip("=")
    return " ".join(raw[i : i + 4] for i in range(0, len(raw), 4))


def provisioning_uri(user: User, device: StaffMfaDevice) -> str:
    secret = base64.b32encode(secret_for(device)).decode().rstrip("=")
    label = quote(f"{settings.UPNEXT_BRAND_SHORT}:{user.email}")
    return f"otpauth://totp/{label}?secret={secret}&issuer=UPNEXT&digits={DIGITS}&period={PERIOD}"


def code_at(secret: bytes, step: int) -> str:
    digest = hmac.new(secret, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**DIGITS)
    return f"{value:0{DIGITS}d}"


def current_step(now: float | None = None) -> int:
    return int((now if now is not None else time.time()) // PERIOD)


def _normalise(text: str) -> str:
    return "".join(text.split()).lower()


def _hash_recovery(code: str) -> str:
    return hmac.new(
        _key(), b"recovery|" + _normalise(code).replace("-", "").encode(), hashlib.sha256
    ).hexdigest()


# --- failure limiting ----------------------------------------------------------------------------------
def _fail_key(user: User) -> str:
    return f"mfa-fail:{user.pk}"


def blocked(user: User) -> bool:
    return int(cache.get(_fail_key(user), 0)) >= MAX_FAILURES


def _record_failure(user: User) -> None:
    key = _fail_key(user)
    if not cache.add(key, 1, FAILURE_WINDOW):
        try:
            cache.incr(key)
        except ValueError:
            cache.add(key, 1, FAILURE_WINDOW)
    audit.record(
        action=_action(user, "failed"),
        object_type="user",
        object_id=user.pk,
        actor_id=user.pk,
        severity=Severity.SECURITY,
    )


# --- enrolment and verification -----------------------------------------------------------------------
@dataclass(frozen=True)
class Enrolment:
    device: StaffMfaDevice
    secret: str
    uri: str


def device_of(user: User) -> StaffMfaDevice | None:
    return StaffMfaDevice.objects.filter(user=user).first()


def is_enrolled(user: User) -> bool:
    device = device_of(user)
    return device is not None and device.confirmed_at is not None


def begin_enrolment(user: User) -> Enrolment:
    device = device_of(user)
    if device is not None and device.confirmed_at is not None:
        raise ValueError("already enrolled")
    if device is None:
        device = StaffMfaDevice.objects.create(user=user, nonce=secrets.token_hex(16))
    return Enrolment(device, secret_text(device), provisioning_uri(user, device))


def _match(device: StaffMfaDevice, code: str, now: float | None = None) -> int | None:
    """The accepted time step for `code`, or None. Compares every candidate (constant work)."""
    cleaned = _normalise(code)
    if not (len(cleaned) == DIGITS and cleaned.isdigit()):
        return None
    secret, step, found = secret_for(device), current_step(now), None
    for candidate in range(step - WINDOW, step + WINDOW + 1):
        if hmac.compare_digest(code_at(secret, candidate), cleaned) and candidate > device.last_used_step:
            found = candidate
    return found


def confirm_enrolment(user: User, code: str) -> list[str] | None:
    """Confirm the pending device. Returns the recovery codes (shown once), or None if the code is wrong."""
    if blocked(user):
        return None
    with transaction.atomic():
        device = (
            StaffMfaDevice.objects.select_for_update().filter(user=user, confirmed_at__isnull=True).first()
        )
        step = _match(device, code) if device else None
        if device is None or step is None:
            _record_failure(user)
            return None
        device.confirmed_at, device.last_used_step = timezone.now(), step
        device.save(update_fields=["confirmed_at", "last_used_step"])
        plain = _issue_recovery_codes(device)
        audit.record(
            action=_action(user, "enrolled"),
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.PRIVILEGED,
        )
    cache.delete(_fail_key(user))
    return plain


def verify(user: User, code: str) -> bool:
    """A six-digit code (accepted once per time step) or an unused recovery code."""
    if blocked(user):
        return False
    with transaction.atomic():
        device = (
            StaffMfaDevice.objects.select_for_update().filter(user=user, confirmed_at__isnull=False).first()
        )
        if device is None:
            return False
        step = _match(device, code)
        ok, via = False, "totp"
        if step is not None:
            device.last_used_step = step
            device.save(update_fields=["last_used_step"])
            ok = True
        else:
            recovery = StaffRecoveryCode.objects.select_for_update().filter(
                device=device, code_hash=_hash_recovery(code), used_at__isnull=True
            )
            if recovery.update(used_at=timezone.now()):
                ok, via = True, "recovery_code"
        if not ok:
            _record_failure(user)
            return False
        audit.record(
            action=_action(user, "verified"),
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.INFO,
            changes={"method": via},
        )
    cache.delete(_fail_key(user))
    return True


def reset(user: User, *, actor: User | None, reason: str) -> bool:
    """Remove the device so the person re-enrols at next staff sign-in (audited; their sessions end)."""
    from .services import revoke_sessions

    with transaction.atomic():
        removed, _ = StaffMfaDevice.objects.filter(user=user).delete()
        if not removed:
            return False
        revoke_sessions(user)
        audit.record(
            action=_action(user, "reset"),
            object_type="user",
            object_id=user.pk,
            actor_id=actor.pk if actor else None,
            actor_type=ActorType.USER if actor else ActorType.SYSTEM,
            severity=Severity.PRIVILEGED,
            changes={"reason": reason[:200]},
        )
    cache.delete(_fail_key(user))
    return True


# --- the person's own settings (any account; staff cannot turn it off while it is required) ---------
def recovery_codes_left(user: User) -> int:
    device = device_of(user)
    if device is None or device.confirmed_at is None:
        return 0
    return StaffRecoveryCode.objects.filter(device=device, used_at__isnull=True).count()


def _issue_recovery_codes(device: StaffMfaDevice) -> list[str]:
    StaffRecoveryCode.objects.filter(device=device).delete()
    plain = [f"{secrets.token_hex(3)}-{secrets.token_hex(3)}" for _ in range(RECOVERY_CODES)]
    StaffRecoveryCode.objects.bulk_create(
        [StaffRecoveryCode(device=device, code_hash=_hash_recovery(c)) for c in plain]
    )
    return plain


def regenerate_recovery_codes(user: User) -> list[str] | None:
    """Replace every recovery code with a new set (shown once). The caller has already checked a code."""
    with transaction.atomic():
        device = (
            StaffMfaDevice.objects.select_for_update().filter(user=user, confirmed_at__isnull=False).first()
        )
        if device is None:
            return None
        plain = _issue_recovery_codes(device)
        audit.record(
            action=_action(user, "recovery_codes_replaced"),
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
    return plain


def abandon_pending(user: User) -> None:
    """Drop an unconfirmed device so the next setup starts from a fresh key."""
    StaffMfaDevice.objects.filter(user=user, confirmed_at__isnull=True).delete()


def disable(user: User) -> bool:
    """The person turns two-step verification off (the caller has checked their password and a code, and ends
    their other sessions)."""
    with transaction.atomic():
        removed, _ = StaffMfaDevice.objects.filter(user=user, confirmed_at__isnull=False).delete()
        if not removed:
            return False
        audit.record(
            action=_action(user, "disabled"),
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
    cache.delete(_fail_key(user))
    return True
