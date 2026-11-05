"""Employer dashboard (D-70): real counts and analytics for the caller's own organisation only, filtered listings,
duplicate, picture upload, and the unchanged separation of duties."""

from __future__ import annotations

import io
import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from employers import analytics, dashboard, listings
from employers.models import EmployerListing, ListingDailyStat, ListingHourlyStat
from opportunities import workflow
from opportunities.errors import PermissionDeniedError
from opportunities.models import ListingStatus, Opportunity
from tests.conftest import csrf
from tests.employer_helpers import employer_content, verified_member
from tests.factories import CHECKLIST, World
from tests.test_employer_api import J, send, signed_in

pytestmark = pytest.mark.django_db


@pytest.fixture
def employer(make_user: Callable[..., User]) -> User:
    return make_user(email="employer@example.org", display_name="Employer One")


@pytest.fixture
def rival(make_user: Callable[..., User]) -> User:
    return make_user(email="rival@example.org", display_name="Rival Recruiter")


def draft(user: User, org: Any, world: World, title: str, **over: Any) -> Opportunity:
    category, data = employer_content(
        world, application_url=f"https://example.org/apply/{uuid.uuid4().hex[:8]}", title=title, **over
    )
    return listings.create(user, org.pk, category, data)


def slug(opp: Opportunity) -> str:
    assert opp.slug
    return opp.slug


def publish(opp: Opportunity, people: dict[str, User]) -> Opportunity:
    listings.submit(opp.pending_version.author, opp.pk, opp.row_version)  # type: ignore[union-attr]
    opp.refresh_from_db()
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor2"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    return opp


@pytest.fixture
def acme(employer: User, people: dict[str, User], world: World) -> tuple[Any, dict[str, Opportunity]]:
    """An organisation with a published, a draft, a waiting and an expired listing."""
    org = verified_member(people["editor"], employer)
    live = publish(draft(employer, org, world, "Stock Controllers Grade G"), people)
    waiting = draft(employer, org, world, "Driver Salesperson Route Four")
    listings.submit(employer, waiting.pk, waiting.row_version)
    waiting.refresh_from_db()
    gone = publish(draft(employer, org, world, "Accounting Officer Creditors"), people)
    workflow.expire(
        people["editor2"], gone.pk, expected_row_version=gone.row_version, reason="Deadline passed."
    )
    gone.refresh_from_db()
    mine = draft(employer, org, world, "Storekeeper Bulawayo Depot")
    return org, {"live": live, "waiting": waiting, "gone": gone, "draft": mine}


def other_org(rival: User, people: dict[str, User], world: World) -> tuple[Any, Opportunity]:
    org = verified_member(people["editor"], rival, name="Rival Foods Limited")
    return org, publish(draft(rival, org, world, "Rival Production Supervisor"), people)


# --- access --------------------------------------------------------------------------------------------
def test_the_dashboard_endpoints_need_a_session(client: APIClient) -> None:
    org = uuid.uuid4()
    for url in (f"{J}/organisations/{org}/dashboard", f"{J}/organisations/{org}/listings"):
        assert client.get(url).status_code in (401, 403)
    assert client.post(f"{J}/images").status_code in (401, 403)
    assert client.post(f"{J}/listings/{uuid.uuid4()}/duplicate").status_code in (401, 403)


def test_a_stranger_gets_404_for_someone_elses_organisation(
    acme: tuple[Any, dict[str, Opportunity]], rival: User, people: dict[str, User], world: World
) -> None:
    org, mine = acme
    other_org(rival, people, world)
    web = signed_in(rival)
    for tail in ("dashboard", "listings", "analytics"):
        assert web.get(f"{J}/organisations/{org.pk}/{tail}").status_code == 404
    dup = send(web, "post", f"{J}/listings/{mine['live'].pk}/duplicate")
    assert dup.status_code == 404
    assert web.get(f"{J}/listings/{mine['live'].pk}").status_code == 404
    assert Opportunity.objects.filter(employer_binding__organisation=org).count() == 4  # nothing was copied


def test_a_plain_seeker_has_no_employer_data(people: dict[str, User], acme: tuple[Any, Any]) -> None:
    org, _ = acme
    web = signed_in(people["seeker"])
    assert web.get(f"{J}/organisations/{org.pk}/dashboard").status_code == 404


