"""Signed bounce and complaint feed (P5-01). Provider-neutral: the owner has not chosen a provider yet.

Each provider describes events in its own format and signs them its own way. This module accepts one
small neutral document and checks one HMAC signature; when a provider is chosen, a small relay or translator
in front of it (or a parser added here) maps the provider's events to this shape. Nothing is accepted
without a secret being configured, a fresh timestamp and a valid signature, and a signature can be used once.

    POST /api/v1/hooks/email
    X-Upnext-Timestamp: <unix seconds>
    X-Upnext-Signature: hex(HMAC_SHA256(secret, timestamp + "." + body))
    {"events": [{"type": "bounce" | "complaint", "permanent": true, "address": "someone@example.org"}]}
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Any

from django.conf import settings
from django.core.cache import cache

from . import suppression

logger = logging.getLogger("upnext.email")
MAX_BODY = 64 * 1024
MAX_EVENTS = 500
WINDOW_SECONDS = 300


class WebhookRefused(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status, self.code = status, code


def sign(secret: str, timestamp: str, body: bytes) -> str:
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


def process(body: bytes, timestamp: str | None, signature: str | None, *, now: float | None = None) -> int:
    """Verify and apply a delivery. Returns the number of addresses newly suppressed."""
    secret = getattr(settings, "UPNEXT_EMAIL_WEBHOOK_SECRET", "")
    if len(secret) < 24:
        raise WebhookRefused(503, "webhook_disabled")
    if len(body) > MAX_BODY:
        raise WebhookRefused(413, "too_large")
    if not timestamp or not signature or not timestamp.isdigit():
        raise WebhookRefused(401, "invalid_signature")
    if abs((now or time.time()) - int(timestamp)) > WINDOW_SECONDS:
        raise WebhookRefused(401, "invalid_signature")
    if not hmac.compare_digest(sign(secret, timestamp, body), signature.strip().lower()):
        raise WebhookRefused(401, "invalid_signature")
    if not cache.add(f"emailhook:{signature}", 1, 2 * WINDOW_SECONDS):
        raise WebhookRefused(401, "invalid_signature")  # replay
    try:
        document: Any = json.loads(body)
        events = document["events"]
        if not isinstance(events, list) or len(events) > MAX_EVENTS:
            raise ValueError
    except (ValueError, KeyError, TypeError) as exc:
        raise WebhookRefused(400, "invalid_body") from exc
    added = 0
    for event in events:
        if not isinstance(event, dict) or not isinstance(event.get("address"), str):
            continue
        kind = event.get("type")
        if kind == "complaint" or (kind == "bounce" and event.get("permanent") is True):
            added += int(suppression.suppress(event["address"], kind))
    logger.info(
        "e-mail events received", extra={"event": "email.webhook", "events": len(events), "suppressed": added}
    )
    return added
