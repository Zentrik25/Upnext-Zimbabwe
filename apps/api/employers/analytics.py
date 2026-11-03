"""Listing analytics: aggregate counters, no personal data (Phase 6A, extended by D-65).

What is stored: per listing, per UTC hour and per UTC day, how many page views and how many apply-link clicks.
Nothing identifies a visitor: no cookie, address, user agent or session is kept. Therefore:

* a **view** is one open of a public listing page in one browser tab session (the page reports itself once
  per tab session, see `ListingEvents`); a person who comes back in a new tab, or on another day, counts
  again;
* **unique visitors are not measured**, and the staff screens say so. Counting them reliably would need an
  identifier, which this system deliberately does not keep;
* an **apply click** is a click on the listing's apply button or link. It is not a submitted or successful
  application: UPNEXT never receives applications.

Known automated clients (crawlers, link-preview fetchers, scripted tools, headless browsers) and browser
prefetches are not counted. The filter is a best effort on the User-Agent and prefetch headers, which are read
and dropped.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Mapping
from datetime import date, datetime, timedelta
from typing import Any

from django.db import connection
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from opportunities.models import ListingStatus, Opportunity, SavedOpportunity

from .models import EmployerListing, ListingDailyStat

# Two fixed statements per counter (no string-built SQL): the hourly row and the daily row.
_UPSERT = {
    "view": (
        "INSERT INTO employers_listingdailystat (opportunity_id, day, views, apply_clicks) "
        "VALUES (%s, %s, 1, 0) ON CONFLICT (opportunity_id, day) "
        "DO UPDATE SET views = employers_listingdailystat.views + 1",
        "INSERT INTO employers_listinghourlystat (opportunity_id, hour, views, apply_clicks) "
        "VALUES (%s, %s, 1, 0) ON CONFLICT (opportunity_id, hour) "
        "DO UPDATE SET views = employers_listinghourlystat.views + 1",
    ),
    "apply": (
        "INSERT INTO employers_listingdailystat (opportunity_id, day, views, apply_clicks) "
        "VALUES (%s, %s, 0, 1) ON CONFLICT (opportunity_id, day) "
        "DO UPDATE SET apply_clicks = employers_listingdailystat.apply_clicks + 1",
        "INSERT INTO employers_listinghourlystat (opportunity_id, hour, views, apply_clicks) "
        "VALUES (%s, %s, 0, 1) ON CONFLICT (opportunity_id, hour) "
        "DO UPDATE SET apply_clicks = employers_listinghourlystat.apply_clicks + 1",
    ),
}
KINDS = frozenset(_UPSERT)

# Crawlers, preview fetchers, scripted clients and headless browsers. A real browser never matches.
_AUTOMATED = re.compile(
    r"bot\b|bots\b|crawl|spider|slurp|scrape|fetch|preview|monitor|uptime|validator|lighthouse|pagespeed|"
    r"headless|phantom|puppeteer|playwright|selenium|curl/|wget/|python-|java/|go-http|okhttp|axios|node-fetch|"
    r"httpclient|libwww|facebookexternalhit|whatsapp|telegrambot|linkedinbot|twitterbot|slackbot|discord",
    re.IGNORECASE,
)
_PREFETCH_HEADERS = (("purpose", "prefetch"), ("sec-purpose", "prefetch"), ("x-moz", "prefetch"))


def is_automated(headers: Mapping[str, str]) -> bool:
    """True for a request that is not a person reading the page: no User-Agent at all, a known automated
    client, or a prefetch. Only these headers are read; none is stored."""
    agent = (headers.get("User-Agent") or "").strip()
    if not agent or len(agent) < 12 or _AUTOMATED.search(agent):
        return True
    return any(marker in (headers.get(name) or "").lower() for name, marker in _PREFETCH_HEADERS)


def hour_of(moment: datetime) -> datetime:
    return moment.replace(minute=0, second=0, microsecond=0)


def record(slug: str, kind: str, *, today: date | None = None, now: datetime | None = None) -> bool:
    """Count one event for a listing that is publicly open. Returns False for unknown or non-open listings.
    The hourly and the daily counter are written together, so they never disagree."""
    if kind not in KINDS:
        return False
    opportunity_id = (
        Opportunity.objects.filter(slug=slug, status=ListingStatus.PUBLISHED)
        .values_list("pk", flat=True)
        .first()
    )
    if opportunity_id is None:
        return False
    moment = now or timezone.now()
    day = today or moment.date()
    daily, hourly = _UPSERT[kind]
    with connection.cursor() as cursor:
        cursor.execute(daily, [opportunity_id, day])
        cursor.execute(hourly, [opportunity_id, hour_of(moment)])
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
