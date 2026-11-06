"""Shared builders for the employer-portal tests: a verified organisation with one member."""

from __future__ import annotations

from typing import Any

from accounts.models import User
from catalog.models import Organisation
from employers import services
from employers.models import MemberRole
from tests.factories import World

CLAIM = {
    "organisation_name": "Acme Mining Zimbabwe",
    "website_url": "https://acme.example.org",
    "role_title": "HR manager",
    "evidence_note": "Our official address is hr@acme.example.org and our registration is on file.",
}


def verified_member(
    editor: User, member: User, *, name: str = "Acme Mining Zimbabwe", role: str = MemberRole.OWNER
) -> Organisation:
    """Claim, then have an editor verify: afterwards `member` acts for the returned organisation."""
    claim = services.submit_claim(member, {**CLAIM, "organisation_name": name})
    services.decide_claim(
        editor,
        claim.pk,
        approve=True,
        method="document_review",
        evidence_note="Certificate seen and filed.",
        role=role,
    )
    claim.refresh_from_db()
    assert claim.organisation is not None
    return claim.organisation


def employer_content(world: World, example: str = "jobs-1", **over: Any) -> tuple[str, dict[str, Any]]:
    """Draft content an employer could send: no provenance and no organisation (the server fixes both)."""
    category, data = world.content(example, **over)
    for key in ("sources", "organisation_id"):
        data.pop(key, None)
    return category, data
