"""Basic listing analytics (Phase 6A): daily aggregate counters, no personal data.

Only counts are stored: (listing, UTC day, views, apply clicks). Nothing identifies a visitor, so repeat
visits and scripted clients are counted too; the dashboard says the numbers are approximate. Saves are the
number of existing saved rows (a count, never who)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from django.db import connection
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from opportunities.models import ListingStatus, Opportunity, SavedOpportunity

from .models import EmployerListing, ListingDailyStat

# Two fixed statements (no string-built SQL): one per counter.
_UPSERT = {
    "view": (
        "INSERT INTO employers_listingdailystat (opportunity_id, day, views, apply_clicks) "
        "VALUES (%s, %s, 1, 0) ON CONFLICT (opportunity_id, day) "
        "DO UPDATE SET views = employers_listingdailystat.views + 1"
    ),
    "apply": (
        "INSERT INTO employers_listingdailystat (opportunity_id, day, views, apply_clicks) "
        "VALUES (%s, %s, 0, 1) ON CONFLICT (opportunity_id, day) "
        "DO UPDATE SET apply_clicks = employers_listingdailystat.apply_clicks + 1"
    ),
}
KINDS = frozenset(_UPSERT)


def record(slug: str, kind: str, *, today: date | None = None) -> bool:
    """Count one event for a listing that is publicly open. Returns False for unknown or non-open listings."""
    if kind not in KINDS:
        return False
    opportunity_id = (
        Opportunity.objects.filter(slug=slug, status=ListingStatus.PUBLISHED)
        .values_list("pk", flat=True)
        .first()
    )
    if opportunity_id is None:
        return False
    day = today or timezone.now().date()
    with connection.cursor() as cursor:
        cursor.execute(_UPSERT[kind], [opportunity_id, day])
    return True


def summary(organisation_id: uuid.UUID | str, *, today: date | None = None) -> list[dict[str, Any]]:
    """Per employer listing: views and apply clicks over 7 and 30 days and in total, plus saves."""
    today = today or timezone.now().date()
    ids = list(
        EmployerListing.objects.filter(organisation_id=organisation_id).values_list(
            "opportunity_id", flat=True
        )
    )
    if not ids:
        return []

    def window(days: int | None) -> dict[Any, dict[str, int]]:
        rows = ListingDailyStat.objects.filter(opportunity_id__in=ids)
        if days is not None:
            rows = rows.filter(day__gt=today - timedelta(days=days))
        out: dict[Any, dict[str, int]] = {}
        for row in rows.values("opportunity_id").annotate(
            v=Coalesce(Sum("views"), 0), a=Coalesce(Sum("apply_clicks"), 0)
        ):
            out[row["opportunity_id"]] = {"views": row["v"], "apply_clicks": row["a"]}
        return out

    w7, w30, total = window(7), window(30), window(None)
    saves = {
        r["opportunity_id"]: r["n"]
        for r in SavedOpportunity.objects.filter(opportunity_id__in=ids)
        .values("opportunity_id")
        .annotate(n=Count("pk"))
    }
    zero = {"views": 0, "apply_clicks": 0}
    return [
        {
            "opportunity_id": str(pk),
            "last_7_days": w7.get(pk, zero),
            "last_30_days": w30.get(pk, zero),
            "total": total.get(pk, zero),
            "saves": saves.get(pk, 0),
        }
        for pk in ids
    ]
