"""Session bookkeeping for "manage my sessions" and the lifetime limits (SECURITY_ARCHITECTURE §3).

Only a browser family, an OS family and a truncated network prefix are kept: no raw IP, no full user agent.
"""

from __future__ import annotations

import ipaddress
import re
from typing import Any

from django.http import HttpRequest
from django.utils import timezone

from .models import User, UserSession

_BROWSERS = [("Edge", r"Edg/"), ("Firefox", r"Firefox/"), ("Chrome", r"Chrome/"), ("Safari", r"Safari/")]
_SYSTEMS = [
    ("Android", r"Android"),
    ("iOS", r"iPhone|iPad"),
    ("Windows", r"Windows"),
    ("macOS", r"Mac OS X|Macintosh"),
    ("Linux", r"Linux|X11"),
]


def summarise_agent(user_agent: str) -> str:
    browser = next((name for name, pattern in _BROWSERS if re.search(pattern, user_agent)), "Browser")
    system = next((name for name, pattern in _SYSTEMS if re.search(pattern, user_agent)), None)
    return f"{browser} on {system}" if system else browser


def truncate_ip(address: str | None) -> str:
    """/24 for IPv4, /48 for IPv6."""
    if not address:
        return ""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return ""
    prefix = 24 if ip.version == 4 else 48
    return str(ipaddress.ip_network(f"{ip}/{prefix}", strict=False))


def client_ip(request: HttpRequest) -> str | None:
    from rest_framework.throttling import BaseThrottle

    ident: Any = BaseThrottle().get_ident(request)  # type: ignore[arg-type]
    return str(ident) if ident else None


def start_record(request: HttpRequest, user: User) -> None:
    key = request.session.session_key
    if not key:
        request.session.save()
        key = request.session.session_key
    assert key is not None
    UserSession.objects.update_or_create(
        session_key=key,
        defaults={
            "user": user,
            "user_agent_summary": summarise_agent(request.headers.get("User-Agent", ""))[:80],
            "ip_prefix": truncate_ip(client_ip(request)),
            "revoked_at": None,
            "last_seen_at": timezone.now(),
        },
    )
