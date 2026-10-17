"""Test data builders: the Phase 0 category examples wired to real database rows."""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.apps import apps
from django.utils import timezone

from accounts.models import User
from catalog.models import Location, Organisation, Sector, Skill
from catalog.seed import seed_taxonomies, slugify_skill
from opportunities import demo, workflow
from opportunities.models import Opportunity

CHECKLIST = {"source_reviewed": True, "duplicates_reviewed": True, "content_matches_source": True}


@dataclass
class World:
    organisations: dict[str, str]
    locations: dict[str, str]
    sectors: dict[str, str]
    skills: dict[str, str]
    creator: User

    def content(self, example: str, **overrides: Any) -> tuple[str, dict[str, Any]]:
        category, content = demo.build_content(
            example,
            organisation_ids=self.organisations,
            location_ids=self.locations,
            sector_ids=self.sectors,
            skill_ids=self.skills,
            today=timezone.now().date(),
        )
        content.update(overrides)
        return category, content


def ensure_reference_data() -> None:
    """Categories and detail schemas come from a migration; re-create them after a table flush."""
    migration = importlib.import_module("catalog.migrations.0002_seed_categories_and_schemas")
    migration.seed(apps, None)


def build_world(creator: User) -> World:
    ensure_reference_data()
    seed_taxonomies()
    orgs = {}
    for suffix, (name, website) in demo.ORGANISATIONS.items():
        org, _ = Organisation.objects.get_or_create(
            name=name, defaults={"website_url": website, "created_by": creator}
        )
        orgs[suffix] = str(org.pk)
    return World(
        organisations=orgs,
        locations={slug: str(pk) for slug, pk in Location.objects.values_list("slug", "pk")},
        sectors={slug: str(pk) for slug, pk in Sector.objects.values_list("slug", "pk")},
        skills={slugify_skill(n): str(pk) for n, pk in Skill.objects.values_list("name", "pk")},
        creator=creator,
    )


def new_draft(world: World, author: User, example: str = "jobs-1", **overrides: Any) -> Opportunity:
    category, content = world.content(example, **overrides)
    opportunity = workflow.create_draft(author, category_code=category, content=content)
    opportunity.refresh_from_db()
    return opportunity


def submitted(world: World, author: User, example: str = "jobs-1", **overrides: Any) -> Opportunity:
    opportunity = new_draft(world, author, example, **overrides)
    workflow.submit(author, opportunity.pk, expected_row_version=opportunity.row_version)
    opportunity.refresh_from_db()
    return opportunity


def approved(
    world: World, author: User, reviewer: User, example: str = "jobs-1", **overrides: Any
) -> Opportunity:
    opportunity = submitted(world, author, example, **overrides)
    workflow.approve(
        reviewer, opportunity.pk, expected_row_version=opportunity.row_version, checklist=CHECKLIST
    )
    opportunity.refresh_from_db()
    return opportunity


def published(
    world: World,
    author: User,
    reviewer: User,
    publisher: User | None = None,
    example: str = "jobs-1",
    **overrides: Any,
) -> Opportunity:
    opportunity = approved(world, author, reviewer, example, **overrides)
    workflow.publish(publisher or reviewer, opportunity.pk, expected_row_version=opportunity.row_version)
    opportunity.refresh_from_db()
    return opportunity


def today() -> date:
    return timezone.now().date()


def varied(world: World, example: str, tag: str, **extra: Any) -> dict[str, Any]:
    """Overrides that make a copy of an example distinct (no hard-duplicate match) with a new title."""
    _, content = world.content(example)
    overrides: dict[str, Any] = {"title": f"{content['title']} {tag}"}
    overrides["sources"] = [
        {**s, "url": f"{s['url'].rstrip('/')}/{tag}" if s.get("url") else None} for s in content["sources"]
    ]
    if content.get("application_url"):
        overrides["application_url"] = f"{content['application_url'].rstrip('/')}/{tag}"
    overrides.update(extra)
    return overrides
