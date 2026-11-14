"""Which structured places a written location names: the server-side mirror of `matchPlaces` in
`apps/web/src/lib/job-editor.ts` (the editor applies it when a listing is saved). Used only by the read-only
`place_match_report` command, to show before any deployment how existing listings would map once places exist
(D-75, O-2). It never writes: places reach a listing only through an amendment and its review.

Both sides are tested on the same cases (`tests/test_place_match.py`,
`apps/web/tests/unit/job-editor.test.ts`).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

NATIONWIDE = re.compile(r"(?<![a-z])(nationwide|countrywide|zimbabwe-wide|all of zimbabwe)(?![a-z])")
REMOTE = re.compile(r"(?<![a-z])(remote|work from home|home-based)(?![a-z])")


@dataclass(frozen=True)
class Place:
    slug: str
    name: str
    kind: str


def match_places(text: str | None, places: Iterable[Place]) -> list[str]:
    """Slugs of the places the text names, in the order written (the first is the primary), at most five.
    Whole words only; a country is matched only by "nationwide"-style phrases, never by "Zimbabwe"."""
    lower = (text or "").lower()
    if not lower.strip():
        return []
    places = list(places)
    hits: list[tuple[int, str]] = []
    for place in places:
        if place.kind in ("country", "remote"):
            continue
        found = re.search(rf"(?<![a-z]){re.escape(place.name.lower())}(?![a-z])", lower)
        if found:
            hits.append((found.start(), place.slug))
    country = next((p for p in places if p.kind == "country"), None)
    remote = next((p for p in places if p.kind == "remote"), None)
    for pattern, special in ((NATIONWIDE, country), (REMOTE, remote)):
        found = pattern.search(lower) if special else None
        if found and special:
            hits.append((found.start(), special.slug))
    out: list[str] = []
    for _, slug in sorted(hits, key=lambda h: h[0]):
        if slug not in out:
            out.append(slug)
    return out[:5]
