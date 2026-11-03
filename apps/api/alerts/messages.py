"""Turns an alert outbox row into the variables its template and headers need (called at send time)."""

from __future__ import annotations

from typing import Any

from django.conf import settings

from notifications.models import EmailOutbox

from . import tokens

_ONE_CLICK = ("List-Unsubscribe-Post", "List-Unsubscribe=One-Click")


def _base() -> str:
    return str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip("/")


def context_for(row: EmailOutbox) -> dict[str, Any] | None:
    """Extra template variables, or None when the person no longer exists (nothing to send)."""
    if row.user_id is None:
        return None
    base = _base()
    token = tokens.make(row.user_id)
    items = [{**item, "url": f"{base}{item['path']}"} for item in row.payload.get("items", [])]
    return {
        "items": items,
        "search_url": f"{base}/opportunities?{row.payload.get('search_query', 'sort=newest')}",
        "manage_url": f"{base}/alerts",
        "unsubscribe_url": f"{base}/alerts/unsubscribe?token={token}",
    }


def headers_for(row: EmailOutbox) -> tuple[tuple[str, str], ...]:
    """RFC 8058 one-click unsubscribe: a POST to the API with the signed token."""
    if row.user_id is None:
        return ()
    url = f"{_base()}/api/v1/alerts/unsubscribe?token={tokens.make(row.user_id)}"
    return (("List-Unsubscribe", f"<{url}>"), _ONE_CLICK)
