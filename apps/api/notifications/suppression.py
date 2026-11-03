"""The suppression list: addresses mail is never sent to."""

from __future__ import annotations

import hashlib
import hmac

from django.conf import settings

from .models import EmailSuppression

REASONS = ("bounce", "complaint", "manual")


def address_hash(address: str) -> str:
    return hmac.new(
        settings.UPNEXT_TOKEN_KEY.encode(), b"suppress|" + address.strip().lower().encode(), hashlib.sha256
    ).hexdigest()


def is_suppressed(address: str) -> bool:
    return EmailSuppression.objects.filter(address_hash=address_hash(address)).exists()


def suppress(address: str, reason: str) -> bool:
    """Add an address. Returns False if it was already listed."""
    _, created = EmailSuppression.objects.get_or_create(
        address_hash=address_hash(address), defaults={"reason": reason}
    )
    return created


def release(address: str) -> bool:
    deleted, _ = EmailSuppression.objects.filter(address_hash=address_hash(address)).delete()
    return bool(deleted)
