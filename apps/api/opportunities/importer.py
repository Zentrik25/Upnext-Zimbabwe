"""Draft-only import (P5-06): turns a reviewed file of listings into DRAFTS through the normal workflow code.

This module can create drafts and nothing else. It imports `create_draft` only: no submit, approve, verify or
publish function is reachable from here (a test asserts that), so an import can never bypass the editorial
separation of duties. The importing person is the author of every draft and therefore cannot approve or verify
them later; another authorised person does that in the normal queue.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from django.db import transaction

from access.registry import DEFAULT_REGISTRY, Permission
from accounts.models import User
from audit import services as audit
from audit.models import ActorType
from catalog.models import Category, Location, Organisation, Sector, Skill
from catalog.text import normalise_name

from . import content as content_mod
from .duplicates import find_duplicates
from .errors import PermissionDeniedError, ValidationFailed
from .models import OpportunitySource, OpportunityVersion
from .workflow import create_draft

PASSTHROUGH_LIMIT = 500


@dataclass
class RowResult:
    index: int
    title: str
    status: str  # created | would_create | invalid | duplicate
    problems: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    opportunity_id: str | None = None


def read_items(text: str) -> list[Mapping[str, Any]]:
    """A JSON array, or one JSON object per line."""
    stripped = text.strip()
    if not stripped:
        return []
    if stripped.startswith("["):
        data = json.loads(stripped)
    else:
        data = [json.loads(line) for line in stripped.splitlines() if line.strip()]
    if not isinstance(data, list) or not all(isinstance(x, dict) for x in data):
        raise ValueError("The file must hold a list of listing objects.")
    return data


def _resolve(item: Mapping[str, Any]) -> tuple[str | None, dict[str, Any], list[str]]:
    problems: list[str] = []
    content: dict[str, Any] = {
        k: v
        for k, v in item.items()
        if k not in {"category", "organisation", "locations", "sectors", "skills"}
    }
    category = item.get("category")
    if not isinstance(category, str) or not Category.objects.filter(code=category, active=True).exists():
        problems.append("category: required, and must be an existing category code such as jobs or tenders")
        category = None

    org = item.get("organisation")
    if isinstance(org, str):
        matches = list(
            Organisation.objects.filter(name_normalized=normalise_name(org), merged_into__isnull=True)
        )
        if len(matches) == 1:
            content["organisation_id"] = str(matches[0].pk)
        elif not matches:
            problems.append(
                f"organisation: {org!r} does not exist; an Administrator adds it in the staff site first"
            )
        else:
            problems.append(f"organisation: {org!r} matches several organisations")
    else:
        problems.append("organisation: required (the exact name of an existing organisation)")

    slugs = item.get("locations")
    if slugs is not None:
        rows = []
        for i, slug in enumerate(slugs if isinstance(slugs, list) else []):
            loc = Location.objects.filter(slug=slug, active=True).first() if isinstance(slug, str) else None
            if loc is None:
                problems.append(f"locations[{i}]: unknown location {slug!r}")
            else:
                rows.append({"location_id": str(loc.pk), "is_primary": i == 0})
        content["locations"] = rows
    sector_slugs = item.get("sectors")
    if sector_slugs is not None:
        ids = []
        for i, slug in enumerate(sector_slugs if isinstance(sector_slugs, list) else []):
            sec = Sector.objects.filter(slug=slug, active=True).first() if isinstance(slug, str) else None
            if sec is None:
                problems.append(f"sectors[{i}]: unknown sector {slug!r}")
            else:
                ids.append(str(sec.pk))
        content["sector_ids"] = ids
    skill_names = item.get("skills")
    if skill_names is not None:
        skill_rows = []
        for i, name in enumerate(skill_names if isinstance(skill_names, list) else []):
            skill = (
                Skill.objects.filter(
                    name_normalized=normalise_name(name), active=True, status="approved"
                ).first()
                if isinstance(name, str)
                else None
            )
            if skill is None:
                problems.append(f"skills[{i}]: unknown or unapproved skill {name!r}")
            else:
                skill_rows.append({"skill_id": str(skill.pk), "is_required": False})
        content["skills"] = skill_rows
    return category, content, problems


def _already_known(content: Mapping[str, Any]) -> str | None:
    """A primary source address that already belongs to a live or pipeline listing (hard duplicate)."""
    for source in content.get("sources") or []:
        url = source.get("url") if isinstance(source, Mapping) else None
        if (
            url
            and source.get("is_primary")
            and OpportunitySource.objects.filter(url=url, is_primary=True).exists()
        ):
            return str(url)
    return None


def import_drafts(
    actor: User, items: list[Mapping[str, Any]], *, dry_run: bool, source_sha256: str = ""
) -> list[RowResult]:
    if not actor.is_active or not DEFAULT_REGISTRY.has(actor.active_roles(), Permission.OPP_DRAFT_CREATE):
        raise PermissionDeniedError()
    results: list[RowResult] = []
    for index, item in enumerate(items, start=1):
        title = str(item.get("title", ""))[:120]
        category, content, problems = _resolve(item)
        result = RowResult(index, title, "invalid", problems)
        results.append(result)
        if problems or category is None:
            continue
        known = _already_known(content)
        if known:
            result.status = "duplicate"
            result.problems.append(f"the primary source address is already in the catalogue: {known}")
            continue
        _, errors = content_mod.clean_draft(content)
        if errors:
            result.problems.extend(f"{path}: {messages[0][1]}" for path, messages in errors.items())
            continue
        if dry_run:
            result.status = "would_create"
            continue
        try:
            with transaction.atomic():
                opportunity = create_draft(actor, category_code=category, content=content)
        except ValidationFailed as exc:
            result.problems.extend(f"{path}: {messages[0][1]}" for path, messages in exc.fields.items())
            continue
        result.status = "created"
        result.opportunity_id = str(opportunity.pk)
        assert opportunity.pending_version_id is not None
        version = OpportunityVersion.objects.get(pk=opportunity.pending_version_id)
        for dup in find_duplicates(version):
            result.notes.append(f"possible {dup.level} duplicate: {dup.reason}")
    if not dry_run:
        created = sum(r.status == "created" for r in results)
        audit.record(
            action="opportunity.import_batch",
            object_type="import",
            object_id=None,
            actor_id=actor.pk,
            actor_type=ActorType.USER,
            changes={"rows": len(items), "created": created, "file_sha256": source_sha256},
        )
    return results


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()
