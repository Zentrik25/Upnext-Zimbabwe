"""Starter taxonomy contents (P2-02, OQ-21 still open). Geography is factual; sectors and skills are a
small starter set that Administrators extend in the staff interface. Ids are deterministic (uuid5)."""

from __future__ import annotations

import uuid

from .models import Location, LocationKind, Sector, Skill

NAMESPACE = uuid.UUID("6f1c1c0e-6d0d-4b8e-9a54-2f3d5d1f6a10")

PROVINCES = [
    ("harare-province", "Harare Province"),
    ("bulawayo-province", "Bulawayo Province"),
    ("manicaland", "Manicaland"),
    ("mashonaland-central", "Mashonaland Central"),
    ("mashonaland-east", "Mashonaland East"),
    ("mashonaland-west", "Mashonaland West"),
    ("masvingo-province", "Masvingo Province"),
    ("matabeleland-north", "Matabeleland North"),
    ("matabeleland-south", "Matabeleland South"),
    ("midlands", "Midlands"),
]
CITIES = [
    ("harare", "Harare", "harare-province"),
    ("bulawayo", "Bulawayo", "bulawayo-province"),
    ("mutare", "Mutare", "manicaland"),
    ("gweru", "Gweru", "midlands"),
    ("kwekwe", "Kwekwe", "midlands"),
    ("masvingo", "Masvingo", "masvingo-province"),
    ("chinhoyi", "Chinhoyi", "mashonaland-west"),
    ("kadoma", "Kadoma", "mashonaland-west"),
    ("victoria-falls", "Victoria Falls", "matabeleland-north"),
]
SECTORS = [
    ("engineering", "Engineering"),
    ("technology", "Technology"),
    ("finance", "Finance and banking"),
    ("healthcare", "Healthcare"),
    ("education", "Education"),
    ("business", "Business and administration"),
    ("ngo", "NGO and development"),
    ("agriculture", "Agriculture"),
    ("mining", "Mining"),
    ("public-sector", "Public sector"),
]
SKILLS = [
    "Report writing",
    "AutoCAD",
    "JavaScript",
    "Spreadsheets",
    "Data analysis",
    "Project management",
    "Communication",
    "Community engagement",
    "Financial reporting",
    "Research",
]


def slugify_skill(name: str) -> str:
    return name.lower().replace(" ", "-")


def _id(kind: str, key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{kind}:{key}")


def seed_taxonomies() -> dict[str, int]:
    """Idempotent: creates what is missing and never overwrites edits made by Administrators."""
    created = {"locations": 0, "sectors": 0, "skills": 0}
    country, new = Location.objects.get_or_create(
        slug="zimbabwe",
        defaults={"id": _id("location", "zimbabwe"), "name": "Zimbabwe", "kind": LocationKind.COUNTRY},
    )
    created["locations"] += new
    provinces: dict[str, Location] = {}
    for slug, name in PROVINCES:
        provinces[slug], new = Location.objects.get_or_create(
            slug=slug,
            defaults={
                "id": _id("location", slug),
                "name": name,
                "kind": LocationKind.PROVINCE,
                "parent": country,
            },
        )
        created["locations"] += new
    for slug, name, province in CITIES:
        _, new = Location.objects.get_or_create(
            slug=slug,
            defaults={
                "id": _id("location", slug),
                "name": name,
                "kind": LocationKind.CITY,
                "parent": provinces[province],
            },
        )
        created["locations"] += new
    _, new = Location.objects.get_or_create(
        slug="remote",
        defaults={"id": _id("location", "remote"), "name": "Remote", "kind": LocationKind.REMOTE},
    )
    created["locations"] += new
    for slug, name in SECTORS:
        _, new = Sector.objects.get_or_create(slug=slug, defaults={"id": _id("sector", slug), "name": name})
        created["sectors"] += new
    for name in SKILLS:
        slug = slugify_skill(name)
        skill, new = Skill.objects.get_or_create(
            name_normalized=name.casefold(), defaults={"id": _id("skill", slug), "name": name}
        )
        created["skills"] += new
        del skill
    return created
