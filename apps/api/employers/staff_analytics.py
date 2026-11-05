"""Staff analytics queries (D-65): the numbers behind the dashboard, the Analytics page and job statistics.

Definitions, used identically everywhere:

* **24-hour / 7-day / 30-day views**: the hour buckets that start at or after `now - 24 h / 7 d / 30 d`,
  rounded up to the next whole hour, up to and including the current hour. Rolling, never calendar days.
* **All-time views**: the sum of the daily counters, i.e. everything recorded since counting began. Hourly
  rows exist only from the day hourly counting began (`hourly_since`); nothing earlier is invented.
* **Views are page views** (one per browser tab session, see `employers.analytics`). Unique visitors are
  not measured and are never shown as a number.
* **Click-through rate** = apply clicks / views of the same window. Not shown when the window has no
  views. An apply click is not a submitted application.
* Times are stored and queried in UTC and bucketed for display in Africa/Harare (UTC+2 all year).

Everything here reads counters only. Scope: an Administrator sees every listing, anybody else with the
permission sees the listings `opportunities.staff.listings_scope` lets them see.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.core.cache import caches
from django.db.models import Case, Count, F, FloatField, Max, Min, OuterRef, Q, QuerySet, Subquery, Sum, When
from django.db.models.functions import Cast, Coalesce, TruncDay, TruncHour, TruncMonth, TruncWeek
from django.utils import timezone

from access.registry import Permission
from accounts.models import User
from opportunities.models import ListingStatus, Opportunity, SavedOpportunity
from opportunities.staff import listings_scope

from .models import ListingDailyStat, ListingHourlyStat

HARARE = ZoneInfo("Africa/Harare")
CACHE_SECONDS = 60
PERIODS = ("24h", "7d", "30d", "90d", "all")
_DELTA = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
}
_BUCKET = {"24h": "hour", "7d": "day", "30d": "day", "90d": "week", "all": "month"}
SORTS = ("views", "all_views", "clicks", "ctr", "published", "title")
MAX_PAGE_SIZE = 50
MAX_RANGE_DAYS = 400


def ceil_hour(moment: datetime) -> datetime:
    floor = moment.replace(minute=0, second=0, microsecond=0)
    return floor if floor == moment else floor + timedelta(hours=1)


@dataclass(frozen=True)
class Window:
    """Which counters a figure is drawn from. `lo`/`hi` are UTC hour bounds (lo inclusive, hi exclusive); a
    window with `source == "daily"` is the all-time one and is read from the daily counters."""

    key: str
    lo: datetime | None
    hi: datetime | None
    bucket: str
    source: str  # "hourly" | "daily"


def window_for(period: str, now: datetime, *, start: date | None = None, end: date | None = None) -> Window:
    """A named rolling period, or an explicit range of Harare calendar days (both ends included)."""
    if start is not None and end is not None:
        lo = datetime(start.year, start.month, start.day, tzinfo=HARARE).astimezone(UTC)
        hi = (datetime(end.year, end.month, end.day, tzinfo=HARARE) + timedelta(days=1)).astimezone(UTC)
        days = (end - start).days + 1
        return Window("custom", lo, hi, "hour" if days <= 2 else "day" if days <= 92 else "week", "hourly")
    if period == "all":
        return Window("all", None, None, "month", "daily")
    return Window(period, ceil_hour(now - _DELTA[period]), None, _BUCKET[period], "hourly")


def platform_wide(user: User) -> bool:
    return user.has_permission_code(Permission.AUDIT_READ_ALL)


def scope_for(user: User) -> QuerySet[Opportunity] | None:
    """None means every listing (Administrators); otherwise the listings this person may see."""
    return None if platform_wide(user) else listings_scope(user)


def _hourly(scope: QuerySet[Opportunity] | None, window: Window | None = None) -> QuerySet[ListingHourlyStat]:
    rows = ListingHourlyStat.objects.all()
    if scope is not None:
        rows = rows.filter(opportunity__in=scope.values("pk"))
    if window is not None and window.lo is not None:
        rows = rows.filter(hour__gte=window.lo)
    if window is not None and window.hi is not None:
        rows = rows.filter(hour__lt=window.hi)
    return rows


def _daily(scope: QuerySet[Opportunity] | None) -> QuerySet[ListingDailyStat]:
    rows = ListingDailyStat.objects.all()
    if scope is not None:
        rows = rows.filter(opportunity__in=scope.values("pk"))
    return rows


def tracking(now: datetime | None = None) -> dict[str, Any]:
    """When counting began, so the screens can say that nothing earlier exists."""
    hourly = ListingHourlyStat.objects.aggregate(first=Min("hour"))["first"]
    daily = ListingDailyStat.objects.aggregate(first=Min("day"))["first"]
    return {
        "hourly_since": hourly.isoformat().replace("+00:00", "Z") if hourly else None,
        "daily_since": daily.isoformat() if daily else None,
    }


def traffic(scope: QuerySet[Opportunity] | None, now: datetime) -> dict[str, dict[str, int]]:
    """All-time, 24-hour, 7-day and 30-day views and apply clicks (two queries)."""
    c24, c7, c30 = (ceil_hour(now - _DELTA[k]) for k in ("24h", "7d", "30d"))
    q24, q7 = Q(hour__gte=c24), Q(hour__gte=c7)
    rolling = (
        _hourly(scope)
        .filter(hour__gte=c30)
        .aggregate(
            v24=Sum("views", filter=q24),
            a24=Sum("apply_clicks", filter=q24),
            v7=Sum("views", filter=q7),
            a7=Sum("apply_clicks", filter=q7),
            v30=Sum("views"),
            a30=Sum("apply_clicks"),
        )
    )
    total = _daily(scope).aggregate(v=Sum("views"), a=Sum("apply_clicks"))

    def pair(v: Any, a: Any) -> dict[str, int]:
        return {"views": int(v or 0), "apply_clicks": int(a or 0)}

    return {
        "all_time": pair(total["v"], total["a"]),
        "last_24_hours": pair(rolling["v24"], rolling["a24"]),
        "last_7_days": pair(rolling["v7"], rolling["a7"]),
        "last_30_days": pair(rolling["v30"], rolling["a30"]),
    }


def _stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _starts(window: Window, now: datetime, first: date | None) -> list[datetime | date]:
    """Every bucket start of a window, so quiet hours and days show as zero, not as gaps."""
    lo = window.lo
    end = min(now, window.hi) if window.hi else now
    out: list[datetime | date] = []
    if window.bucket == "hour":
        assert lo is not None
        t = lo
        while t <= end:
            out.append(t)
            t += timedelta(hours=1)
    elif window.bucket in ("day", "week"):
        assert lo is not None
        local = lo.astimezone(HARARE)
        day = datetime(local.year, local.month, local.day, tzinfo=HARARE)
        if window.bucket == "week":
            day -= timedelta(days=day.weekday())
        step = timedelta(days=1 if window.bucket == "day" else 7)
        while day.astimezone(UTC) <= end:
            out.append(day.astimezone(UTC))
            day += step
    else:  # months of the daily counters
        begin = first or end.date()
        y, m = begin.year, begin.month
        while (y, m) <= (end.year, end.month):
            out.append(date(y, m, 1))
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def series(scope: QuerySet[Opportunity] | None, window: Window, now: datetime) -> dict[str, Any]:
    """Views and apply clicks per bucket (hour, Harare day, Harare week or month), zero-filled."""
    totals: dict[Any, tuple[int, int]] = {}
    first_day: date | None = None
    if window.source == "daily":
        monthly = (
            _daily(scope)
            .annotate(b=TruncMonth("day"))
            .values("b")
            .annotate(v=Sum("views"), a=Sum("apply_clicks"))
        )
        for row in monthly:
            totals[row["b"]] = (int(row["v"] or 0), int(row["a"] or 0))
        first_day = min(totals) if totals else None
    else:
        trunc = {"hour": TruncHour, "day": TruncDay, "week": TruncWeek}[window.bucket]
        bucketed = (
            _hourly(scope, window)
            .annotate(b=trunc("hour", tzinfo=HARARE))
            .values("b")
            .annotate(v=Sum("views"), a=Sum("apply_clicks"))
        )
        for row in bucketed:
            totals[row["b"].astimezone(UTC)] = (int(row["v"] or 0), int(row["a"] or 0))
    points = []
    for start in _starts(window, now, first_day):
        v, a = totals.get(start, (0, 0))
        points.append(
            {
                "t": start.isoformat()
                if isinstance(start, date) and not isinstance(start, datetime)
                else _stamp(start),
                "views": v,
                "apply_clicks": a,
            }
        )
    return {
        "bucket": window.bucket,
        "points": points,
        "views": sum(p["views"] for p in points),
        "apply_clicks": sum(p["apply_clicks"] for p in points),
    }


def _sum_for(model: Any, field: str, extra: dict[str, Any]) -> Subquery:
    return Subquery(
        model.objects.filter(opportunity=OuterRef("pk"), **extra)
        .order_by()
        .values("opportunity")
        .annotate(s=Sum(field))
        .values("s")
    )


def opportunity_rows(
    scope: QuerySet[Opportunity] | None,
    window: Window,
    *,
    q: str = "",
    sort: str = "views",
    descending: bool = True,
    page: int = 1,
    size: int = 25,
) -> dict[str, Any]:
    """Listings that have been public, with views and apply clicks in the window, all-time views and the
    click-through rate of the same window. Sorting, search and paging happen in the database."""
    base = Opportunity.objects.filter(live_version__isnull=False)
    if scope is not None:
        base = base.filter(pk__in=scope.values("pk"))
    term = q.strip()[:80]
    if term:
        base = base.filter(
            Q(live_version__title__icontains=term)
            | Q(live_version__organisation__name__icontains=term)
            | Q(slug__icontains=term)
        )
    if window.source == "daily":
        views_in = _sum_for(ListingDailyStat, "views", {})
        clicks_in = _sum_for(ListingDailyStat, "apply_clicks", {})
    else:
        bounds: dict[str, Any] = {}
        if window.lo is not None:
            bounds["hour__gte"] = window.lo
        if window.hi is not None:
            bounds["hour__lt"] = window.hi
        views_in = _sum_for(ListingHourlyStat, "views", bounds)
        clicks_in = _sum_for(ListingHourlyStat, "apply_clicks", bounds)
    qs = base.select_related("live_version__organisation").annotate(
        v_in=Coalesce(views_in, 0),
        c_in=Coalesce(clicks_in, 0),
        v_all=Coalesce(_sum_for(ListingDailyStat, "views", {}), 0),
        rate=Case(
            When(v_in__gt=0, then=Cast(F("c_in"), FloatField()) / Cast(F("v_in"), FloatField())),
            default=None,
            output_field=FloatField(),
        ),
    )
    order = {
        "views": "v_in",
        "all_views": "v_all",
        "clicks": "c_in",
        "ctr": "rate",
        "published": "first_published_at",
        "title": "live_version__title",
    }[sort if sort in SORTS else "views"]
    ordering = F(order).desc(nulls_last=True) if descending else F(order).asc(nulls_last=True)
    size = max(1, min(MAX_PAGE_SIZE, size))
    total = qs.count()
    page = max(1, page)
    items = list(qs.order_by(ordering, "-pk")[(page - 1) * size : page * size])
    return {
        "data": [
            {
                "id": str(o.pk),
                "slug": o.slug,
                "title": o.live_version.title if o.live_version else "",
                "organisation": o.live_version.organisation.name if o.live_version else "",
                "published_at": _stamp(o.first_published_at) if o.first_published_at else None,
                "status": o.status,
                "views": int(o.v_in),
                "all_time_views": int(o.v_all),
                "apply_clicks": int(o.c_in),
                "click_through_rate": round(float(o.rate), 4) if o.rate is not None else None,
            }
            for o in items
        ],
        "page": {"page": page, "page_size": size, "total": total, "pages": max(1, math.ceil(total / size))},
    }


def window_totals(scope: QuerySet[Opportunity] | None, window: Window) -> dict[str, int]:
    """Views and apply clicks of one window (the daily counters for all time, the hourly ones otherwise)."""
    if window.source == "daily":
        row = _daily(scope).aggregate(v=Sum("views"), a=Sum("apply_clicks"))
    else:
        row = _hourly(scope, window).aggregate(v=Sum("views"), a=Sum("apply_clicks"))
    return {"views": int(row["v"] or 0), "apply_clicks": int(row["a"] or 0)}


def per_listing(ids: list[Any], window: Window) -> dict[str, dict[str, int]]:
    """Views and apply clicks in a window for a page of listings (one grouped query)."""
    rows: QuerySet[Any]
    if window.source == "daily":
        rows = ListingDailyStat.objects.filter(opportunity_id__in=ids)
    else:
        rows = ListingHourlyStat.objects.filter(opportunity_id__in=ids)
        if window.lo is not None:
            rows = rows.filter(hour__gte=window.lo)
        if window.hi is not None:
            rows = rows.filter(hour__lt=window.hi)
    grouped = rows.values("opportunity_id").annotate(v=Sum("views"), a=Sum("apply_clicks"))
    return {
        str(r["opportunity_id"]): {"views": int(r["v"] or 0), "apply_clicks": int(r["a"] or 0)}
        for r in grouped
    }


def job_stats(opportunity_id: Any, now: datetime) -> dict[str, Any]:
    """One listing: all-time, 24-hour, 7-day and 30-day views and apply clicks, and its saves."""
    only = Opportunity.objects.filter(pk=opportunity_id)
    return {
        **traffic(only, now),
        "saves": SavedOpportunity.objects.filter(opportunity_id=opportunity_id).count(),
        "tracking": tracking(now),
    }


def views_of(ids: list[Any]) -> dict[str, int]:
    """All-time views for a page of listings (one grouped query), for the Views column."""
    rows = (
        ListingDailyStat.objects.filter(opportunity_id__in=ids)
        .values("opportunity_id")
        .annotate(v=Sum("views"))
    )
    return {str(r["opportunity_id"]): int(r["v"] or 0) for r in rows}


def operations(scope: QuerySet[Opportunity] | None, now: datetime) -> dict[str, int]:
    base = (
        Opportunity.objects.all() if scope is None else Opportunity.objects.filter(pk__in=scope.values("pk"))
    )
    published = Q(status=ListingStatus.PUBLISHED)
    open_now = published & (Q(live_version__deadline_at__isnull=True) | Q(live_version__deadline_at__gt=now))
    agg = base.aggregate(
        published=Count("pk", filter=published),
        active=Count("pk", filter=open_now),
        expired=Count("pk", filter=Q(status=ListingStatus.EXPIRED)),
        draft=Count("pk", filter=Q(status=ListingStatus.DRAFT)),
        awaiting_verification=Count("pk", filter=published & Q(is_verified=False)),
    )
    return {k: int(v) for k, v in agg.items()}


def _recent(scope: QuerySet[Opportunity] | None) -> list[dict[str, Any]]:
    last = (
        _hourly(scope)
        .filter(views__gt=0)
        .values("opportunity_id")
        .annotate(at=Max("hour"))
        .order_by("-at")[:5]
    )
    rows = list(last)
    titles = {
        o.pk: o
        for o in Opportunity.objects.filter(pk__in=[r["opportunity_id"] for r in rows]).select_related(
            "live_version__organisation"
        )
    }
    out = []
    for r in rows:
        listing = titles.get(r["opportunity_id"])
        version = listing.live_version if listing else None
        if version is None:
            continue
        out.append(
            {
                "id": str(r["opportunity_id"]),
                "title": version.title,
                "organisation": version.organisation.name,
                "last_viewed_hour": _stamp(r["at"]),
            }
        )
    return out


def overview(
    user: User, period: str, *, now: datetime | None = None, use_cache: bool = True
) -> dict[str, Any]:
    """Everything the dashboard panel and the Analytics page show above the table. Cached for a minute per
    person and period, so opening the dashboard repeatedly does not repeat the aggregation."""
    now = now or timezone.now()
    period = period if period in PERIODS else "30d"
    key = f"analytics:v1:{'all' if platform_wide(user) else user.pk}:{period}"
    cache = caches["local"]
    if use_cache:
        hit = cache.get(key)
        if hit is not None:
            return {**hit, "cached": True}
    scope = scope_for(user)
    window = window_for(period, now)
    chart = series(scope, window, now)
    top = opportunity_rows(scope, window, sort="views", size=5)["data"]
    result = {
        "period": period,
        "generated_at": _stamp(now),
        "traffic": traffic(scope, now),
        "tracking": tracking(now),
        "operations": operations(scope, now),
        "saves": SavedOpportunity.objects.filter(
            **({} if scope is None else {"opportunity__in": scope.values("pk")})
        ).count(),
        "chart": chart,
        "most_viewed": [r for r in top if r["views"] > 0],
        "recently_viewed": _recent(scope),
        "scope": "platform" if scope is None else "yours",
        "unique_visitors": None,  # not measured: no visitor identifier is kept (see employers.analytics)
        "cached": False,
    }
    if use_cache:
        cache.set(key, result, CACHE_SECONDS)
    return result
