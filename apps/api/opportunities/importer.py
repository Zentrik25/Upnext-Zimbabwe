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
from .duplicates import (
    Identity,
    find_duplicates,
    identity_of,
    lock_identity_keys,
    normalise_url,
    version_identity,
)
from .errors import PermissionDeniedError, ValidationFailed
from .models import ListingStatus, OpportunitySource, OpportunityVersion, VersionState
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


# Listings an import must not repeat: any that is not archived and whose revision is still a draft, in review,
# approved or live. A discarded draft or an archived listing does not block a fresh import.
_KNOWN_STATES = (VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED, VersionState.PUBLISHED)


def _identity_of_row(content: Mapping[str, Any]) -> Identity:
    sources = [
        str(s["url"])
        for s in content.get("sources") or []
        if isinstance(s, Mapping) and s.get("url") and s.get("is_primary")
    ]
    url = content.get("application_url")
    return identity_of(
        content.get("organisation_id", ""),
        reference_number=content.get("reference_number")
        if isinstance(content.get("reference_number"), str)
        else None,
        application_url=url if isinstance(url, str) else None,
        source_urls=sources,
    )


def _already_known(content: Mapping[str, Any], batch: dict[str, int] | None = None) -> str | None:
    """Why this row repeats a listing already in the catalogue or earlier in the same file, or None (D-79).

    A row is a repeat when its primary source address is already recorded (as before), or when it carries a
    reliable issuer identifier that an open draft, review or live listing already has: the same organisation's
    vacancy reference, or the same specific application or source address once tracking parameters are
    removed. Rows without such an identifier are created, and their title-level matches are reported as notes
    for review."""
    for source in content.get("sources") or []:
        url = source.get("url") if isinstance(source, Mapping) else None
        if (
            url
            and source.get("is_primary")
            and OpportunitySource.objects.filter(url=url, is_primary=True).exists()
        ):
            return f"the primary source address is already in the catalogue: {url}"
    identity = _identity_of_row(content)
    if not identity:
        return None
    for key in identity.lock_keys():
        if batch is not None and key in batch:
            return f"row {batch[key]} of this file advertises the same vacancy ({key.split(':', 1)[0]})"
    org = identity.organisation_id
    near = OpportunityVersion.objects.filter(state__in=_KNOWN_STATES).exclude(
        opportunity__status=ListingStatus.ARCHIVED
    )
    candidates = near.filter(organisation_id=org) if identity.references else near.none()
    for address in identity.addresses:
        host = address.split("/")[2]
        candidates = candidates | near.filter(application_url__icontains=host)
        candidates = candidates | near.filter(sources__is_primary=True, sources__url__icontains=host)
    for other in candidates.distinct().prefetch_related("sources").select_related("opportunity"):
        theirs = version_identity(other)
        if str(other.organisation_id) == org and identity.references & theirs.references:
            ref = sorted(identity.references & theirs.references)[0]
            return f"the organisation's vacancy reference {ref} is already in the catalogue"
        shared = sorted(identity.addresses & theirs.addresses)
        if shared:
            return (
                f"the application or source address is already in the catalogue: {normalise_url(shared[0])}"
            )
    return None


def import_drafts(
    actor: User, items: list[Mapping[str, Any]], *, dry_run: bool, source_sha256: str = ""
) -> list[RowResult]:
    if not actor.is_active or not DEFAULT_REGISTRY.has(actor.active_roles(), Permission.OPP_DRAFT_CREATE):
        raise PermissionDeniedError()
    results: list[RowResult] = []
    batch: dict[str, int] = {}  # identity key -> first row that carried it, so one file cannot repeat itself
    for index, item in enumerate(items, start=1):
        title = str(item.get("title", ""))[:120]
        category, content, problems = _resolve(item)
        result = RowResult(index, title, "invalid", problems)
        results.append(result)
        if problems or category is None:
            continue
        known = _already_known(content, batch)
        if known:
            result.status = "duplicate"
            result.problems.append(known)
            continue
        _, errors = content_mod.clean_draft(content)
        if errors:
            result.problems.extend(f"{path}: {messages[0][1]}" for path, messages in errors.items())
            continue
        keys = _identity_of_row(content).lock_keys()
        if dry_run:
            result.status = "would_create"
            batch.update({key: index for key in keys if key not in batch})
            continue
        try:
            with transaction.atomic():
                # Two imports of one file at once: the second waits here, then sees the first one's draft.
                lock_identity_keys(keys)
                again = _already_known(content)
                if again:
                    result.status = "duplicate"
                    result.problems.append(again)
                    continue
                opportunity = create_draft(actor, category_code=category, content=content)
        except ValidationFailed as exc:
            result.problems.extend(f"{path}: {messages[0][1]}" for path, messages in exc.fields.items())
            continue
        batch.update({key: index for key in keys if key not in batch})
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
