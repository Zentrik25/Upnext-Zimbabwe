"""The category specification pack (docs/engineering/CATEGORY_SPECIFICATIONS.md, OQ-06) describes what is loaded.

OQ-06 is not decided, so the loaded v1 schemas must stay the unchanged drafts, and the pack must list every
field of every loaded schema. A change to either without the other fails here."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

CATEGORIES = ("jobs", "internships", "graduate-programmes", "scholarships", "tenders", "grants")
IGNORED = {"$id", "title", "description"}


def load(path: Path) -> dict[str, object]:
    return {k: v for k, v in json.loads(path.read_text()).items() if k not in IGNORED}


@pytest.mark.parametrize("category", CATEGORIES)
def test_loaded_v1_schema_is_the_unchanged_draft(repo_root: Path, category: str) -> None:
    loaded = load(repo_root / "apps/api/catalog/schemas" / category / "v1.json")
    draft = load(repo_root / "docs/engineering/schemas-draft" / f"{category}.v1.draft.schema.json")
    assert loaded == draft
    assert loaded["x-status"] == "DRAFT" and loaded["x-open"] == "OQ-06"
    assert loaded["additionalProperties"] is False


@pytest.mark.parametrize("category", CATEGORIES)
def test_specification_pack_lists_every_field_and_required_flag(repo_root: Path, category: str) -> None:
    pack = (repo_root / "docs/engineering/CATEGORY_SPECIFICATIONS.md").read_text()
    schema = json.loads((repo_root / "apps/api/catalog/schemas" / category / "v1.json").read_text())
    section = pack.split(f"(`{category}`) — v1 detail fields as loaded", 1)[1].split("\n#", 1)[0]
    for name in schema["properties"]:
        row = next((line for line in section.splitlines() if line.startswith(f"| `{name}` |")), None)
        assert row is not None, f"{category}.{name} is missing from CATEGORY_SPECIFICATIONS.md"
        assert row.rstrip().endswith("yes |" if name in schema.get("required", []) else "no |"), row


def test_pack_stays_a_draft_and_oq_06_stays_open(repo_root: Path) -> None:
    pack = (repo_root / "docs/engineering/CATEGORY_SPECIFICATIONS.md").read_text()
    register = (repo_root / "docs/governance/DECISION_REGISTER.md").read_text()
    assert "DRAFT" in pack.splitlines()[0] and "Nothing here is approved or implemented" in pack
    assert "owner approval of the field lists outstanding" in register
