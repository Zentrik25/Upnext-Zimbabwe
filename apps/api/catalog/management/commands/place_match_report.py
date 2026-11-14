"""Read-only report: how each open listing's written location would map to structured places (D-75, O-2).

Nothing is written. Places reach a listing only when an editor saves an amendment (the editor matches
the written location automatically) and a second person reviews it; this report shows, before and after
seeding, which listings will gain a place that way and which need an editor's choice (a town that is not
in the catalogue, or only "Zimbabwe"). `--assume-seed` matches against the starter places of
`catalog/seed.py` instead of the database, so it can run on production before the seed is approved.
"""

from __future__ import annotations

import json
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from catalog import seed
from catalog.models import Location
from catalog.place_match import Place, match_places
from opportunities import public


def seed_places() -> list[Place]:
    return (
        [Place("zimbabwe", "Zimbabwe", "country")]
        + [Place(slug, name, "province") for slug, name in seed.PROVINCES]
        + [Place(slug, name, "city") for slug, name, _ in seed.CITIES]
        + [Place("remote", "Remote", "remote")]
    )


def report(*, assume_seed: bool = False) -> list[dict[str, Any]]:
    places = (
        seed_places()
        if assume_seed
        else [Place(p.slug, p.name, p.kind) for p in Location.objects.filter(active=True)]
    )
    rows = []
    # The same "open for browsing" rule as the lists and the sitemap: published and deadline not passed.
    for version in public.sitemap_open_versions(timezone.now()).order_by("opportunity__slug"):
        current = sorted(r.location.slug for r in version.locations.select_related("location"))
        rows.append(
            {
                "slug": version.opportunity.slug,
                "location_text": version.location_text,
                "current_places": current,
                "would_match": match_places(version.location_text, places),
            }
        )
    return rows


class Command(BaseCommand):
    help = "Show how open listings' written locations would map to places. Writes nothing."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--assume-seed", action="store_true", help="Match against the starter places")
        parser.add_argument("--json", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        rows = report(assume_seed=options["assume_seed"])
        if options["json"]:
            self.stdout.write(json.dumps(rows, indent=2))
            return
        for r in rows:
            match = ", ".join(r["would_match"]) or "NO MATCH: an editor chooses the place"
            self.stdout.write(f"{r['slug']}: {r['location_text']!r} -> {match}")
        matched = sum(1 for r in rows if r["would_match"])
        self.stdout.write(f"{matched} of {len(rows)} open listings would gain a place; nothing was written.")
