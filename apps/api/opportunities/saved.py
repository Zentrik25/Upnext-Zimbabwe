"""Saved opportunities (OQ-31 provisional defaults P3-06).

* Only listings that are currently `published` can be newly saved; saving what is already saved is a no-op.
* A user can hold at most `MAX_SAVED` items.
* Saved rows survive the listing leaving the public view; availability is reported from the listing's status
  (`unavailable` carries no content: archived listings, takedowns).
* A published listing whose deadline has been reached is `expired` from that instant, before the scheduled
  expiry job has moved the stored status, exactly as search, the sitemap and the detail page already treat it.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from accounts.models import User

from .models import ListingStatus, Opportunity, SavedOpportunity

MAX_SAVED = 200  # PROVISIONAL (P3-06)


class NotSaveable(Exception):
    """The listing is public but cannot be newly saved (closed, withdrawn)."""


class LimitReached(Exception):
    pass


AVAILABILITY = {
    ListingStatus.PUBLISHED: "open",
    ListingStatus.EXPIRED: "expired",
    ListingStatus.WITHDRAWN: "withdrawn",
}


def _deadline_reached(opportunity: Opportunity, now: datetime) -> bool:
    live = opportunity.live_version  # callers select_related("opportunity__live_version")
    return live is not None and live.deadline_at is not None and live.deadline_at <= now


def availability_of(opportunity: Opportunity, now: datetime | None = None) -> str:
    if opportunity.status == ListingStatus.PUBLISHED and _deadline_reached(
        opportunity, now or timezone.now()
    ):
        return "expired"
    return AVAILABILITY.get(ListingStatus(opportunity.status), "unavailable")


def save(user: User, opportunity_id: uuid.UUID) -> tuple[SavedOpportunity, bool] | None:
    """Returns (row, created) or None if the listing is not public (reported as 404)."""
    with transaction.atomic():
        User.objects.select_for_update().get(pk=user.pk)  # serialise this user's saves (cap check)
        existing = SavedOpportunity.objects.filter(user=user, opportunity_id=opportunity_id).first()
        if existing is not None:
            return existing, False
        opportunity = Opportunity.objects.select_related("live_version").filter(pk=opportunity_id).first()
        if opportunity is None or opportunity.first_published_at is None:
            return None
        if opportunity.status in (ListingStatus.ARCHIVED,):
            return None
        if opportunity.status != ListingStatus.PUBLISHED or _deadline_reached(opportunity, timezone.now()):
            raise NotSaveable
        if SavedOpportunity.objects.filter(user=user).count() >= MAX_SAVED:
            raise LimitReached
        return SavedOpportunity.objects.create(user=user, opportunity=opportunity), True


def unsave(user: User, opportunity_id: uuid.UUID) -> None:
    SavedOpportunity.objects.filter(user=user, opportunity_id=opportunity_id).delete()


def rows_for(user: User, *, category: str | None = None) -> QuerySet[SavedOpportunity]:
    qs = SavedOpportunity.objects.filter(user=user).select_related(
        "opportunity", "opportunity__category", "opportunity__live_version"
    )
    if category:
        qs = qs.filter(opportunity__category__code=category)
    return qs.order_by("-created_at", "-id")


def states_for(user: User, ids: Iterable[uuid.UUID]) -> QuerySet[SavedOpportunity]:
    return SavedOpportunity.objects.filter(user=user, opportunity_id__in=list(ids)).select_related(
        "opportunity", "opportunity__live_version"
    )
