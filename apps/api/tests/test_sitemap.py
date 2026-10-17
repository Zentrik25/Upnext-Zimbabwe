"""The sitemap feed: only open, public listings (P4-03)."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from opportunities import workflow
from tests.factories import World, new_draft, published, varied

pytestmark = pytest.mark.django_db
URL = "/api/v1/sitemap"


def live(world: World, people: dict[str, User], example: str, tag: str):  # type: ignore[no-untyped-def]
    return published(
        world, people["author"], people["editor"], example=example, **varied(world, example, tag)
    )


def test_sitemap_lists_open_published_listings_in_slug_order(world: World, people: dict[str, User]) -> None:
    a, b = live(world, people, "jobs-1", "a"), live(world, people, "grants-1", "b")
    new_draft(world, people["author"], "internships-1", **varied(world, "internships-1", "draft"))
    body = APIClient().get(URL).json()["data"]
    assert [e["slug"] for e in body] == sorted([a.slug, b.slug])
    assert all(e["updated_at"].endswith("Z") for e in body)


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
    assert response.status_code == 200 and response.json() == {"data": []}
    assert "no-store" in response["Cache-Control"] or "no-cache" in response["Cache-Control"]
