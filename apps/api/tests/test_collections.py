"""Landing-page collections (D-68) and the per-list sitemap feed (SEO audit 2026-11)."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from opportunities import workflow
from opportunities.collections import COLLECTIONS, EMPLOYMENT_CATEGORIES
from tests.factories import World, published, varied

pytestmark = pytest.mark.django_db
LIST, SITEMAP = "/api/v1/opportunities", "/api/v1/sitemap"


def live(world: World, people: dict[str, User], example: str, tag: str, **extra: Any):  # type: ignore[no-untyped-def]
    return published(
        world, people["author"], people["editor"], example=example, **varied(world, example, tag, **extra)
    )


def at(world: World, *slugs: str) -> list[dict[str, Any]]:
    return [{"location_id": world.locations[s], "is_primary": i == 0} for i, s in enumerate(slugs)]


def slugs(collection: str) -> set[str]:
    response = APIClient().get(LIST, {"collection": collection, "limit": "50"})
    assert response.status_code == 200, response.json()
    return {row["slug"] for row in response.json()["data"]}


def test_the_collections_are_the_six_landing_pages_of_the_web_app() -> None:
    # Keep in step with apps/web/src/lib/landing-pages.ts (its test pins the same list).
    assert list(COLLECTIONS) == [
        "harare",
        "bulawayo",
        "graduate-trainee",
        "engineering",
        "finance-and-accounting",
        "ngo",
    ]
    assert EMPLOYMENT_CATEGORIES == ("jobs", "internships", "graduate-programmes")


def test_city_collections_hold_employment_listings_placed_in_the_city_or_its_province(
    world: World, people: dict[str, User]
) -> None:
    city = live(world, people, "jobs-1", "city", locations=at(world, "harare"))
    province = live(world, people, "internships-1", "prov", locations=at(world, "harare-province"))
    elsewhere = live(world, people, "jobs-1", "gweru", locations=at(world, "gweru"))
    tender = live(world, people, "tenders-1", "tender", locations=at(world, "harare"))
    assert slugs("harare") == {city.slug, province.slug}
    assert elsewhere.slug not in slugs("harare") and tender.slug not in slugs("harare")
    assert city.slug not in slugs("bulawayo")


def test_graduate_trainee_holds_programmes_and_entry_level_jobs_only(
    world: World, people: dict[str, User]
) -> None:
    programme = live(world, people, "graduate-programmes-1", "gp")
    entry = live(world, people, "jobs-1", "entry", experience_level="entry")
    senior = live(world, people, "jobs-1", "senior", experience_level="senior")
    internship = live(world, people, "internships-1", "intern")
    assert slugs("graduate-trainee") == {programme.slug, entry.slug}
    assert senior.slug not in slugs("graduate-trainee") and internship.slug not in slugs("graduate-trainee")


def test_sector_collections_use_the_sector_or_whole_words_of_the_title(
    world: World, people: dict[str, User]
) -> None:
    tagged = live(
        world, people, "jobs-1", "eng", title="Site Supervisor", sector_ids=[world.sectors["engineering"]]
    )
    # The jobs example is tagged Engineering; the title cases clear the sectors so only the title can match.
    titled = live(world, people, "internships-1", "acc", title="Accounts Clerk Attachment", sector_ids=[])
    word = live(world, people, "jobs-1", "word", title="Programme Accountant", sector_ids=[])
    not_a_word = live(world, people, "jobs-1", "nw", title="Reengineering Lead Assistant", sector_ids=[])
    ngo = live(world, people, "jobs-1", "ngo", title="Field Officer", sector_ids=[world.sectors["ngo"]])
    assert tagged.slug in slugs("engineering")
    assert not_a_word.slug not in slugs("engineering")  # whole words only
    assert {titled.slug, word.slug} <= slugs("finance-and-accounting")
    assert slugs("ngo") == {ngo.slug}


def test_a_collection_never_shows_a_closed_listing(world: World, people: dict[str, User]) -> None:
    gone = live(world, people, "jobs-1", "gone", locations=at(world, "harare"))
    gone.refresh_from_db()
    workflow.withdraw(
        people["editor"], gone.pk, expected_row_version=gone.row_version, reason="issuer withdrew"
    )
    assert gone.slug not in slugs("harare")


def test_an_unknown_collection_is_a_bad_request_and_listings_are_not_repeated(
    world: World, people: dict[str, User]
) -> None:
    response = APIClient().get(LIST, {"collection": "doorway"})
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_filter"
    # Two places and two sectors would join twice each; the listing still appears once and counts once.
    both = live(
        world,
        people,
        "jobs-1",
        "twice",
        locations=at(world, "harare", "harare-province"),
        sector_ids=[world.sectors["engineering"], world.sectors["finance"]],
    )
    body = APIClient().get(LIST, {"collection": "harare"}).json()
    assert [r["slug"] for r in body["data"]] == [both.slug] and body["page"]["total"] == 1


def test_a_collection_cursor_is_bound_to_its_collection(world: World, people: dict[str, User]) -> None:
    for tag in ("a", "b"):
        live(world, people, "jobs-1", tag, locations=at(world, "harare"))
    first = APIClient().get(LIST, {"collection": "harare", "limit": "1"}).json()
    cursor = first["page"]["next_cursor"]
    assert cursor
    assert APIClient().get(LIST, {"collection": "harare", "limit": "1", "cursor": cursor}).status_code == 200
    mixed = APIClient().get(LIST, {"collection": "bulawayo", "limit": "1", "cursor": cursor})
    assert mixed.status_code == 400 and mixed.json()["error"]["code"] == "invalid_cursor"


def test_the_sitemap_feed_reports_open_counts_and_the_newest_publication(
    world: World, people: dict[str, User]
) -> None:
    one = live(world, people, "jobs-1", "one", locations=at(world, "harare"))
    two = live(world, people, "jobs-1", "two", locations=at(world, "harare"))
    closed = live(world, people, "grants-1", "closed")
    closed.refresh_from_db()
    workflow.withdraw(
        people["editor"], closed.pk, expected_row_version=closed.row_version, reason="issuer withdrew"
    )
    body = APIClient().get(SITEMAP).json()
    jobs = next(c for c in body["categories"] if c["code"] == "jobs")
    two.refresh_from_db()
    assert jobs["count"] == 2
    assert jobs["updated_at"] == two.last_published_at.isoformat().replace("+00:00", "Z")
    assert all(c["code"] != "grants" for c in body["categories"])  # no open listing: not reported
    harare = next(c for c in body["collections"] if c["slug"] == "harare")
    assert harare["count"] == 2
    ngo = next(c for c in body["collections"] if c["slug"] == "ngo")
    assert ngo == {"slug": "ngo", "count": 0, "updated_at": None}
    assert {c["slug"] for c in body["collections"]} == set(COLLECTIONS)
    assert one.slug in {e["slug"] for e in body["data"]}
    assert body["employers"] == []  # no approved profile of a verified organisation exists here
