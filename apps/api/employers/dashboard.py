"""The employer dashboard's numbers (D-70): counts, the views chart and the table's per-listing figures.

Everything is computed from the organisation's own listings (`EmployerListing`), with the same counters,
windows and definitions the staff Analytics page uses (`employers.staff_analytics`, `employers.analytics`):

* a **view** is one open of a public listing in one browser tab session; unique visitors are not measured;
* an **apply click** is a click on the apply button or link. It is *not* a submitted or successful
  application: UPNEXT never receives applications, and nothing here says otherwise;
* nothing is estimated or invented: a quiet day is a zero, and counting that began after a period started is
  said so through `tracking`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from opportunities.models import ListingStatus, Opportunity, SavedOpportunity

from . import staff_analytics as sa

PERIODS = sa.PERIODS
DEFAULT_PERIOD = "7d"
# Status filters of the opportunities table -> the listing statuses behind them.
STATUS_FILTERS = ("all", "active", "draft", "review", "changes", "expired", "withdrawn")


def scope_of(organisation_id: uuid.UUID | str) -> QuerySet[Opportunity]:
    """The organisation's own listings, discarded drafts excluded. The only scope any employer figure uses."""
    return Opportunity.objects.filter(employer_binding__organisation_id=organisation_id).exclude(
        status=ListingStatus.ARCHIVED
    )


def open_now(now: datetime) -> Q:
    return Q(status=ListingStatus.PUBLISHED) & (
        Q(live_version__deadline_at__isnull=True) | Q(live_version__deadline_at__gt=now)
    )


def counts(scope: QuerySet[Opportunity], now: datetime) -> dict[str, int]:
    """Total, active (public and still open), drafts, expired, and the states in between."""
    agg = scope.aggregate(
        total=Count("pk"),
        active=Count("pk", filter=open_now(now)),
        drafts=Count("pk", filter=Q(status=ListingStatus.DRAFT)),
        in_review=Count("pk", filter=Q(status__in=[ListingStatus.IN_REVIEW, ListingStatus.APPROVED])),
        changes_requested=Count("pk", filter=Q(status=ListingStatus.REJECTED)),
        expired=Count("pk", filter=Q(status=ListingStatus.EXPIRED)),
        withdrawn=Count("pk", filter=Q(status=ListingStatus.WITHDRAWN)),
    )
    return {key: int(value) for key, value in agg.items()}


def filter_status(scope: QuerySet[Opportunity], status: str, now: datetime) -> QuerySet[Opportunity]:
    if status == "active":
        return scope.filter(open_now(now))
    mapping = {
        "draft": [ListingStatus.DRAFT],
        "review": [ListingStatus.IN_REVIEW, ListingStatus.APPROVED],
        "changes": [ListingStatus.REJECTED],
        "expired": [ListingStatus.EXPIRED],
        "withdrawn": [ListingStatus.WITHDRAWN],
    }
    return scope.filter(status__in=mapping[status]) if status in mapping else scope


def search(scope: QuerySet[Opportunity], term: str) -> QuerySet[Opportunity]:
    term = term.strip()[:80]
    if not term:
        return scope
    return scope.filter(Q(pending_version__title__icontains=term) | Q(live_version__title__icontains=term))


def _previous_window(window: sa.Window, now: datetime) -> sa.Window | None:
    """The period of the same length just before a rolling one; all time has none."""
    if window.key == "all" or window.lo is None:
        return None
    length = (window.hi or now) - window.lo
    return sa.Window("previous", window.lo - length, window.lo, window.bucket, "hourly")


def _change(now_value: int, before: int) -> float | None:
    """Percent change against the previous period; None when there was nothing to compare with."""
    if before <= 0:
        return None
    return round((now_value - before) * 100 / before, 1)


def overview(organisation_id: uuid.UUID | str, period: str, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or timezone.now()
    period = period if period in PERIODS else DEFAULT_PERIOD
    scope = scope_of(organisation_id)
    window = sa.window_for(period, now)
    chart = sa.series(scope, window, now)
    totals = (
        sa.traffic(scope, now)["all_time"]
        if window.key == "all"
        else {"views": chart["views"], "apply_clicks": chart["apply_clicks"]}
    )
    before_window = _previous_window(window, now)
    previous = sa.window_totals(scope, before_window) if before_window else None
    top = sa.opportunity_rows(scope, window, sort="views", size=5)["data"]
    ids = list(scope.values_list("pk", flat=True))
    return {
        "period": period,
        "generated_at": sa._stamp(now),
        "counts": counts(scope, now),
        "traffic": {
            **totals,
            "previous": previous,
            "change": {
                "views": _change(totals["views"], previous["views"]) if previous else None,
                "apply_clicks": _change(totals["apply_clicks"], previous["apply_clicks"])
                if previous
                else None,
            },
        },
        "saves": SavedOpportunity.objects.filter(opportunity_id__in=ids).count() if ids else 0,
        "chart": chart,
        "most_viewed": [
            {
                "id": row["id"],
                "title": row["title"],
                "slug": row["slug"],
                "views": row["views"],
                "apply_clicks": row["apply_clicks"],
            }
            for row in top
            if row["views"] > 0
        ],
        "tracking": sa.tracking(now),
        "unique_visitors": None,  # not measured: no visitor identifier is kept
        "note": (
            "Views count each open of a public listing once per browser tab session; repeat and automated "
            "visits are not removed. Apply clicks are clicks on the apply button or link, not applications: "
            "UPNEXT never receives applications."
        ),
    }


def page_stats(ids: list[Any], period: str, now: datetime | None = None) -> dict[str, dict[str, int]]:
    now = now or timezone.now()
    window = sa.window_for(period if period in PERIODS else DEFAULT_PERIOD, now)
    return sa.per_listing(ids, window)


__all__ = ["DEFAULT_PERIOD", "PERIODS", "STATUS_FILTERS", "counts", "overview", "page_stats", "scope_of"]