# --- counts --------------------------------------------------------------------------------------------
def test_the_counts_come_from_the_organisations_own_listings(
    acme: tuple[Any, dict[str, Opportunity]],
    employer: User,
    rival: User,
    people: dict[str, User],
    world: World,
) -> None:
    org, _ = acme
    other_org(rival, people, world)  # must not change any number below
    body = signed_in(employer).get(f"{J}/organisations/{org.pk}/dashboard?period=7d").json()
    assert body["organisation"]["name"] == org.name and body["organisation"]["verified"] is True
    assert body["counts"] == {
        "total": 4,
        "active": 1,
        "drafts": 1,
        "in_review": 1,
        "changes_requested": 0,
        "expired": 1,
        "withdrawn": 0,
    }


def test_a_discarded_draft_is_not_counted(acme: tuple[Any, dict[str, Opportunity]], employer: User) -> None:
    org, mine = acme
    listings.discard(employer, mine["draft"].pk, mine["draft"].row_version)
    assert dashboard.counts(dashboard.scope_of(org.pk), timezone.now())["total"] == 3


def test_a_published_listing_past_its_deadline_is_not_active(
    acme: tuple[Any, dict[str, Opportunity]],
) -> None:
    """A revision is frozen once published, so the clock moves instead of the deadline."""
    org, mine = acme
    version = mine["live"].live_version
    assert version is not None and version.deadline_at is not None
    scope = dashboard.scope_of(org.pk)
    assert dashboard.counts(scope, version.deadline_at - timedelta(days=1))["active"] == 1
    assert dashboard.counts(scope, version.deadline_at + timedelta(minutes=1))["active"] == 0


# --- analytics: real, own, separate clicks ------------------------------------------------------------
def test_views_and_apply_clicks_are_counted_apart_and_only_for_the_caller(
    acme: tuple[Any, dict[str, Opportunity]],
    employer: User,
    rival: User,
    people: dict[str, User],
    world: World,
) -> None:
    org, mine = acme
    _, theirs = other_org(rival, people, world)
    for _ in range(5):
        analytics.record(slug(mine["live"]), "view")
    for _ in range(2):
        analytics.record(slug(mine["live"]), "apply")
    for _ in range(40):
        analytics.record(slug(theirs), "view")  # a rival's traffic must never show up here
    analytics.record(slug(theirs), "apply")
    web = signed_in(employer)
    body = web.get(f"{J}/organisations/{org.pk}/dashboard?period=24h").json()
    assert body["traffic"]["views"] == 5 and body["traffic"]["apply_clicks"] == 2
    assert [m["id"] for m in body["most_viewed"]] == [str(mine["live"].pk)]
    assert body["unique_visitors"] is None and "never receives applications" in body["note"]
    listed = web.get(f"{J}/organisations/{org.pk}/listings?period=24h").json()["data"]
    row = next(r for r in listed if r["id"] == str(mine["live"].pk))
    assert (row["views"], row["apply_clicks"]) == (5, 2)
    assert all(r["views"] == 0 for r in listed if r["id"] != str(mine["live"].pk))
    assert str(theirs.pk) not in str(listed) and str(theirs.pk) not in str(body)


