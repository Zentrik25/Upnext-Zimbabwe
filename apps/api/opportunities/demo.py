"""Clearly fictional Zimbabwean demonstration listings (Phase 0 category examples), used by the
`seed_demo` command and by the automated tests. Organisations are named "Example …", web addresses use
the reserved `example.org` domain and nothing here is a real vacancy, tender, scholarship or grant.

Dates are shifted so the examples always have a future deadline when loaded.
"""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

DEMO_DIR = Path(__file__).resolve().parent / "demo"
REFERENCE_DAY = date(2026, 10, 12)  # the day the Phase 0 examples were written
ORGANISATIONS = {
    "0001": ("Example Power Services", "https://careers.example.org"),
    "0002": ("Example Health Alliance", "https://health.example.org"),
    "0003": ("Example Creative Studio", "https://studio.example.org"),
    "0004": ("Example Learning Trust", "https://trust.example.org"),
    "0005": ("Example Commercial Bank", "https://graduates.example.org"),
    "0006": ("Example Group Holdings", "https://aggregator.example.org"),
    "0007": ("Example Engineering Foundation", "https://foundation.example.org"),
    "0008": ("Example Girls' Education Fund", "https://fund.example.org"),
    "0009": ("Example City Procurement Unit", "https://city.example.org"),
    "000a": ("Example Water Authority", "https://water.example.org"),
    "000b": ("Example Enterprise Fund", "https://enterprise.example.org"),
    "000c": ("Example Research Council", "https://research.example.org"),
}
EXAMPLE_NAMES = sorted(p.stem for p in (DEMO_DIR / "examples").glob("*.json"))


def _shift(value: str, days: int) -> str:
    return (datetime.fromisoformat(value) + timedelta(days=days)).isoformat()


def load_example(name: str) -> dict[str, Any]:
    result: dict[str, Any] = json.loads((DEMO_DIR / "examples" / f"{name}.json").read_text(encoding="utf-8"))
    return result


def placeholder_ids() -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = json.loads(
        (DEMO_DIR / "placeholder-ids.json").read_text(encoding="utf-8")
    )
    return result


def build_content(
    name: str,
    *,
    organisation_ids: dict[str, str],
    location_ids: dict[str, str],
    sector_ids: dict[str, str],
    skill_ids: dict[str, str],
    today: date,
) -> tuple[str, dict[str, Any]]:
    """Return `(category_code, DraftContent)` with placeholders replaced by real ids and dates shifted.

    The maps are keyed by the placeholder suffix / slug used in the Phase 0 examples."""
    example = deepcopy(load_example(name))
    days = (today - REFERENCE_DAY).days
    category = example.pop("category")
    placeholders = placeholder_ids()
    example["organisation_id"] = organisation_ids[example["organisation_id"][-4:]]
    reverse_loc = {v: k for k, v in placeholders["locations"].items()}
    reverse_sec = {v: k for k, v in placeholders["sectors"].items()}
    reverse_skill = {v: k for k, v in placeholders["skills"].items()}
    for row in example.get("locations", []):
        row["location_id"] = location_ids[reverse_loc[row["location_id"]]]
    example["sector_ids"] = [sector_ids[reverse_sec[i]] for i in example.get("sector_ids", [])]
    for row in example.get("skills", []):
        row["skill_id"] = skill_ids[reverse_skill[row["skill_id"]]]
    for source in example.get("sources", []):
        source["observed_on"] = today.isoformat()
    if example.get("deadline_at"):
        example["deadline_at"] = _shift(example["deadline_at"], days)
    detail = example.get("detail", {})
    for key, value in list(detail.items()):
        if key.endswith("_at") and isinstance(value, str):
            detail[key] = _shift(value, days)
        if key == "expected_start" and isinstance(value, str):
            detail[key] = (date.fromisoformat(value) + timedelta(days=days)).isoformat()
    return category, example
