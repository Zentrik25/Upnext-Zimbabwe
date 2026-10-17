"""Structured (JSON) logging with request correlation and secret/PII redaction.

Logs carry the request id and, where relevant, the user uuid. They must never contain passwords,
tokens, cookies, authorization headers or e-mail addresses (SECURITY_ARCHITECTURE §7; test SEC-09).
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

from .context import get_request_id

_SENSITIVE_KEYS = re.compile(
    r"(password|passwd|secret|token|authorization|cookie|csrf|session|api[_-]?key|email)", re.I
)
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=\-]+")
_KV_SECRET = re.compile(
    r"(?i)\b(password|passwd|secret|token|csrfmiddlewaretoken|sessionid|api[_-]?key)\b(\s*[=:]\s*)([^\s,;&\"']+)"
)
REDACTED = "[REDACTED]"

_STANDARD_ATTRS = set(logging.LogRecord("x", 0, "x", 0, "x", (), None).__dict__) | {
    "message",
    "asctime",
    "request_id",
    "taskName",
}


def redact_text(value: str) -> str:
    value = _EMAIL.sub(REDACTED, value)
    value = _BEARER.sub(r"\1 " + REDACTED, value)
    return _KV_SECRET.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", value)


def redact_value(value: Any, key: str = "") -> Any:
    if key and _SENSITIVE_KEYS.search(key):
        return REDACTED
    if isinstance(value, dict):
        return {str(k): redact_value(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_value(v) for v in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


class RedactionFilter(logging.Filter):
    """Redacts the message, its arguments and any structured `extra` fields."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_text(record.getMessage())
        record.args = ()
        for key in list(record.__dict__):
            if key not in _STANDARD_ATTRS:
                record.__dict__[key] = redact_value(record.__dict__[key], key)
        if record.exc_text:
            record.exc_text = redact_text(record.exc_text)
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", get_request_id()),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_ATTRS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = redact_text(self.formatException(record.exc_info))
        return json.dumps(payload, default=str, ensure_ascii=False)
