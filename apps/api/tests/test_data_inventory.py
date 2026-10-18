"""The personal-data inventory (docs/legal/DATA_INVENTORY.md) must name every column that looks personal."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.db import connection

LOOKS_PERSONAL = re.compile(
    r"(email|display_name|address|^ip|_ip|agent|password|phone|contact|birth|session_key|to_address)", re.I
)
SCOPE_PREFIXES = ("accounts_", "notifications_", "audit_", "opportunities_savedopportunity")
# Columns that match the pattern but are not personal data of a person, with the reason.
NOT_PERSONAL = {
    "notifications_emailsuppression.address_hash": "a keyed one-way hash, listed in the inventory anyway",
    "notifications_emailoutbox.idempotency_key": "random key",
    "accounts_user.email_verified_at": "a timestamp",
}


def inventory_text(repo_root: Path) -> str:
    return (repo_root / "docs" / "legal" / "DATA_INVENTORY.md").read_text()


def personal_columns() -> set[str]:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
        )
        rows = cur.fetchall()
    found = set()
    for table, column in rows:
        if table.startswith(SCOPE_PREFIXES) and LOOKS_PERSONAL.search(column):
            found.add(f"{table}.{column}")
    return found


def test_every_personal_looking_column_is_in_the_inventory(db: None, repo_root: Path) -> None:
    text = inventory_text(repo_root)
    missing = sorted(
        c
        for c in personal_columns()
        if c not in NOT_PERSONAL and f"`{c}`" not in text and f"`{c.split('.')[0]}.*`" not in text
    )
    assert missing == [], (
        f"add these columns to docs/legal/DATA_INVENTORY.md (or explain them in NOT_PERSONAL): {missing}"
    )


def test_the_inventory_names_no_column_that_does_not_exist(db: None, repo_root: Path) -> None:
    with connection.cursor() as cur:
        cur.execute(
            "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
        )
        real = {f"{t}.{c}" for t, c in cur.fetchall()}
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        tables = {r[0] for r in cur.fetchall()}
    named = set(re.findall(r"`([a-z_]+\.[a-z_]+)`", inventory_text(repo_root)))
    unknown = sorted(
        n for n in named if n not in real and n.split(".")[0] not in tables and not n.endswith(".*")
    )
    assert unknown == [], f"the inventory names columns that do not exist: {unknown}"


def test_the_inventory_says_it_is_a_draft_and_not_legal_advice(repo_root: Path) -> None:
    text = inventory_text(repo_root)
    assert "DRAFT" in text and "not legal advice" in text


@pytest.mark.parametrize(
    "claim", ["legally approved", "compliant with", "GDPR compliant", "approved by counsel"]
)
def test_no_page_or_document_claims_legal_approval(repo_root: Path, claim: str) -> None:
    for path in [
        repo_root / "docs" / "legal",
        repo_root / "apps" / "web" / "src" / "app" / "privacy",
        repo_root / "apps" / "web" / "src" / "app" / "terms",
    ]:
        files = [path] if path.is_file() else list(path.rglob("*"))
        for f in files:
            if f.is_file() and f.suffix in {".md", ".tsx"}:
                text = f.read_text()
                for line in text.splitlines():
                    if claim.lower() in line.lower():
                        assert any(w in line.lower() for w in ("no ", "not ", "never", "nothing")), (
                            f"{f}: {line.strip()}"
                        )
