"""Place matching for the read-only place report (D-75, O-2): the same cases as the editor's `matchPlaces`."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from catalog.place_match import Place, match_places


@pytest.mark.docs
def test_match_places_agrees_with_the_shared_cases(repo_root: Path) -> None:
    doc = json.loads((repo_root / "docs/engineering/place-match-cases.json").read_text())
    places = [Place(**p) for p in doc["places"]]
    for case in doc["cases"]:
        assert match_places(case["text"], places) == case["expected"], case["text"]


@pytest.mark.docs
def test_the_shared_places_are_the_seeded_ones(repo_root: Path) -> None:
    from catalog import seed

    doc = json.loads((repo_root / "docs/engineering/place-match-cases.json").read_text())
    slugs = {p["slug"] for p in doc["places"]}
    assert slugs == {"zimbabwe", "remote"} | {s for s, _ in seed.PROVINCES} | {s for s, _, _ in seed.CITIES}
