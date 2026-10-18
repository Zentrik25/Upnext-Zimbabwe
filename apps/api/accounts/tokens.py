"""E-mail tokens without a recoverable secret at rest (SECURITY_ARCHITECTURE §3.5)."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone

from .models import AuthToken, TokenPurpose, User

TTL = {
    TokenPurpose.EMAIL_VERIFICATION: timedelta(hours=24),  # PROPOSED, OQ-17
    TokenPurpose.PASSWORD_RESET: timedelta(minutes=60),  # PROPOSED, OQ-17
    TokenPurpose.EMAIL_CHANGE: timedelta(hours=24),  # PROPOSED, like address confirmation
}
MAX_LENGTH = 200


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(token_id: uuid.UUID, purpose: str, user_id: uuid.UUID, expires_at: datetime) -> bytes:
    message = b"|".join(
        [token_id.bytes, purpose.encode(), user_id.bytes, str(int(expires_at.timestamp())).encode()]
    )
    return hmac.new(settings.UPNEXT_TOKEN_KEY.encode(), message, hashlib.sha256).digest()


def issue(
    user: User, purpose: str, *, now: datetime | None = None, new_email: str | None = None
) -> AuthToken:
    """Create a token row and invalidate earlier unused ones for the same user and purpose."""
    now = now or timezone.now()
    AuthToken.objects.filter(
        user=user, purpose=purpose, used_at__isnull=True, invalidated_at__isnull=True
    ).update(invalidated_at=now)
    return AuthToken.objects.create(
        user=user, purpose=purpose, expires_at=now + TTL[TokenPurpose(purpose)], new_email=new_email
    )


def render(token: AuthToken) -> str:
    """The emailed value. Derived on demand, so the outbox needs to store only the token id."""
    return f"{_b64(token.id.bytes)}.{_b64(_mac(token.id, token.purpose, token.user_id, token.expires_at))}"


def resolve(value: str, purpose: str, *, now: datetime | None = None) -> AuthToken | None:
    """Return the usable token or None. The MAC is checked in constant time before the database answers,
    and every failure looks the same to the caller."""
    if not value or len(value) > MAX_LENGTH or value.count(".") != 1:
        return None
    selector, supplied = value.split(".")
    try:
        token_id = uuid.UUID(bytes=_unb64(selector))
        supplied_mac = _unb64(supplied)
    except ValueError, binascii.Error:
        return None
    token = AuthToken.objects.select_related("user").filter(pk=token_id, purpose=purpose).first()
    if token is None:
        # Spend comparable work so a missing row is not faster than a bad MAC.
        hmac.compare_digest(supplied_mac, bytes(32))
        return None
    expected = _mac(token.id, token.purpose, token.user_id, token.expires_at)
    if not hmac.compare_digest(supplied_mac, expected):
        return None
    now = now or timezone.now()
    if token.used_at is not None or token.invalidated_at is not None or token.expires_at <= now:
        return None
    return token
