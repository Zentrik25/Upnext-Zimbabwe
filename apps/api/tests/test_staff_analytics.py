"""Staff analytics (D-65): counting, bot exclusion, rolling windows, buckets in Harare time, the per-listing table,
click-through rate, permissions, caching and query counts. All data is synthetic, in the test database."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from django.core.cache import caches
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts import retention
from accounts.models import User
from employers import analytics
from employers import staff_analytics as stats
from employers.models import ListingDailyStat, ListingHourlyStat
from opportunities import workflow
from opportunities.models import Opportunity
from tests.factories import World, published, varied

from .test_staff_api import S, signed_in

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 2, 10, 30, tzinfo=UTC)  # a Monday, 12:30 in Harare
BROWSER = (
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
)


@pytest.fixture(autouse=True)
def _fresh_cache() -> None:
    caches["local"].clear()


def listing(world: World, people: dict[str, User], tag: str, example: str = "jobs-1") -> Opportunity:
    return published(
        world, people["author"], people["editor"], example=example, **varied(world, example, tag)
    )


def hourly(opp: Opportunity, when: datetime, views: int = 0, clicks: int = 0) -> None:
    ListingHourlyStat.objects.create(opportunity=opp, hour=when, views=views, apply_clicks=clicks)


def daily(opp: Opportunity, day: date, views: int = 0, clicks: int = 0) -> None:
    ListingDailyStat.objects.create(opportunity=opp, day=day, views=views, apply_clicks=clicks)


def beacon(opp: Opportunity, kind: str = "view", agent: str | None = BROWSER, **headers: str) -> Any:
    client = APIClient()
    extra: dict[str, Any] = {f"HTTP_{k.upper().replace('-', '_')}": v for k, v in headers.items()}
    if agent is not None:
        extra["HTTP_USER_AGENT"] = agent
    url = f"/api/v1/opportunities/{opp.slug}/events"
    return client.post(url, {"type": kind}, format="json", **extra)


# --- counting ----------------------------------------------------------------------------------------------
def test_a_real_browser_view_and_an_apply_click_are_counted_in_the_hourly_and_the_daily_counter(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "a")
    assert beacon(opp).status_code == 204 and beacon(opp, "apply").status_code == 204
    (h,) = ListingHourlyStat.objects.filter(opportunity=opp)
    (d,) = ListingDailyStat.objects.filter(opportunity=opp)
    assert (h.views, h.apply_clicks) == (d.views, d.apply_clicks) == (1, 1)
    assert h.hour == analytics.hour_of(h.hour) and h.hour.tzinfo is not None  # the start of a UTC hour


def test_two_events_in_the_same_hour_add_to_one_row_and_different_hours_make_two(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "b")
    analytics.record(str(opp.slug), "view", now=NOW)
    analytics.record(str(opp.slug), "view", now=NOW + timedelta(minutes=20))
    analytics.record(str(opp.slug), "view", now=NOW + timedelta(hours=1))
    rows = list(ListingHourlyStat.objects.filter(opportunity=opp).order_by("hour"))
    assert [(r.hour.hour, r.views) for r in rows] == [(10, 2), (11, 1)]
    assert ListingDailyStat.objects.get(opportunity=opp).views == 3


@pytest.mark.parametrize(
    "agent",
    [
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        "curl/8.5.0",
        "python-requests/2.32",
        "Mozilla/5.0 AppleWebKit/537.36 HeadlessChrome/126.0 Safari/537.36",
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "WhatsApp/2.24 A",
        "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
        "Lighthouse Chrome-Lighthouse",
        "k",  # not a browser string
        "",
    ],
)
def test_crawlers_scripts_previews_and_empty_agents_are_not_counted(
    world: World, people: dict[str, User], agent: str
) -> None:
    opp = listing(world, people, "bot")
    assert beacon(opp, agent=agent).status_code == 204  # answered quietly, not counted
    assert not ListingHourlyStat.objects.exists() and not ListingDailyStat.objects.exists()


def test_a_request_with_no_user_agent_header_and_a_prefetch_are_not_counted(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "pre")
    assert beacon(opp, agent=None).status_code == 204
    for header in ("Purpose", "Sec-Purpose", "X-Moz"):
        assert beacon(opp, **{header: "prefetch"}).status_code == 204
    assert not ListingHourlyStat.objects.exists()
    assert (
        beacon(opp).status_code == 204 and ListingHourlyStat.objects.get().views == 1
    )  # a person still counts


def test_only_public_listings_count_never_a_preview_or_a_closed_one(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "closed")
    opp.refresh_from_db()
    workflow.withdraw(
        people["editor"], opp.pk, expected_row_version=opp.row_version, reason="The issuer withdrew it."
    )
    assert beacon(opp).status_code == 204
    assert not ListingHourlyStat.objects.exists()
    assert analytics.record("no-such-listing-xx", "view") is False


def test_nothing_that_identifies_a_visitor_is_stored() -> None:
    columns = {f.name for model in (ListingHourlyStat, ListingDailyStat) for f in model._meta.get_fields()}
    assert columns <= {"id", "opportunity", "hour", "day", "views", "apply_clicks"}


# --- rolling windows ------------------------------------------------------------------------------------
def test_rolling_windows_include_the_whole_hours_inside_them_and_exclude_the_one_that_straddles_the_edge(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "win")
    inside_24 = NOW.replace(minute=0) - timedelta(
        hours=23
    )  # yesterday 11:00, the first full hour inside 24 h
    straddling = NOW.replace(minute=0) - timedelta(hours=24)  # yesterday 10:00 starts before now - 24 h
    hourly(opp, NOW.replace(minute=0), 5, 1)  # the current, partial hour
    hourly(opp, inside_24, 3, 0)
    hourly(opp, straddling, 100, 7)
    t = stats.traffic(None, NOW)
    assert t["last_24_hours"] == {"views": 8, "apply_clicks": 1}
    assert t["last_7_days"]["views"] == 108 and t["last_30_days"]["views"] == 108


def test_seven_and_thirty_day_windows_and_their_edges(world: World, people: dict[str, User]) -> None:
    opp = listing(world, people, "edges")
    top = NOW.replace(minute=0)
    first_in_7 = top - timedelta(days=7) + timedelta(hours=1)
    just_out_7 = top - timedelta(days=7)
    first_in_30 = top - timedelta(days=30) + timedelta(hours=1)
    just_out_30 = top - timedelta(days=30)
    for when, n in ((first_in_7, 1), (just_out_7, 10), (first_in_30, 100), (just_out_30, 1000)):
        hourly(opp, when, n)
    t = stats.traffic(None, NOW)
    assert t["last_7_days"]["views"] == 1
    assert t["last_30_days"]["views"] == 1 + 10 + 100
    assert t["last_24_hours"]["views"] == 0


def test_all_time_is_the_sum_of_the_daily_counters_including_days_with_no_hourly_data(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "all")
    daily(opp, date(2026, 8, 1), 40, 4)  # before hourly counting began
    daily(opp, date(2026, 11, 2), 6, 2)
    hourly(opp, NOW.replace(minute=0), 6, 2)
    t = stats.traffic(None, NOW)
    assert t["all_time"] == {"views": 46, "apply_clicks": 6}
    assert t["last_30_days"] == {
        "views": 6,
        "apply_clicks": 2,
    }  # the earlier 40 are never invented into a window
    tracking = stats.tracking()
    assert tracking["daily_since"] == "2026-08-01" and tracking["hourly_since"].startswith("2026-11-02T10")


def test_no_data_means_zeros_and_no_tracking_dates() -> None:
    assert stats.traffic(None, NOW)["all_time"] == {"views": 0, "apply_clicks": 0}
    assert stats.tracking() == {"hourly_since": None, "daily_since": None}


# --- the chart ------------------------------------------------------------------------------------------
def test_the_24_hour_chart_is_hourly_zero_filled_and_adds_up_to_the_card(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "c24")
    hourly(opp, NOW.replace(minute=0), 2)
    hourly(opp, NOW.replace(minute=0) - timedelta(hours=5), 3)
    chart = stats.series(None, stats.window_for("24h", NOW), NOW)
    assert chart["bucket"] == "hour" and len(chart["points"]) == 24
    assert (
        chart["points"][0]["t"] == "2026-11-01T11:00:00Z"
        and chart["points"][-1]["t"] == "2026-11-02T10:00:00Z"
    )
    assert chart["views"] == stats.traffic(None, NOW)["last_24_hours"]["views"] == 5
    assert sum(1 for p in chart["points"] if p["views"] == 0) == 22


def test_daily_buckets_follow_the_harare_calendar_day_not_the_utc_day(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "tz")
    hourly(opp, datetime(2026, 11, 1, 21, 0, tzinfo=UTC), 1)  # 23:00 on 1 Nov in Harare
    hourly(opp, datetime(2026, 11, 1, 22, 0, tzinfo=UTC), 10)  # 00:00 on 2 Nov in Harare
    hourly(opp, datetime(2026, 11, 2, 8, 0, tzinfo=UTC), 100)
    chart = stats.series(None, stats.window_for("7d", NOW), NOW)
    by_day = {p["t"]: p["views"] for p in chart["points"]}
    assert by_day["2026-11-01T22:00:00Z"] == 110  # Harare's 2 Nov starts at 22:00 UTC on 1 Nov
    assert by_day["2026-10-31T22:00:00Z"] == 1
    assert chart["bucket"] == "day" and chart["views"] == 111


def test_ninety_days_are_weekly_and_all_time_is_monthly(world: World, people: dict[str, User]) -> None:
    opp = listing(world, people, "long")
    hourly(opp, NOW.replace(minute=0) - timedelta(days=40), 4)
    daily(opp, date(2026, 9, 3), 9)
    daily(opp, date(2026, 11, 2), 1)
    weekly = stats.series(None, stats.window_for("90d", NOW), NOW)
    assert weekly["bucket"] == "week" and 12 <= len(weekly["points"]) <= 15 and weekly["views"] == 4
    monthly = stats.series(None, stats.window_for("all", NOW), NOW)
    assert monthly["bucket"] == "month"
    assert [(p["t"], p["views"]) for p in monthly["points"]] == [
        ("2026-09-01", 9),
        ("2026-10-01", 0),
        ("2026-11-01", 1),
    ]


# --- the per-listing table and click-through rate -----------------------------------------------------------
def test_table_columns_sorting_search_paging_and_the_click_through_rate_of_the_same_window(
    world: World, people: dict[str, User]
) -> None:
    a = listing(world, people, "alpha")
    b = listing(world, people, "bravo", "jobs-2")
    c = listing(world, people, "charlie", "internships-1")
    top = NOW.replace(minute=0)
    hourly(a, top, 10, 2)  # 20 %
    hourly(b, top - timedelta(hours=2), 40, 4)  # 10 %
    hourly(c, top - timedelta(days=3), 5, 5)  # 100 %, only in the 7-day window
    daily(a, date(2026, 11, 2), 90, 30)  # all-time: a has 90 views, 30 clicks in the daily counter
    daily(b, date(2026, 11, 2), 40, 4)
    daily(c, date(2026, 11, 2), 5, 5)
    now_window = stats.window_for("24h", NOW)
    rows = stats.opportunity_rows(None, now_window)["data"]
    by = {r["id"]: r for r in rows}
    assert [r["id"] for r in rows][:2] == [str(b.pk), str(a.pk)]  # most viewed in the window first
    assert by[str(a.pk)]["views"] == 10 and by[str(a.pk)]["apply_clicks"] == 2
    assert by[str(a.pk)]["click_through_rate"] == 0.2  # 2 / 10 of the same 24 hours, never 30 / 90 all-time
    assert by[str(a.pk)]["all_time_views"] == 90
    assert by[str(c.pk)]["views"] == 0 and by[str(c.pk)]["click_through_rate"] is None  # no views, no rate
    week = {r["id"]: r for r in stats.opportunity_rows(None, stats.window_for("7d", NOW))["data"]}
    assert week[str(c.pk)]["click_through_rate"] == 1.0
    all_time = {r["id"]: r for r in stats.opportunity_rows(None, stats.window_for("all", NOW))["data"]}
    assert all_time[str(a.pk)]["views"] == 90 and all_time[str(a.pk)]["click_through_rate"] == round(
        30 / 90, 4
    )
    # sorting, direction, search and paging all happen in the database
    asc = stats.opportunity_rows(None, now_window, sort="views", descending=False)["data"]
    assert asc[-1]["id"] == str(b.pk)
    by_title = stats.opportunity_rows(None, now_window, sort="title", descending=False)["data"]
    assert [r["title"] for r in by_title] == sorted(r["title"] for r in by_title)
    found = stats.opportunity_rows(None, now_window, q="charlie")
    assert [r["id"] for r in found["data"]] == [str(c.pk)] and found["page"]["total"] == 1
    page2 = stats.opportunity_rows(None, now_window, size=2, page=2)
    assert len(page2["data"]) == 1 and page2["page"] == {"page": 2, "page_size": 2, "total": 3, "pages": 2}
    assert by[str(a.pk)]["organisation"] and by[str(a.pk)]["published_at"].endswith("Z")


def test_a_custom_range_is_in_harare_days_with_both_ends_included(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "range")
    hourly(opp, datetime(2026, 11, 1, 21, 0, tzinfo=UTC), 1)  # 23:00 on 1 Nov in Harare: before the range
    hourly(opp, datetime(2026, 11, 1, 22, 0, tzinfo=UTC), 2)  # 00:00 on 2 Nov: first hour of the range
    hourly(opp, datetime(2026, 11, 3, 21, 0, tzinfo=UTC), 4)  # 23:00 on 3 Nov: last hour of the range
    hourly(opp, datetime(2026, 11, 3, 22, 0, tzinfo=UTC), 8)  # 00:00 on 4 Nov: after the range
    window = stats.window_for("custom", NOW, start=date(2026, 11, 2), end=date(2026, 11, 3))
    (row,) = [r for r in stats.opportunity_rows(None, window)["data"] if r["id"] == str(opp.pk)]
    assert row["views"] == 6


# --- API: permissions and scope -------------------------------------------------------------------------
def test_who_may_read_analytics(world: World, people: dict[str, User]) -> None:
    listing(world, people, "perm")
    for url in (f"{S}/analytics", f"{S}/analytics/opportunities"):
        assert APIClient().get(url).status_code in (401, 403)
        assert signed_in(people["seeker"]).get(url).status_code == 403
        contributor = signed_in(people["author"]).get(url)
        assert contributor.status_code == 403 and contributor.json()["error"]["code"] == "permission_denied"
        assert signed_in(people["editor"]).get(url).status_code == 200
        assert signed_in(people["admin"]).get(url).status_code == 200


def test_administrators_see_the_platform_and_editors_their_scope(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "scope")
    hourly(opp, NOW.replace(minute=0), 3)
    assert signed_in(people["admin"]).get(f"{S}/analytics").json()["scope"] == "platform"
    assert signed_in(people["editor"]).get(f"{S}/analytics").json()["scope"] == "yours"
    assert stats.scope_for(people["admin"]) is None
    scoped = stats.scope_for(people["editor"])
    assert scoped is not None and scoped.filter(pk=opp.pk).exists()


def test_the_overview_reports_traffic_operations_chart_and_says_unique_visitors_are_not_measured(
    world: World, people: dict[str, User]
) -> None:
    a = listing(world, people, "ov-a")
    listing(world, people, "ov-b", "jobs-2")
    now = datetime.now(UTC)
    hourly(a, analytics.hour_of(now), 4, 1)
    daily(a, now.date(), 4, 1)
    body = signed_in(people["admin"]).get(f"{S}/analytics", {"period": "7d"}).json()
    assert body["period"] == "7d" and body["traffic"]["last_24_hours"] == {"views": 4, "apply_clicks": 1}
    assert body["traffic"]["all_time"]["views"] == 4
    assert body["unique_visitors"] is None  # page views are counted, visitors are not
    assert body["operations"]["published"] == 2 and body["operations"]["active"] == 2
    assert body["operations"]["awaiting_verification"] == 2 and body["operations"]["draft"] == 0
    assert body["chart"]["bucket"] == "day" and body["chart"]["views"] == 4
    assert [r["id"] for r in body["most_viewed"]] == [str(a.pk)]
    assert [r["id"] for r in body["recently_viewed"]] == [str(a.pk)]
    assert "hourly_since" in body["tracking"]
    workflow.set_verification(people["admin"], a.pk, verified=True)
    caches["local"].clear()
    assert signed_in(people["admin"]).get(f"{S}/analytics").json()["operations"]["awaiting_verification"] == 1


def test_unknown_periods_fall_back_and_bad_table_parameters_are_refused(
    world: World, people: dict[str, User]
) -> None:
    listing(world, people, "bad")
    client = signed_in(people["admin"])
    assert client.get(f"{S}/analytics", {"period": "forever"}).json()["period"] == "30d"
    url = f"{S}/analytics/opportunities"
    assert client.get(url, {"from": "2026-11-01"}).status_code == 400  # one end only
    assert client.get(url, {"from": "x", "to": "y"}).status_code == 400
    assert client.get(url, {"from": "2026-11-05", "to": "2026-11-01"}).status_code == 400
    assert client.get(url, {"from": "2020-01-01", "to": "2026-01-01"}).status_code == 400  # too long
    assert (
        client.get(url, {"from": "2026-11-01", "to": "2026-11-02", "sort": "ctr", "dir": "asc"}).status_code
        == 200
    )
    assert (
        client.get(url, {"page": "x", "page_size": "9999", "sort": "nonsense"}).json()["page"]["page_size"]
        == 50
    )


def test_the_table_endpoint_shape(world: World, people: dict[str, User]) -> None:
    opp = listing(world, people, "shape")
    now = datetime.now(UTC)
    hourly(opp, analytics.hour_of(now), 7, 1)
    daily(opp, now.date(), 7, 1)
    body = (
        signed_in(people["editor"])
        .get(f"{S}/analytics/opportunities", {"period": "24h", "q": "shape"})
        .json()
    )
    (row,) = body["data"]
    assert row["views"] == 7 and row["all_time_views"] == 7 and row["apply_clicks"] == 1
    assert row["click_through_rate"] == round(1 / 7, 4) and body["window"] == "24h"


def test_listing_rows_carry_all_time_views_only_for_people_who_may_see_analytics(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "views")
    daily(opp, date(2026, 11, 2), 12, 3)
    mine = next(
        r
        for r in signed_in(people["editor"]).get(f"{S}/opportunities").json()["data"]
        if r["id"] == str(opp.pk)
    )
    assert mine["views"] == 12
    contributor = signed_in(people["author"]).get(f"{S}/opportunities").json()["data"]
    assert all(r["views"] is None for r in contributor)


def test_the_listing_detail_has_its_own_statistics_for_authorised_staff_only(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "detail")
    now = datetime.now(UTC)
    hourly(opp, analytics.hour_of(now), 5, 2)
    daily(opp, now.date(), 9, 3)
    detail = signed_in(people["admin"]).get(f"{S}/opportunities/{opp.pk}").json()["analytics"]
    assert detail["all_time"] == {"views": 9, "apply_clicks": 3}
    assert detail["last_24_hours"] == {"views": 5, "apply_clicks": 2}
    assert detail["last_7_days"]["views"] == 5 and detail["last_30_days"]["views"] == 5
    assert detail["saves"] == 0 and "hourly_since" in detail["tracking"]
    assert signed_in(people["author"]).get(f"{S}/opportunities/{opp.pk}").json()["analytics"] is None


# --- performance, cache, retention -----------------------------------------------------------------------
def _queries(fn: Any) -> int:
    with CaptureQueriesContext(connection) as ctx:
        fn()
    return len(ctx)


def test_query_counts_do_not_grow_with_the_number_of_listings(world: World, people: dict[str, User]) -> None:
    first = listing(world, people, "p1")
    hourly(first, NOW.replace(minute=0), 1, 0)
    admin = people["admin"]
    stats.overview(admin, "30d", now=NOW, use_cache=False)  # warms the person's roles, which are loaded once
    small_overview = _queries(lambda: stats.overview(admin, "30d", now=NOW, use_cache=False))
    small_table = _queries(lambda: stats.opportunity_rows(None, stats.window_for("30d", NOW)))
    for n, example in enumerate(("jobs-2", "internships-1", "tenders-1"), start=2):
        other = listing(world, people, f"p{n}", example)
        hourly(other, NOW.replace(minute=0), n, 0)
        daily(other, NOW.date(), n, 0)
    assert _queries(lambda: stats.overview(admin, "30d", now=NOW, use_cache=False)) == small_overview
    assert _queries(lambda: stats.opportunity_rows(None, stats.window_for("30d", NOW))) == small_table
    assert small_overview <= 16 and small_table <= 3


def test_the_overview_is_cached_for_a_minute_per_person_and_period(
    world: World, people: dict[str, User]
) -> None:
    listing(world, people, "cache")
    admin = people["admin"]
    assert stats.overview(admin, "30d", now=NOW)["cached"] is False
    assert _queries(lambda: stats.overview(admin, "30d", now=NOW)) == 0  # the second call reads no database
    assert stats.overview(admin, "30d", now=NOW)["cached"] is True
    assert stats.overview(admin, "7d", now=NOW)["cached"] is False  # another period has its own entry
    assert stats.overview(people["editor"], "30d", now=NOW)["cached"] is False  # and so has another person


def test_the_indexes_the_queries_rely_on_exist() -> None:
    names = {i.name for i in ListingHourlyStat._meta.indexes}
    assert names == {"hourlystat_recent_idx", "hourlystat_hour_idx"}
    assert {c.name for c in ListingHourlyStat._meta.constraints} == {"hourlystat_unique"}


def test_old_hourly_counters_are_removed_with_the_daily_ones(
    world: World, people: dict[str, User], settings: Any
) -> None:
    opp = listing(world, people, "retain")
    keep = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    hourly(opp, keep, 1)
    hourly(opp, keep - timedelta(days=settings.UPNEXT_RETENTION_LISTING_STATS_DAYS + 5), 9)
    counts = retention.run(datetime.now(UTC))
    assert counts["listing_hourly_stats"] == 1
    assert list(ListingHourlyStat.objects.values_list("views", flat=True)) == [1]


def test_hourly_and_daily_totals_agree_for_events_recorded_through_the_beacon(
    world: World, people: dict[str, User]
) -> None:
    opp = listing(world, people, "agree")
    for _ in range(5):
        assert beacon(opp).status_code == 204
    assert beacon(opp, "apply").status_code == 204
    t = stats.job_stats(opp.pk, datetime.now(UTC))
    assert t["all_time"] == t["last_30_days"] == {"views": 5, "apply_clicks": 1}
