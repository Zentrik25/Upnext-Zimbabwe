"""Field validators shared by the workflow service (VALIDATION_SPEC §4, §8, §9).

Each function returns the normalised value or raises `TextError(code, message)` with a code from the
VALIDATION_SPEC §11 catalogue. Defaults chosen for open questions are marked P2-xx (decision register).
"""

from __future__ import annotations

import ipaddress
import re
import secrets
import unicodedata
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .text import TextError

ALLOWED_CURRENCIES = frozenset({"USD", "ZWG"})  # P2-03 (OQ-22): no conversion, no default
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RESERVED_SLUGS = frozenset(
    {"new", "edit", "search", "saved", "api", "admin", "account", "category", "categories"}
)
_SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alikes (i, l, o, 0, 1)
_TRACKING = re.compile(r"^(utm_.*|fbclid|gclid)$", re.IGNORECASE)
_INTERNAL_SUFFIXES = (".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet")
_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)


def validate_url(value: str, *, field_name: str = "URL") -> str:
    """https-only URL rules (§4.1). Returns the normalised URL. Never fetches anything (no SSRF)."""
    value = value.strip()
    if not value or len(value) > 2048:
        raise TextError("invalid_url", f"{field_name} must be 1-2048 characters.")
    if re.search(r"[\x00-\x20\x7f]", value):
        raise TextError("invalid_url", f"{field_name} must not contain spaces or control characters.")
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        raise TextError("invalid_url", f"{field_name} is not a valid URL.") from None
    if parts.scheme.lower() != "https":
        raise TextError("disallowed_scheme", f"{field_name} must use https.")
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise TextError("invalid_url", f"{field_name} must not contain credentials.")
    host = (parts.hostname or "").rstrip(".")
    if not host:
        raise TextError("invalid_url", f"{field_name} needs a host name.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise TextError("invalid_url", f"{field_name} must not use an IP address.")
    try:
        ascii_host = host.encode("idna").decode("ascii").lower()
    except UnicodeError:
        raise TextError("invalid_url", f"{field_name} has an invalid host name.") from None
    if "." not in ascii_host or ascii_host == "localhost" or ascii_host.endswith(_INTERNAL_SUFFIXES):
        raise TextError("invalid_url", f"{field_name} must be a public host name.")
    if port not in (None, 443):
        raise TextError("invalid_url", f"{field_name} must not specify a port.")
    query = urlencode(
        [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not _TRACKING.match(k)]
    )
    return urlunsplit(("https", ascii_host, parts.path or "/", query, ""))


def validate_email(value: str) -> str:
    value = value.strip()
    if len(value) > 254 or not _EMAIL_RE.match(value) or ".." in value.split("@")[0]:
        raise TextError("invalid_email", "Enter a valid e-mail address.")
    local, _, domain = value.rpartition("@")
    return f"{local}@{domain.lower()}"


def validate_timezone(name: str) -> str:
    try:
        ZoneInfo(name)
    except ZoneInfoNotFoundError, ValueError, OSError:
        raise TextError("invalid_timezone", "Not a valid IANA time zone.") from None
    return name


def validate_currency(code: str) -> str:
    if code not in ALLOWED_CURRENCIES:
        raise TextError(
            "invalid_currency", f"Currency must be one of {', '.join(sorted(ALLOWED_CURRENCIES))}."
        )
    return code


def parse_amount(value: str | int | float | Decimal, *, max_int_digits: int = 12) -> Decimal:
    """Decimal with at most two places. Floats are refused: money is never floating point."""
    if isinstance(value, float):
        raise TextError("invalid_format", "Amounts must be decimal strings.")
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise TextError("invalid_format", "Not a decimal amount.") from None
    if not amount.is_finite() or amount < 0:
        raise TextError("out_of_range", "Amount must be zero or more.")
    if amount != amount.quantize(Decimal("0.01")):
        raise TextError("invalid_format", "At most two decimal places.")
    if len(str(int(amount))) > max_int_digits:
        raise TextError("out_of_range", "Amount is too large.")
    return amount.quantize(Decimal("0.01"))


def date_only_deadline(day: date, tz_name: str) -> datetime:
    """P2-03: a date-only deadline is the end of that calendar day (23:59:59) in the stated zone, as UTC."""
    zone = ZoneInfo(validate_timezone(tz_name))
    return datetime.combine(day, time(23, 59, 59), tzinfo=zone).astimezone(UTC)


def check_deadline(deadline_at: datetime, now: datetime) -> None:
    if deadline_at.tzinfo is None:
        raise TextError("invalid_date", "Deadline must include a time zone offset.")
    if deadline_at <= now:
        raise TextError("in_past", "The deadline has already passed.")
    if deadline_at > now + timedelta(days=3 * 366):
        raise TextError("out_of_range", "The deadline is more than three years away.")


def make_slug(title: str) -> str:
    """Slug from a title plus a random suffix (§9); the caller retries on a unique-index collision."""
    folded = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii").lower()
    words = re.sub(r"[^a-z0-9]+", "-", folded).strip("-")
    if len(words) > 60:
        words = words[:60].rsplit("-", 1)[0] if "-" in words[:60] else words[:60]
    words = words.strip("-") or "opportunity"
    suffix = "".join(secrets.choice(_SLUG_ALPHABET) for _ in range(6))
    slug = f"{words}-{suffix}"
    if len(slug) < 8 or not SLUG_RE.match(slug) or slug in RESERVED_SLUGS:  # pragma: no cover - defensive
        raise TextError("invalid_format", "Cannot derive a valid slug.")
    return slug
