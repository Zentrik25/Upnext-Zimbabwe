"""The single write path to the audit log."""

from __future__ import annotations

import uuid
from typing import Any

from core.context import get_request_id

from .models import ActorType, AuditEvent, Severity


def record(
    *,
    action: str,
    object_type: str,
    object_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    actor_type: str | None = None,
    severity: str = Severity.INFO,
    changes: dict[str, Any] | None = None,
) -> AuditEvent:
    """Write one audit row. Call it inside the same transaction as the change it describes: if this
    insert fails the surrounding transaction rolls back, so no change goes unaudited (invariant 7)."""
    if actor_type is None:
        actor_type = ActorType.USER if actor_id is not None else ActorType.ANONYMOUS
    return AuditEvent.objects.create(
        actor_type=actor_type,
        actor_ref=actor_id,
        action=action,
        object_type=object_type,
        object_id=object_id,
        severity=severity,
        request_id=get_request_id(),
        changes=changes,
    )
