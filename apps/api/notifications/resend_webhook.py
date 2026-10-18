"""Resend webhook receiver (D-34). Resend signs webhooks with Svix; this is a small verifier, not a client.

    POST /api/v1/hooks/email/resend
    svix-id: msg_...                    unique per event, reused on retries
    svix-timestamp: <unix seconds>
    svix-signature: v1,<base64> [v1,<base64> ...]
    (the same three values under webhook-id / webhook-timestamp / webhook-signature are accepted too: the
    Standard Webhooks names that Resend's current SDK passes to its verifier)
    signature = base64(HMAC_SHA256(base64decode(secret without "whsec_"), f"{id}.{timestamp}.{raw body}"))

Checked against (2026-10-18; resend.com was not reachable from the build environment):
- the `resend` npm SDK 6.34.1 and the `standardwebhooks` 1.1.1 library it calls to verify: signed content
  `id.timestamp.body`, key = base64 of the secret without `whsec_`, 5-minute tolerance both ways,
  space-separated `v1,` signatures (known-answer test in tests/test_resend_webhook.py);
- the SDK's event types: `data.to` is a list, `bounce` is `{type, subType, message}`.
NOT confirmed from Resend's own documentation: the list of `bounce.type` values (only "Permanent" is relied
on; anything else never suppresses) and whether `svix-*` or `webhook-*` header names are sent (both are
accepted).

Semantics: a sending-API 200 is not delivery. Only `email.bounced` with a Permanent bounce and
`email.complained` suppress an address, and only when the event names exactly one recipient (our messages
have one). Transient or undetermined bounces, `email.delivery_delayed`, `email.failed`, `email.suppressed`,
`suppression.*` and the rest never suppress. Nothing personal is logged; a retry of the same event id is
acknowledged and ignored.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import time
from email.utils import parseaddr
from typing import Any

from django.conf import settings
from django.core.cache import cache

from . import suppression
from .webhook import MAX_BODY, WINDOW_SECONDS, WebhookRefused

__all__ = ["MAX_BODY", "WebhookRefused", "process", "sign"]

logger = logging.getLogger("upnext.email")
PREFIX = "whsec_"
SEEN_TTL_SECONDS = 2 * WINDOW_SECONDS + 3600


def _secret_key() -> bytes:
    secret = getattr(settings, "UPNEXT_RESEND_WEBHOOK_SECRET", "")
    if not secret.startswith(PREFIX):
        raise WebhookRefused(404, "webhook_disabled")
    try:
        key = base64.b64decode(secret[len(PREFIX) :], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise WebhookRefused(404, "webhook_disabled") from exc
    if len(key) < 16:
        raise WebhookRefused(404, "webhook_disabled")
    return key


def sign(secret: str, message_id: str, timestamp: str, body: bytes) -> str:
    """Signature header value for a body (used by tests and by the local simulator)."""
    key = base64.b64decode(secret[len(PREFIX) :])
    digest = hmac.new(key, f"{message_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def _valid(key: bytes, message_id: str, timestamp: str, body: bytes, header: str) -> bool:
    expected = hmac.new(key, f"{message_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    ok = False
    for part in header.split():
        version, _, value = part.partition(",")
        if version != "v1":
            continue
        try:
            candidate = base64.b64decode(value, validate=True)
        except binascii.Error, ValueError:
            continue
        ok |= hmac.compare_digest(candidate, expected)
    return ok


def _recipients(data: dict[str, Any]) -> list[str]:
    raw = data.get("to")
    values = [raw] if isinstance(raw, str) else raw if isinstance(raw, list) else []
    return [addr for v in values if isinstance(v, str) and "@" in (addr := parseaddr(v)[1])]


def process(
    body: bytes,
    message_id: str | None,
    timestamp: str | None,
    signature: str | None,
    *,
    now: float | None = None,
) -> dict[str, int]:
    """Verify the raw body, apply the event once, return counters (never addresses)."""
    key = _secret_key()
    if len(body) > MAX_BODY:
        raise WebhookRefused(413, "too_large")
    if not message_id or not timestamp or not signature or not timestamp.isdigit() or len(message_id) > 200:
        raise WebhookRefused(401, "invalid_signature")
    if abs((now or time.time()) - int(timestamp)) > WINDOW_SECONDS:
        raise WebhookRefused(401, "invalid_signature")
    if not _valid(key, message_id, timestamp, body, signature):
        raise WebhookRefused(401, "invalid_signature")
    try:
        event: Any = json.loads(body)
        kind, data = event["type"], event["data"]
        if not isinstance(kind, str) or not isinstance(data, dict):
            raise ValueError
    except (ValueError, KeyError, TypeError) as exc:
        raise WebhookRefused(400, "invalid_body") from exc

    seen_key = f"resendhook:{message_id}"
    if not cache.add(seen_key, 1, SEEN_TTL_SECONDS):
        return {
            "duplicate": 1,
            "suppressed": 0,
        }  # a retry of an event already applied: acknowledge, do nothing
    suppressed = 0
    try:
        bounce = data.get("bounce")
        bounce_type = str(bounce.get("type", "")).lower() if isinstance(bounce, dict) else ""
        recipients = _recipients(data)
        if len(recipients) != 1:
            pass  # not attributable to one address (our messages have exactly one): never suppress a guess
        elif kind == "email.complained":
            suppressed = int(suppression.suppress(recipients[0], "complaint"))
        elif kind == "email.bounced" and bounce_type == "permanent":
            suppressed = int(suppression.suppress(recipients[0], "bounce"))
    except Exception:
        cache.delete(seen_key)  # let the provider's retry apply it
        raise
    logger.info(
        "resend event received",
        extra={"event": "email.webhook.resend", "event_type": kind[:40], "suppressed": suppressed},
    )
    return {"duplicate": 0, "suppressed": suppressed}
