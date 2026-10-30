"""Listing freshness at the deadline boundary (hardening audit, Part 2.2).

A listing is closed from the instant its deadline is reached (`deadline_at <= now`), whether or not the scheduled
expiry job has run yet. Every place that decides what a person may be told is open must agree on that instant:
search, the sitemap, the derived deadline state, the expiry job and the saved list. The saved list used to read
only the stored status, so for up to one worker cycle (and indefinitely if the worker stopped) it offered "How to
apply" on a vacancy that had already closed everywhere else.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from opportunities import public, saved, workflow
from opportunities.models import ListingStatus, Opportunity
from tests.factories import World, published, varied

from .test_saved import live, put, signed_in

pytestmark = pytest.mark.django_db

SECOND = timedelta(seconds=1)


def closing_in_a_day(world: World, people: dict[str, User], tag: str) -> tuple[Opportunity, datetime]:
    deadline = (timezone.now() + timedelta(days=1)).replace(microsecond=0)
    listing = published(
        world,
        people["author"],
        people["editor"],
        example="jobs-1",
        **varied(world, "jobs-1", tag),
        deadline_at=deadline.isoformat(),
        deadline_timezone="Africa/Harare",
        deadline_is_date_only=False,
    )
    assert listing.live_version.deadline_at == deadline  # type: ignore[union-attr]
    return listing, deadline


def slugs_in_search(now: datetime) -> set[str]:
    return {row.opportunity.slug or "" for row in public.search(public.Query(), now).items}


def test_every_read_path_agrees_on_the_instant_a_listing_closes(
    world: World, people: dict[str, User]
) -> None:
    listing, deadline = closing_in_a_day(world, people, "boundary")

    before = deadline - SECOND
    assert listing.slug in slugs_in_search(before)
    assert listing.slug in {slug for slug, _ in public.sitemap_entries(before)}
    assert public.derive_deadline_state(deadline, before) == "closing_soon"

    # At the deadline itself the listing is closed everywhere, with the expiry job not having run.
    assert listing.slug not in slugs_in_search(deadline)
    assert listing.slug not in {slug for slug, _ in public.sitemap_entries(deadline)}
    assert public.derive_deadline_state(deadline, deadline) == "expired"
    listing.refresh_from_db()
    assert listing.status == ListingStatus.PUBLISHED  # still stored as published: only the job changes that


def test_the_expiry_job_expires_a_listing_at_exactly_its_deadline_and_not_a_second_earlier(
    world: World, people: dict[str, User]
) -> None:
    listing, deadline = closing_in_a_day(world, people, "job-boundary")

    assert workflow.expire_due(deadline - SECOND) == 0
    listing.refresh_from_db()
    assert listing.status == ListingStatus.PUBLISHED

    assert workflow.expire_due(deadline) == 1
    listing.refresh_from_db()
    assert listing.status == ListingStatus.EXPIRED
    assert workflow.expire_due(deadline + SECOND) == 0  # a repeat does nothing


def test_a_saved_listing_past_its_deadline_is_closed_before_the_expiry_job_runs(
    world: World,
    people: dict[str, User],
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    listing, deadline = closing_in_a_day(world, people, "saved-open")
    client, _ = signed_in(make_user)
    assert put(client, listing).status_code == 201  # type: ignore[attr-defined]
    assert client.get("/api/v1/me/saved").json()["data"][0]["availability"] == "open"

    monkeypatch.setattr(timezone, "now", lambda: deadline + SECOND)
    row = client.get("/api/v1/me/saved").json()["data"][0]
    assert row["availability"] == "expired"  # it was "open" here: the person was offered "How to apply"
    assert row["opportunity"]["deadline"]["state"] == "expired"  # the two fields now agree
    states = client.get(f"/api/v1/me/saved?ids={listing.pk}").json()["data"]
    assert [s["availability"] for s in states] == ["expired"]
    listing.refresh_from_db()
    assert listing.status == ListingStatus.PUBLISHED  # the job has still not run


def test_a_listing_past_its_deadline_cannot_be_newly_saved_before_the_expiry_job_runs(
    world: World,
    people: dict[str, User],
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    listing, deadline = closing_in_a_day(world, people, "save-closed")
    client, user = signed_in(make_user)
    monkeypatch.setattr(timezone, "now", lambda: deadline + SECOND)

    response = put(client, listing)
    assert response.status_code == 409  # type: ignore[attr-defined]
    assert response.json()["error"]["code"] == "listing_not_saveable"  # type: ignore[attr-defined]
    assert not saved.rows_for(user).exists()


def test_a_listing_with_no_deadline_is_never_closed_by_the_clock(
    world: World, people: dict[str, User]
) -> None:
    listing = live(world, people, "jobs-2", "no-deadline")
    assert listing.live_version.deadline_at is None  # type: ignore[union-attr]
    assert saved.availability_of(listing, timezone.now() + timedelta(days=3000)) == "open"
