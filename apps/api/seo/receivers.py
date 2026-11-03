"""Queue an Indexing API notification when a listing's public state changes (ADR-0027).

Connected to `opportunities.signals.transition_recorded`, which is sent inside the transition's transaction. The
notification row therefore commits or rolls back with the transition, and a failure here is logged and swallowed in
its own savepoint: it can never block or undo an editorial decision (see that signal's contract).
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.dispatch import receiver

from opportunities.models import Opportunity, OpportunityVersion
from opportunities.signals import transition_recorded

from . import indexing

logger = logging.getLogger("upnext.indexing")


@receiver(transition_recorded, dispatch_uid="seo_indexing_on_transition")
def on_transition(
    sender: Any,
    event: Any,
    opportunity: Opportunity,
    version: OpportunityVersion | None,
    reason: str | None,
    **kwargs: Any,
) -> None:
    if event.transition not in indexing.UPDATE_TRANSITIONS | indexing.CLOSING_TRANSITIONS:
        return
    try:
        with transaction.atomic():
            opportunity = (
                Opportunity.objects.select_related("category", "live_version")
                .prefetch_related("live_version__locations__location")
                .get(pk=opportunity.pk)
            )
            indexing.queue_for(opportunity, event.transition)
    except Exception:  # an indexing problem must never stop publication
        logger.exception("indexing queue failed", extra={"event": "indexing.queue_failed"})
