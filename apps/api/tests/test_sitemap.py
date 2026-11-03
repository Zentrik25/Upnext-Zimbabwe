"""The sitemap feed: only open, public listings (P4-03)."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from opportunities import workflow
from tests.factories import World, new_draft, published, varied

pytestmark = pytest.mark.django_db
URL = "/api/v1/sitemap"


def live(world: World, people: dict[str, User], example: str, tag: str, **extra: Any):  # type: ignore[no-untyped-def]
    return published(
        world, people["author"], people["editor"], example=example, **varied(world, example, tag, **extra)
    )


def test_sitemap_lists_open_published_listings_in_slug_order(world: World, people: dict[str, User]) -> None:
    a, b = live(world, people, "jobs-1", "a"), live(world, people, "grants-1", "b")
    new_draft(world, people["author"], "internships-1", **varied(world, "internships-1", "draft"))
    body = APIClient().get(URL).json()["data"]
    assert [e["slug"] for e in body] == sorted([a.slug, b.slug])
    assert all(e["updated_at"].endswith("Z") for e in body)
    assert {e["slug"]: e["category"] for e in body} == {a.slug: "jobs", b.slug: "grants"}


def test_closed_withdrawn_and_archived_listings_are_left_out(world: World, people: dict[str, User]) -> None:
    keep, gone, taken = (
        live(world, people, "jobs-1", "k"),
        live(world, people, "grants-1", "w"),
        live(world, people, "scholarships-1", "t"),
    )
    gone.refresh_from_db()
    workflow.withdraw(
        people["editor"], gone.pk, expected_row_version=gone.row_version, reason="issuer withdrew"
    )
    taken.refresh_from_db()
    workflow.takedown(
        people["editor"],
        taken.pk,
        expected_row_version=taken.row_version,
        reason_code="error",
        reason="Listed in error.",
    )
    assert [e["slug"] for e in APIClient().get(URL).json()["data"]] == [keep.slug]


def test_sitemap_needs_no_session_and_is_not_cached_by_the_api() -> None:
    response = APIClient().get(URL)
    assert response.status_code == 200
    assert response.json() == {
        "data": [],
        "organisations": [],
        "categories": [],
        "locations": [],
        "remote": {"count": 0, "updated_at": None},
    }
    assert "no-store" in response["Cache-Control"] or "no-cache" in response["Cache-Control"]


def test_the_sitemap_feed_is_cached_in_process_for_a_few_minutes(
    world: World, people: dict[str, User], settings: Any, client: Any
) -> None:
    from django.core.cache import caches
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    settings.UPNEXT_SITEMAP_API_CACHE_SECONDS = 300
    caches["local"].clear()
    published(world, people["author"], people["editor"])
    first = client.get("/api/v1/sitemap").json()
    assert len(first["data"]) == 1
    with CaptureQueriesContext(connection) as queries:
        again = client.get("/api/v1/sitemap").json()
    assert again == first
    assert not [q for q in queries if "opportunities_" in q["sql"]], (
        "the second answer must not touch listings"
    )
    caches["local"].clear()


def test_public_read_counters_are_kept_in_process_memory() -> None:
    from django.core.cache import caches

    from api.throttles import PublicReadThrottle

    assert PublicReadThrottle.cache is caches["local"]


def test_facets_count_open_listings_per_category_city_and_remote(
    world: World, people: dict[str, User]
) -> None:
    from tests.test_indexing import _loc

    live(world, people, "jobs-1", "h1")  # Harare
    live(world, people, "jobs-1", "h2", **_loc(world, "harare"))
    live(world, people, "internships-1", "b1")  # Bulawayo
    live(world, people, "jobs-2", "r1", work_mode="remote", **_loc(world, "remote", "zimbabwe"))
    closed = live(world, people, "jobs-1", "h3", **_loc(world, "harare"))
    closed.refresh_from_db()
    workflow.withdraw(
        people["editor"], closed.pk, expected_row_version=closed.row_version, reason="issuer withdrew"
    )
    body = APIClient().get(URL).json()
    by_place = {row["slug"]: row["count"] for row in body["locations"]}
    assert by_place["harare"] == 2 and by_place["bulawayo"] == 1  # the withdrawn listing is not counted
    assert "zimbabwe" not in by_place and "remote" not in by_place  # not city or province landing pages
    assert {row["code"]: row["count"] for row in body["categories"]} == {"jobs": 3, "internships": 1}
    assert body["remote"]["count"] == 1 and body["remote"]["updated_at"].endswith("Z")
    assert all(row["updated_at"] for row in body["locations"])


def test_organisations_are_listed_only_with_an_approved_profile_and_a_live_verification(
    world: World, people: dict[str, User]
) -> None:
    from django.utils import timezone

    from catalog.models import Organisation
    from employers.models import (
        EmployerProfile,
        OrganisationVerification,
        ProfileRevision,
        ProfileState,
    )

    org = Organisation.objects.get(pk=next(iter(world.organisations.values())))
    profile = EmployerProfile.objects.create(organisation=org, slug="acme-zw")
    assert APIClient().get(URL).json()["organisations"] == []  # no approved text yet
    revision = ProfileRevision.objects.create(
        profile=profile, version_no=1, state=ProfileState.APPROVED, tagline="We build things.",
        content_hash=b"x" * 32, submitted_by=people["editor"], decided_by=people["editor2"], decided_at=timezone.now(),
    )  # fmt: skip
    profile.live_revision = revision
    profile.save()
    assert (
        APIClient().get(URL).json()["organisations"] == []
    )  # approved text but the organisation is not verified
    fields = {f.name for f in OrganisationVerification._meta.get_fields()}
    verification = OrganisationVerification(organisation=org)
    for name in ("verified_by", "granted_by", "created_by"):
        if name in fields:
            setattr(verification, name, people["editor"])
    if "verified_at" in fields:
        verification.verified_at = timezone.now()
    verification.save()
    (entry,) = APIClient().get(URL).json()["organisations"]
    assert entry["slug"] == "acme-zw" and entry["updated_at"].endswith("Z")
