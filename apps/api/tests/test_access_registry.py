"""PERM-01/02/03 — the role registry (D-23) and its agreement with ROLE_PERMISSION_MATRIX.md."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from access.registry import DEFAULT_REGISTRY, Permission, Role


def test_perm_01_initial_roles_are_exactly_three_and_no_publisher() -> None:
    assert {r.value for r in Role} == {"contributor", "editor", "administrator"}
    assert DEFAULT_REGISTRY.roles == {"contributor", "editor", "administrator"}
    assert not any("publisher" in str(code) for code in Permission)
    assert not any("publisher" in role for role in DEFAULT_REGISTRY.roles)


def test_perm_02_future_role_needs_only_a_registry_entry() -> None:
    from access import policy

    registry = DEFAULT_REGISTRY.with_role("moderator", {Permission.OPP_PUBLISH})
    assert registry.has({"moderator"}, Permission.OPP_PUBLISH)
    assert not DEFAULT_REGISTRY.has({"moderator"}, Permission.OPP_PUBLISH)  # original is immutable
    # The unchanged guard honours the new role.
    facts = policy.RevisionFacts(
        state="approved",
        chain_author_ids=frozenset({"author"}),
        content_hash=b"h",
        approved_by="other",
        approved_hash=b"h",
    )
    assert policy.can_publish(policy.Actor("m", frozenset({"moderator"})), facts, registry)
    assert not policy.can_publish(policy.Actor("m", frozenset({"moderator"})), facts)


def test_anonymous_and_account_baselines() -> None:
    anon = DEFAULT_REGISTRY.permissions_for([], authenticated=False)
    assert anon == {Permission.OPP_READ_PUBLIC}
    seeker = DEFAULT_REGISTRY.permissions_for([])
    assert Permission.ME_SAVED in seeker and Permission.OPP_PUBLISH not in seeker


def test_unknown_role_grants_nothing() -> None:
    assert DEFAULT_REGISTRY.permissions_for(["superuser"]) == DEFAULT_REGISTRY.permissions_for([])


def _codes(fragment: str) -> set[str]:
    """Codes appear as comma-separated lists inside backticks; wildcards such as `me.*` are ignored."""
    found: set[str] = set()
    for group in re.findall(r"`([^`]+)`", fragment):
        found |= {c.strip() for c in group.split(",") if re.fullmatch(r"[a-z_.]+", c.strip())}
    return found


def _parse_matrix(text: str) -> dict[str, set[str]]:
    line = next(ln for ln in text.splitlines() if ln.startswith("Role → code grants:"))
    segments = re.split(r"\*\*(Contributor|Editor|Administrator)\*\*\s+—", line)
    grants: dict[str, set[str]] = {}
    for name, body in zip(segments[1::2], segments[2::2], strict=True):
        codes = _codes(body.split("Seekers hold")[0])  # trailing sentence describes baselines
        if "all Editor codes" in body:
            codes |= grants["editor"]
        grants[name.lower()] = codes
    return grants


@pytest.mark.docs
def test_perm_03_registry_matches_the_permission_matrix_document(repo_root: Path) -> None:
    text = (repo_root / "docs/engineering/ROLE_PERMISSION_MATRIX.md").read_text()
    documented = _parse_matrix(text)
    assert set(documented) == {"contributor", "editor", "administrator"}
    for role, codes in documented.items():
        assert set(DEFAULT_REGISTRY.grants[role]) == codes, role
    # every documented permission code exists in the enum and vice versa
    match = re.search(r"Permission codes: (.*)", text)
    assert match is not None
    listed = _codes(match.group(1))
    assert listed == {p.value for p in Permission}