def test_the_chart_is_zero_filled_and_its_total_matches(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    org, mine = acme
    analytics.record(slug(mine["live"]), "view")
    web = signed_in(employer)
    shapes = {"24h": ("hour", 24, 26), "7d": ("day", 7, 9), "30d": ("day", 30, 32)}
    for period, (bucket, low, high) in shapes.items():
        chart = web.get(f"{J}/organisations/{org.pk}/dashboard?period={period}").json()["chart"]
        assert chart["bucket"] == bucket and low <= len(chart["points"]) <= high, period
        assert chart["views"] == sum(p["views"] for p in chart["points"]) == 1, period
    wide = web.get(f"{J}/organisations/{org.pk}/dashboard?period=90d").json()["chart"]
    assert wide["bucket"] == "week" and wide["views"] == 1
    everything = web.get(f"{J}/organisations/{org.pk}/dashboard?period=all").json()
    assert everything["chart"]["bucket"] == "month" and everything["traffic"]["views"] == 1
    assert everything["traffic"]["previous"] is None  # all time has nothing to compare with


def test_the_change_against_the_previous_period_is_real_or_absent(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    org, mine = acme
    opp_id = mine["live"].pk
    now = timezone.now()
    this_hour = now.replace(minute=0, second=0, microsecond=0)
    ListingHourlyStat.objects.create(opportunity_id=opp_id, hour=this_hour - timedelta(hours=1), views=15)
    ListingHourlyStat.objects.create(opportunity_id=opp_id, hour=this_hour - timedelta(days=9), views=10)
    web = signed_in(employer)
    week = web.get(f"{J}/organisations/{org.pk}/dashboard?period=7d").json()["traffic"]
    assert week["views"] == 15 and week["previous"]["views"] == 10 and week["change"]["views"] == 50.0
    assert week["change"]["apply_clicks"] is None  # nothing before it: no invented percentage
    day = web.get(f"{J}/organisations/{org.pk}/dashboard?period=24h").json()["traffic"]
    assert day["previous"]["views"] == 0 and day["change"]["views"] is None


def test_unknown_periods_and_filters_are_refused(acme: tuple[Any, Any], employer: User) -> None:
    org, _ = acme
    web = signed_in(employer)
    assert web.get(f"{J}/organisations/{org.pk}/dashboard?period=forever").status_code == 400
    assert web.get(f"{J}/organisations/{org.pk}/listings?status=everything").status_code == 400
    assert web.get(f"{J}/organisations/{org.pk}/listings?period=forever").status_code == 400


# --- the listings table ------------------------------------------------------------------------------
def test_listings_filter_search_and_page(acme: tuple[Any, dict[str, Opportunity]], employer: User) -> None:
    org, mine = acme
    web = signed_in(employer)
    base = f"{J}/organisations/{org.pk}/listings"

    def ids(query: str) -> list[str]:
        return [r["id"] for r in web.get(f"{base}?{query}").json()["data"]]

    assert len(ids("")) == 4
    assert ids("status=active") == [str(mine["live"].pk)]
    assert ids("status=draft") == [str(mine["draft"].pk)]
    assert ids("status=review") == [str(mine["waiting"].pk)]
    assert ids("status=expired") == [str(mine["gone"].pk)]
    assert ids("status=withdrawn") == []
    assert ids("q=storekeeper") == [str(mine["draft"].pk)]
    assert ids("q=nothing-like-this") == []
    first = web.get(f"{base}?page_size=3&page=1").json()
    second = web.get(f"{base}?page_size=3&page=2").json()
    assert (len(first["data"]), len(second["data"]), first["page"]["total"], first["page"]["pages"]) == (
        3,
        1,
        4,
        2,
    )
    assert not {r["id"] for r in first["data"]} & {r["id"] for r in second["data"]}
    row = first["data"][0]
    assert {"employment_type", "location", "published_at", "can_duplicate", "views", "apply_clicks"} <= set(
        row
    )


def test_row_actions_follow_the_state_of_each_listing(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    org, mine = acme
    rows = {
        r["id"]: r for r in signed_in(employer).get(f"{J}/organisations/{org.pk}/listings").json()["data"]
    }
    assert rows[str(mine["draft"].pk)]["next_actions"] == ["edit", "submit", "discard"]
    assert rows[str(mine["waiting"].pk)]["next_actions"] == []  # frozen while editors review it
    assert rows[str(mine["live"].pk)]["next_actions"] == ["amend", "close"]
    assert all(r["can_duplicate"] for r in rows.values())


# --- duplicate -------------------------------------------------------------------------------------
def test_duplicate_makes_a_separate_draft_in_the_same_organisation(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    org, mine = acme
    web = signed_in(employer)
    done = send(web, "post", f"{J}/listings/{mine['live'].pk}/duplicate")
    assert done.status_code == 201, done.json()
    copy = done.json()
    assert copy["id"] != str(mine["live"].pk) and copy["status"] == "draft"
    assert copy["organisation"]["id"] == str(org.pk) and copy["authored_by_you"] is True
    assert copy["content"]["title"] == mine["live"].live_version.title  # type: ignore[union-attr]
    assert copy["content"]["deadline_at"] is None and copy["content"]["reference_number"] is None
    assert copy["next_actions"] == ["edit", "submit", "discard"]
    assert EmployerListing.objects.get(opportunity_id=copy["id"]).organisation_id == org.pk
    assert (
        Opportunity.objects.get(pk=mine["live"].pk).status == ListingStatus.PUBLISHED
    )  # the source is untouched


def test_duplicate_is_refused_once_the_organisation_is_no_longer_verified(
    acme: tuple[Any, dict[str, Opportunity]], employer: User, people: dict[str, User]
) -> None:
    from employers import services

    org, mine = acme
    services.revoke_verification(people["admin"], org.pk, reason="Registration could not be confirmed.")
    refused = send(signed_in(employer), "post", f"{J}/listings/{mine['live'].pk}/duplicate")
    assert refused.status_code == 403


# --- pictures --------------------------------------------------------------------------------------
def jpeg(shade: int = 90, size: tuple[int, int] = (1200, 675)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, (200, 80, shade)).save(out, format="JPEG")
    return out.getvalue()


def upload(client: APIClient, data: bytes, name: str = "photo.jpg", kind: str = "image/jpeg") -> Any:
    file = SimpleUploadedFile(name, data, content_type=kind)
    return client.post(f"{J}/images", {"file": file}, format="multipart", HTTP_X_CSRFTOKEN=csrf(client))


def test_a_verified_member_uploads_and_attaches_a_featured_image(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    _, mine = acme
    web = signed_in(employer)
    first = upload(web, jpeg())
    assert first.status_code == 201, first.content
    picture = first.json()
    assert picture["name"].startswith("listings/") and picture["reused"] is False
    assert set(picture) == {"name", "url", "width", "height", "bytes", "reused"}  # nothing about uploaders
    draft_row = mine["draft"]
    saved = send(
        web,
        "patch",
        f"{J}/listings/{draft_row.pk}",
        {
            "row_version": draft_row.row_version,
            "content": {"featured_image": picture["name"], "featured_image_alt": "The depot yard"},
        },
    )
    assert saved.status_code == 200, saved.json()
    content = saved.json()["content"]
    assert content["featured_image"] == picture["name"] and content["featured_image_alt"] == "The depot yard"
    # replace and remove are just other saves
    other = upload(web, jpeg(shade=140)).json()["name"]
    replaced = send(
        web,
        "patch",
        f"{J}/listings/{draft_row.pk}",
        {"row_version": saved.json()["row_version"], "content": {"featured_image": other}},
    )
    assert replaced.json()["content"]["featured_image"] == other
    removed = send(
        web,
        "patch",
        f"{J}/listings/{draft_row.pk}",
        {"row_version": replaced.json()["row_version"], "content": {"featured_image": None}},
    )
    assert removed.json()["content"]["featured_image"] is None


def test_uploading_the_same_picture_again_reuses_it_and_reveals_nothing(
    acme: tuple[Any, dict[str, Opportunity]],
    employer: User,
    rival: User,
    people: dict[str, User],
    world: World,
) -> None:
    other_org(rival, people, world)
    mine = upload(signed_in(employer), jpeg(shade=33))
    theirs = upload(signed_in(rival), jpeg(shade=33))
    assert mine.status_code == 201 and theirs.status_code == 200 and theirs.json()["reused"] is True
    assert theirs.json()["name"] == mine.json()["name"]
    assert "Employer" not in str(theirs.json()) and "uploaded_by" not in theirs.json()


def test_only_members_of_a_verified_organisation_may_upload(
    employer: User, people: dict[str, User], make_user: Callable[..., User], acme: tuple[Any, Any]
) -> None:
    assert upload(signed_in(people["seeker"]), jpeg()).status_code == 403
    org, _ = acme
    from employers import services

    services.revoke_verification(people["admin"], org.pk, reason="Registration could not be confirmed.")
    assert upload(signed_in(employer), jpeg()).status_code == 403


def test_the_upload_validates_the_real_content(acme: tuple[Any, Any], employer: User) -> None:
    web = signed_in(employer)
    refused = upload(web, b"<html>not a picture</html>", "evil.jpg")
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "not_an_image"
    assert upload(web, b"GIF89a" + b"0" * 40, "x.gif", "image/gif").status_code == 400
    too_big = upload(web, jpeg() + b"0" * (5 * 1024 * 1024 + 10))
    assert too_big.status_code == 413
    empty = web.post(f"{J}/images", {}, format="multipart", HTTP_X_CSRFTOKEN=csrf(web))
    assert empty.status_code == 400


def test_an_unknown_picture_name_cannot_be_attached(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    _, mine = acme
    web = signed_in(employer)
    for name in ("listings/" + "0" * 32 + ".jpg", "../../etc/passwd", "https://evil.example/x.jpg"):
        bad = send(
            web,
            "patch",
            f"{J}/listings/{mine['draft'].pk}",
            {"row_version": mine["draft"].row_version, "content": {"featured_image": name}},
        )
        assert bad.status_code == 400 and "featured_image" in bad.json()["error"]["fields"], name


def test_the_employer_still_cannot_set_an_address_or_search_text(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    _, mine = acme
    web = signed_in(employer)
    for key in ("slug", "seo_title", "seo_description", "og_title"):
        refused = send(
            web,
            "patch",
            f"{J}/listings/{mine['draft'].pk}",
            {"row_version": mine["draft"].row_version, "content": {key: "something-fixed-by-staff"}},
        )
        assert refused.status_code == 403, key


# --- application methods and the organisation are fixed server-side -------------------------------
@pytest.mark.parametrize(
    ("method", "fields"),
    [
        ("external_url", {"application_url": "https://example.org/jobs/apply"}),
        (
            "email",
            {"application_email": "jobs@example.org", "application_email_subject": "Application: Driver"},
        ),
        (
            "both",
            {"application_url": "https://example.org/jobs/apply", "application_email": "jobs@example.org"},
        ),
        ("instructions", {"application_instructions": "Hand-deliver a CV to the Harare depot office."}),
    ],
)
def test_every_application_method_is_stored_as_chosen(
    acme: tuple[Any, dict[str, Opportunity]], employer: User, method: str, fields: dict[str, str]
) -> None:
    _, mine = acme
    blank = {
        "application_url": None,
        "application_email": None,
        "application_email_subject": None,
        "application_instructions": None,
    }
    saved = send(
        signed_in(employer),
        "patch",
        f"{J}/listings/{mine['draft'].pk}",
        {
            "row_version": mine["draft"].row_version,
            "content": {**blank, "application_method": method, **fields},
        },
    )
    assert saved.status_code == 200, saved.json()
    content = saved.json()["content"]
    assert content["application_method"] == method
    for key, value in fields.items():
        assert content[key] == value


def test_a_body_naming_another_organisation_never_moves_the_listing(
    acme: tuple[Any, dict[str, Opportunity]],
    employer: User,
    rival: User,
    people: dict[str, User],
    world: World,
) -> None:
    org, mine = acme
    theirs, _ = other_org(rival, people, world)
    web = signed_in(employer)
    category, data = employer_content(
        world, title="Warehouse Clerk Gweru", application_url="https://example.org/a/1"
    )
    made = send(
        web,
        "post",
        f"{J}/organisations/{org.pk}/listings",
        {"category": category, "content": {**data, "organisation_id": str(theirs.pk)}},
    )
    assert made.status_code == 201 and made.json()["organisation"]["id"] == str(org.pk)
    moved = send(
        web,
        "patch",
        f"{J}/listings/{mine['draft'].pk}",
        {"row_version": mine["draft"].row_version, "content": {"organisation_id": str(theirs.pk)}},
    )
    assert moved.status_code == 200 and moved.json()["organisation"]["id"] == str(org.pk)
    # and one may not post into an organisation one does not act for
    into = send(
        web, "post", f"{J}/organisations/{theirs.pk}/listings", {"category": category, "content": data}
    )
    assert into.status_code == 404


# --- separation of duties is unchanged -----------------------------------------------------------------
def test_an_employer_cannot_review_verify_or_publish_their_own_listing(
    acme: tuple[Any, dict[str, Opportunity]], employer: User
) -> None:
    _, mine = acme
    waiting = mine["waiting"]
    with pytest.raises(PermissionDeniedError):
        workflow.approve(employer, waiting.pk, expected_row_version=waiting.row_version, checklist=CHECKLIST)
    with pytest.raises(PermissionDeniedError):
        workflow.publish_direct(
            employer, waiting.pk, expected_row_version=waiting.row_version, checklist=CHECKLIST
        )
    with pytest.raises(PermissionDeniedError):
        workflow.set_verification(employer, waiting.pk, verified=True)
    web = signed_in(employer)
    for url in ("/api/v1/staff/session", "/api/v1/staff/opportunities"):
        assert web.get(url).status_code == 403  # no staff authority comes with an employer membership
    waiting.refresh_from_db()
    assert waiting.status == ListingStatus.IN_REVIEW and not waiting.is_verified


def test_the_stored_counters_hold_no_visitor_columns() -> None:
    names = {f.name for model in (ListingDailyStat, ListingHourlyStat) for f in model._meta.get_fields()}
    assert names <= {"id", "opportunity", "day", "hour", "views", "apply_clicks"}
