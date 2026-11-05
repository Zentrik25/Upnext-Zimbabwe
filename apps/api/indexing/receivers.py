"""Connects the queue to the publishing workflow (`opportunities.signals.transition_recorded`)."""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.dispatch import receiver

from opportunities.models import Opportunity, OpportunityVersion, PublishingEvent
from opportunities.signals import transition_recorded

from . import service

logger = logging.getLogger("upnext.indexing")


@receiver(transition_recorded, dispatch_uid="indexing_on_transition")
def on_transition(
    sender: Any,
    event: PublishingEvent,
    opportunity: Opportunity,
    version: OpportunityVersion | None,
    reason: str | None,
    **kwargs: Any,
) -> None:
    """Sent inside the transition's transaction. A failure here is logged and swallowed in its own
    savepoint, so it can never roll back or block the editorial decision (the workflow also isolates
    listeners)."""
    try:
        with transaction.atomic():
            service.enqueue(event, opportunity, version or opportunity.live_version)
    except Exception:
        logger.exception("indexing enqueue failed", extra={"event": "indexing.enqueue_failed"})
