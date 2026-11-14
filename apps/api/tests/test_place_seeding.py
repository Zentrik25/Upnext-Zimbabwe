"""Seeding places in production is approved in principle (D-75, O-2) on condition that it is idempotent,
non-destructive and maps existing listings correctly. These tests are that evidence; the production run still needs a
separate deployment approval."""

from __future__ import annotations

import io
import json

import pytest
from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from catalog.models import Location, Sector, Skill
from catalog.seed import seed_taxonomies
from tests.factories import World, published, varied

pytestmark = pytest.mark.django_db


def _counts() -> tuple[int, int, int]:
    return Location.objects.count(), Sector.objects.count(), Skill.objects.count()


def _writes(ctx: CaptureQueriesContext) -> list[str]:
    return [
        q["sql"]
        for q in ctx.captured_queries
        if q["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
    ]


def test_seeding_twice_creates_nothing_the_second_time() -> None:
    Location.objects.all().delete()
    first = seed_taxonomies()
    assert first["locations"] == 21  # Zimbabwe, 10 provinces, 9 cities, Remote
    after_first = _counts()
    assert seed_taxonomies() == {"locations": 0, "sectors": 0, "skills": 0}
    assert _counts() == after_first


def test_seeding_never_edits_reactivates_or_deletes_existing_rows() -> None:
    seed_taxonomies()
    harare = Location.objects.get(slug="harare")
    harare.name = "Harare (edited by an Administrator)"
    harare.save()
    Location.objects.filter(slug="kadoma").update(active=False)
    custom = Location.objects.create(slug="kariba", name="Kariba", kind="town", parent=harare.parent)
    before = _counts()
    seed_taxonomies()
    assert Location.objects.get(slug="harare").name == "Harare (edited by an Administrator)"
    assert Location.objects.get(slug="kadoma").active is False
    assert Location.objects.filter(pk=custom.pk).exists()
    assert _counts() == before


def test_the_dry_run_writes_nothing_and_names_inactive_places() -> None:
    Location.objects.all().delete()
    Location.objects.create(slug="kadoma", name="Kadoma", kind="city", active=False)
    out = io.StringIO()
    call_command("seed_taxonomies", "--dry-run", stdout=out)
    text = out.getvalue()
    assert text.startswith("Would create: 20 locations")
    assert "Inactive places left unchanged" in text and "kadoma" in text
    assert list(Location.objects.values_list("slug", flat=True)) == ["kadoma"]


def test_seeding_touches_no_listing(world: World, people: dict[str, User]) -> None:
    published(
        world,
        people["author"],
        people["editor"],
        **varied(world, "jobs-1", "p", location_text="Estlea, Harare"),
    )
    with CaptureQueriesContext(connection) as ctx:
        seed_taxonomies()
    touched = [sql for sql in _writes(ctx) if "opportunit" in sql.lower()]
    assert touched == []


def test_the_place_report_maps_open_listings_and_writes_nothing(
    world: World, people: dict[str, User]
) -> None:
    texts = {
        "a": "Estlea, Harare",
        "b": "Kariba",
        "c": "Mbire, Mashonaland Central, Zimbabwe",
        "d": "Home-based",
    }
    for tag, text in texts.items():
        published(
            world,
            people["author"],
            people["editor"],
            **varied(world, "jobs-1", tag, location_text=text, locations=[]),
        )
    out = io.StringIO()
    with CaptureQueriesContext(connection) as ctx:
        call_command("place_match_report", "--assume-seed", "--json", stdout=out)
    assert _writes(ctx) == []
    rows = {r["location_text"]: r["would_match"] for r in json.loads(out.getvalue())}
    assert rows["Estlea, Harare"] == ["harare"]
    assert rows["Kariba"] == []  # not a starter place: an editor chooses
    assert rows["Mbire, Mashonaland Central, Zimbabwe"] == ["mashonaland-central"]
    assert rows["Home-based"] == ["remote"]
