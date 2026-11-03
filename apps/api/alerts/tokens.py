"""The unsubscribe token: signed, carries only the account id and the alert kind, never expires.

An unsubscribe link must keep working for as long as the message sits in an inbox, and the only thing it can
do is switch that person's alert off, so it is safe to leave it valid. It cannot be forged without the
server key, and it reveals nothing but an opaque account id.
"""

from __future__ import annotations

import uuid

from django.core import signing

_SALT = "upnext.alerts.unsubscribe.v1"
_KIND = "job_alert"


def make(user_id: uuid.UUID) -> str:
    return signing.dumps({"u": str(user_id), "k": _KIND}, salt=_SALT, compress=True)


def read(token: str) -> uuid.UUID | None:
    try:
        payload = signing.loads(token, salt=_SALT)
        if payload.get("k") != _KIND:
            return None
        return uuid.UUID(payload["u"])
    except signing.BadSignature, KeyError, ValueError, TypeError, AttributeError:
        return None
