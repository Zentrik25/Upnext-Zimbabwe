"""Draft content: parsing, draft-level validation (types, lengths, references), persistence and the
canonical snapshot that is hashed at submission (VALIDATION_SPEC §1, §4; ERD §3.5).

`clean_draft` accepts the `DraftContent` shape of the OpenAPI contract and returns column values; it
never touches the database except to resolve references. `apply_to_version` writes them.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Mapping
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from django.utils.dateparse import parse_datetime

from catalog.models import Location, Organisation, Sector, Skill
from catalog.text import TextError, clean_multiline, clean_single_line
from catalog.validators import (
    RESERVED_SLUGS,
    SLUG_RE,
    parse_amount,
    validate_currency,
    validate_email,
    validate_timezone,
    validate_url,
)

from .errors import FieldErrors, ValidationFailed
from .models import (
    OPEN_STATES,
    ApplicationMethod,
    EmploymentType,
    ExperienceLevel,
    Opportunity,
    OpportunitySource,
    OpportunityVersion,
    SalaryPeriod,
    SourceKind,
    VersionLocation,
    VersionSector,
    VersionSkill,
    WorkMode,
)

ALLOWED_KEYS = frozenset(
    {
        "organisation_id",
        "title",
        "summary",
        "description_md",
        "requirements_md",
        "locations",
        "location_text",
        "geographic_eligibility",
        "work_mode",
        "employment_type",
        "experience_level",
        "salary",
        "salary_text",
        "funding",
        "deadline_at",
        "deadline_timezone",
        "deadline_is_date_only",
        "application_method",
        "application_url",
        "application_email",
        "application_email_subject",
        "application_instructions",
        "reference_number",
        "contact_details",
        "skills",
        "sector_ids",
        "sources",
        "detail",
        "slug",
        "seo_title",
        "seo_description",
        "og_title",
        "og_description",
    }
)

SINGLE_LINE = {
    "title": 200,
    "summary": 300,
    "location_text": 200,
    "geographic_eligibility": 500,
    "reference_number": 100,
    "contact_details": 500,
    "salary_text": 120,
    "application_email_subject": 150,
    "seo_title": 70,
    "seo_description": 200,
    "og_title": 90,
    "og_description": 200,
}
# Staff-only content: an employer's draft never carries a chosen address or search/sharing text (D-55).
STAFF_ONLY_KEYS = frozenset({"slug", "seo_title", "seo_description", "og_title", "og_description"})
MULTI_LINE = {"description_md": 20000, "requirements_md": 10000, "application_instructions": 2000}
ENUMS: dict[str, type[Any]] = {
    "work_mode": WorkMode,
    "employment_type": EmploymentType,
    "experience_level": ExperienceLevel,
    "application_method": ApplicationMethod,
}
# Fields that may be cleared with null; others (title, summary, description, organisation) cannot be null.
NULLABLE = {
    "requirements_md",
    "location_text",
    "geographic_eligibility",
    "work_mode",
    "employment_type",
    "experience_level",
    "salary",
    "funding",
    "deadline_at",
    "deadline_timezone",
    "application_url",
    "application_email",
    "application_instructions",
    "reference_number",
    "contact_details",
    "salary_text",
    "application_email_subject",
    "seo_title",
    "seo_description",
    "og_title",
    "og_description",
}


def _err(errors: FieldErrors, path: str, code: str, message: str) -> None:
    errors.setdefault(path, []).append((code, message))


def _as_uuid(value: Any) -> uuid.UUID | None:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except ValueError, AttributeError, TypeError:
        return None


def _money(raw: Any, path: str, errors: FieldErrors, *, period: bool, digits: int) -> dict[str, Any] | None:
    if raw is None:
        return None
    allowed = {"min", "max", "currency"} | ({"period"} if period else set())
    if not isinstance(raw, Mapping):
        _err(errors, path, "invalid_format", "Must be an object or null.")
        return None
    for key in raw:
        if key not in allowed:
            _err(errors, f"{path}.{key}", "unknown_field", "Unknown field.")
    out: dict[str, Any] = {"min": None, "max": None, "currency": None, "period": None}
    for key in ("min", "max"):
        if raw.get(key) is not None:
            try:
                out[key] = parse_amount(raw[key], max_int_digits=digits)
            except TextError as exc:
                _err(errors, f"{path}.{key}", exc.code, str(exc))
    if raw.get("currency") is not None:
        try:
            out["currency"] = validate_currency(str(raw["currency"]))
        except TextError as exc:
            _err(errors, f"{path}.currency", exc.code, str(exc))
    if period and raw.get("period") is not None:
        if raw["period"] in SalaryPeriod.values:
            out["period"] = raw["period"]
        else:
            _err(errors, f"{path}.period", "invalid_choice", "Not a valid period.")
    if out["min"] is not None and out["max"] is not None and out["min"] > out["max"]:
        _err(errors, f"{path}.min", "out_of_range", "Minimum must not exceed maximum.")
    return out


def clean_draft(content: Mapping[str, Any]) -> tuple[dict[str, Any], FieldErrors]:
    """Draft-level validation. Returns (cleaned values for the keys present, errors)."""
    errors: FieldErrors = {}
    out: dict[str, Any] = {}
    for key in content:
        if key not in ALLOWED_KEYS:
            _err(errors, key, "unknown_field", "Unknown field.")

    for key, limit in SINGLE_LINE.items():
        if key in content:
            value = content[key]
            if value is None and key in NULLABLE:
                out[key] = None
            elif not isinstance(value, str):
                _err(errors, key, "invalid_format", "Must be text.")
            else:
                try:
                    cleaned = clean_single_line(value)
                except TextError as exc:
                    _err(errors, key, exc.code, str(exc))
                    continue
                if len(cleaned) > limit:
                    _err(errors, key, "too_long", f"At most {limit} characters.")
                out[key] = cleaned or (None if key in NULLABLE else "")
    for key, limit in MULTI_LINE.items():
        if key in content:
            value = content[key]
            if value is None and key in NULLABLE:
                out[key] = None
            elif not isinstance(value, str):
                _err(errors, key, "invalid_format", "Must be text.")
            else:
                try:
                    cleaned = clean_multiline(value)
                except TextError as exc:
                    _err(errors, key, exc.code, str(exc))
                    continue
                if len(cleaned) > limit:
                    _err(errors, key, "too_long", f"At most {limit} characters.")
                out[key] = cleaned or (None if key in NULLABLE else "")
    for key, enum in ENUMS.items():
        if key in content:
            value = content[key]
            if value is None and key in NULLABLE:
                out[key] = None
            elif value in enum.values:
                out[key] = value
            else:
                _err(errors, key, "invalid_choice", "Not a valid choice.")

    if "organisation_id" in content:
        org_id = _as_uuid(content["organisation_id"])
        organisation = (
            Organisation.objects.filter(pk=org_id, merged_into__isnull=True).first() if org_id else None
        )
        if organisation is None:
            _err(errors, "organisation_id", "not_found_reference", "Unknown organisation.")
        else:
            out["organisation"] = organisation

    if "salary" in content:
        money = _money(content["salary"], "salary", errors, period=True, digits=12)
        out.update(
            {
                "salary_min": money and money["min"],
                "salary_max": money and money["max"],
                "salary_currency": money and money["currency"],
                "salary_period": money and money["period"],
            }
        )
    if "funding" in content:
        money = _money(content["funding"], "funding", errors, period=True, digits=14)
        out.update(
            {
                "funding_min": money and money["min"],
                "funding_max": money and money["max"],
                "funding_currency": money and money["currency"],
                "funding_period": money and money["period"],
            }
        )

    if "deadline_at" in content:
        raw = content["deadline_at"]
        if raw is None:
            out["deadline_at"] = None
        else:
            parsed = (
                parse_datetime(raw) if isinstance(raw, str) else (raw if isinstance(raw, datetime) else None)
            )
            if parsed is None or parsed.tzinfo is None:
                _err(errors, "deadline_at", "invalid_date", "Use a date-time with a time zone offset.")
            else:
                out["deadline_at"] = parsed
    if "deadline_timezone" in content:
        raw = content["deadline_timezone"]
        if raw is None:
            out["deadline_timezone"] = None
        else:
            try:
                out["deadline_timezone"] = validate_timezone(str(raw))
            except TextError as exc:
                _err(errors, "deadline_timezone", exc.code, str(exc))
    if "deadline_is_date_only" in content:
        if isinstance(content["deadline_is_date_only"], bool):
            out["deadline_is_date_only"] = content["deadline_is_date_only"]
        else:
            _err(errors, "deadline_is_date_only", "invalid_format", "Must be true or false.")

    if "application_url" in content:
        raw = content["application_url"]
        if raw is None:
            out["application_url"] = None
        else:
            try:
                out["application_url"] = validate_url(str(raw), field_name="Application URL")
            except TextError as exc:
                _err(errors, "application_url", exc.code, str(exc))
    if "application_email" in content:
        raw = content["application_email"]
        if raw is None:
            out["application_email"] = None
        else:
            try:
                out["application_email"] = validate_email(str(raw))
            except TextError as exc:
                _err(errors, "application_email", exc.code, str(exc))

    if "slug" in content:
        raw = content["slug"]
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            out["slug_hint"] = None
        elif not isinstance(raw, str):
            _err(errors, "slug", "invalid_format", "Must be text.")
        else:
            candidate = raw.strip().lower()
            if not 6 <= len(candidate) <= 80:
                _err(errors, "slug", "invalid_format", "Use 6 to 80 characters.")
            elif not SLUG_RE.match(candidate):
                _err(errors, "slug", "invalid_format", "Use lower-case letters, digits and single hyphens.")
            elif candidate in RESERVED_SLUGS:
                _err(errors, "slug", "invalid_format", "That address is reserved.")
            else:
                out["slug_hint"] = candidate

    _clean_relations(content, out, errors)
    if "detail" in content:
        if isinstance(content["detail"], Mapping):
            out["detail"] = json.loads(json.dumps(content["detail"]))  # plain JSON copy
        else:
            _err(errors, "detail", "invalid_format", "Must be an object.")
    return out, errors


def _clean_relations(content: Mapping[str, Any], out: dict[str, Any], errors: FieldErrors) -> None:
    if "locations" in content:
        rows: list[tuple[Location, bool]] = []
        raw = content["locations"]
        if not isinstance(raw, list) or len(raw) > 5:
            _err(errors, "locations", "too_many_items", "At most 5 locations.")
        else:
            seen: set[uuid.UUID] = set()
            for i, item in enumerate(raw):
                loc_id = _as_uuid(item.get("location_id")) if isinstance(item, Mapping) else None
                location = Location.objects.filter(pk=loc_id, active=True).first() if loc_id else None
                if location is None or not isinstance(item.get("is_primary"), bool):
                    _err(errors, f"locations.{i}", "not_found_reference", "Unknown location.")
                elif location.pk in seen:
                    _err(errors, f"locations.{i}", "duplicate_item", "Location repeated.")
                else:
                    seen.add(location.pk)
                    rows.append((location, item["is_primary"]))
            if sum(1 for _, primary in rows if primary) > 1:
                _err(errors, "locations", "invalid_choice", "Only one location can be primary.")
            out["locations"] = rows
    if "skills" in content:
        skill_rows: list[tuple[Skill, bool]] = []
        raw = content["skills"]
        if not isinstance(raw, list) or len(raw) > 30:
            _err(errors, "skills", "too_many_items", "At most 30 skills.")
        else:
            seen_skills: set[uuid.UUID] = set()
            for i, item in enumerate(raw):
                skill_id = _as_uuid(item.get("skill_id")) if isinstance(item, Mapping) else None
                skill = (
                    Skill.objects.filter(pk=skill_id, active=True, status="approved").first()
                    if skill_id
                    else None
                )
                if skill is None or not isinstance(item.get("is_required"), bool):
                    _err(errors, f"skills.{i}", "not_found_reference", "Unknown skill.")
                elif skill.pk in seen_skills:
                    _err(errors, f"skills.{i}", "duplicate_item", "Skill repeated.")
                else:
                    seen_skills.add(skill.pk)
                    skill_rows.append((skill, item["is_required"]))
            out["skills"] = skill_rows
    if "sector_ids" in content:
        sectors: list[Sector] = []
        raw = content["sector_ids"]
        if not isinstance(raw, list) or len(raw) > 5:
            _err(errors, "sector_ids", "too_many_items", "At most 5 sectors.")
        else:
            for i, item in enumerate(raw):
                sector_id = _as_uuid(item)
                sector = Sector.objects.filter(pk=sector_id, active=True).first() if sector_id else None
                if sector is None or sector in sectors:
                    _err(errors, f"sector_ids.{i}", "not_found_reference", "Unknown or repeated sector.")
                else:
                    sectors.append(sector)
            out["sectors"] = sectors
    if "sources" in content:
        out["sources"] = _clean_sources(content["sources"], errors)


def _clean_sources(raw: Any, errors: FieldErrors) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not isinstance(raw, list) or len(raw) > 10:
        _err(errors, "sources", "too_many_items", "At most 10 sources.")
        return rows
    for i, item in enumerate(raw):
        path = f"sources.{i}"
        if not isinstance(item, Mapping):
            _err(errors, path, "invalid_format", "Must be an object.")
            continue
        for key in item:
            if key not in {"kind", "name", "url", "citation", "observed_on", "is_primary"}:
                _err(errors, f"{path}.{key}", "unknown_field", "Unknown field.")
        row: dict[str, Any] = {"url": None, "citation": None}
        if item.get("kind") in SourceKind.values:
            row["kind"] = item["kind"]
        else:
            _err(errors, f"{path}.kind", "invalid_choice", "Not a valid source kind.")
        try:
            row["name"] = clean_single_line(str(item.get("name", "")))
            if not 2 <= len(row["name"]) <= 200:
                _err(
                    errors,
                    f"{path}.name",
                    "too_short" if len(row["name"]) < 2 else "too_long",
                    "2-200 characters.",
                )
            if item.get("citation") is not None:
                row["citation"] = clean_single_line(str(item["citation"])) or None
                if row["citation"] and len(row["citation"]) > 500:
                    _err(errors, f"{path}.citation", "too_long", "At most 500 characters.")
        except TextError as exc:
            _err(errors, path, exc.code, str(exc))
        if item.get("url") is not None:
            try:
                row["url"] = validate_url(str(item["url"]), field_name="Source URL")
            except TextError as exc:
                _err(errors, f"{path}.url", exc.code, str(exc))
        try:
            row["observed_on"] = date.fromisoformat(str(item.get("observed_on")))
        except ValueError:
            _err(errors, f"{path}.observed_on", "invalid_date", "Use YYYY-MM-DD.")
        if not row["url"] and not row["citation"] and not any(e.startswith(path) for e in errors):
            _err(errors, path, "required", "A source needs a URL or a citation.")
        if isinstance(item.get("is_primary"), bool):
            row["is_primary"] = item["is_primary"]
        else:
            _err(errors, f"{path}.is_primary", "invalid_format", "Must be true or false.")
        rows.append(row)
    if sum(1 for r in rows if r.get("is_primary")) > 1:
        _err(errors, "sources", "primary_source_required", "Only one source can be primary.")
    return rows


def slug_errors(
    cleaned: Mapping[str, Any], *, opportunity_id: uuid.UUID | None, current_slug: str | None
) -> FieldErrors:
    """A chosen address must be free: not another listing's slug and not another open draft's choice. Once a
    listing has its permanent slug the address cannot change (permanent URLs, D-55)."""
    hint = cleaned.get("slug_hint")
    errors: FieldErrors = {}
    if not hint:
        return errors
    if current_slug is not None:
        if hint != current_slug:
            _err(errors, "slug", "immutable", "A published address cannot change.")
        return errors
    taken = Opportunity.objects.filter(slug=hint)
    if opportunity_id is not None:
        taken = taken.exclude(pk=opportunity_id)
    chosen = OpportunityVersion.objects.filter(slug_hint=hint, state__in=OPEN_STATES)
    if opportunity_id is not None:
        chosen = chosen.exclude(opportunity_id=opportunity_id)
    if taken.exists() or chosen.exists():
        _err(errors, "slug", "duplicate_detected", "That address is already used by another listing.")
    return errors


def consistency_errors(version: OpportunityVersion) -> FieldErrors:
    """Pairings the database also enforces; reported as validation errors instead of a failed INSERT."""
    errors: FieldErrors = {}
    if (version.salary_min is not None or version.salary_max is not None) and not (
        version.salary_currency and version.salary_period
    ):
        _err(errors, "salary", "required", "A salary amount needs a currency and a period.")
    if (version.funding_min is not None or version.funding_max is not None) and not version.funding_currency:
        _err(errors, "funding", "required", "A funding amount needs a currency.")
    if version.deadline_at is not None and not version.deadline_timezone:
        _err(errors, "deadline_timezone", "required", "A deadline needs a time zone.")
    if version.deadline_is_date_only and version.deadline_at is None:
        _err(errors, "deadline_is_date_only", "invalid_choice", "A date-only deadline needs a deadline.")
    return errors


def apply_to_version(version: OpportunityVersion, cleaned: Mapping[str, Any], *, actor_id: uuid.UUID) -> None:
    """Persist cleaned draft values on a *draft* version (the database refuses it otherwise)."""
    scalar = {k: v for k, v in cleaned.items() if k not in {"locations", "skills", "sectors", "sources"}}
    for key, value in scalar.items():
        setattr(version, key, value)
    raise_if_errors(consistency_errors(version))
    version.save()
    if "locations" in cleaned:
        version.locations.all().delete()
        VersionLocation.objects.bulk_create(
            [
                VersionLocation(version=version, location=loc, is_primary=primary)
                for loc, primary in cleaned["locations"]
            ]
        )
    if "skills" in cleaned:
        version.skills.all().delete()
        VersionSkill.objects.bulk_create(
            [VersionSkill(version=version, skill=skill, is_required=req) for skill, req in cleaned["skills"]]
        )
    if "sectors" in cleaned:
        version.sectors.all().delete()
        VersionSector.objects.bulk_create(
            [VersionSector(version=version, sector=s) for s in cleaned["sectors"]]
        )
    if "sources" in cleaned:
        version.sources.all().delete()
        OpportunitySource.objects.bulk_create(
            [
                OpportunitySource(
                    opportunity_id=version.opportunity_id,
                    version=version,
                    created_by_id=actor_id,
                    kind=row.get("kind", SourceKind.OTHER),
                    name=row.get("name", ""),
                    url=row["url"],
                    citation=row["citation"],
                    observed_on=row.get("observed_on") or date.today(),
                    is_primary=row.get("is_primary", False),
                )
                for row in cleaned["sources"]
            ]
        )


def copy_children(source: OpportunityVersion, target: OpportunityVersion, *, actor_id: uuid.UUID) -> None:
    """Copy relational facts and sources into a new draft version (T14 reopen, T15 amend)."""
    VersionLocation.objects.bulk_create(
        [
            VersionLocation(version=target, location_id=r.location_id, is_primary=r.is_primary)
            for r in source.locations.all()
        ]
    )
    VersionSkill.objects.bulk_create(
        [
            VersionSkill(version=target, skill_id=r.skill_id, is_required=r.is_required)
            for r in source.skills.all()
        ]
    )
    VersionSector.objects.bulk_create(
        [VersionSector(version=target, sector_id=r.sector_id) for r in source.sectors.all()]
    )
    OpportunitySource.objects.bulk_create(
        [
            OpportunitySource(
                opportunity_id=r.opportunity_id,
                version=target,
                kind=r.kind,
                name=r.name,
                url=r.url,
                citation=r.citation,
                observed_on=r.observed_on,
                is_primary=r.is_primary,
                created_by_id=actor_id,
            )
            for r in source.sources.all()
        ]
    )


COPIED_COLUMNS = (
    "organisation_id",
    "title",
    "summary",
    "description_md",
    "requirements_md",
    "work_mode",
    "employment_type",
    "experience_level",
    "location_text",
    "geographic_eligibility",
    "salary_min",
    "salary_max",
    "salary_currency",
    "salary_period",
    "funding_min",
    "funding_max",
    "funding_currency",
    "funding_period",
    "deadline_at",
    "deadline_timezone",
    "deadline_is_date_only",
    "application_method",
    "application_url",
    "application_email",
    "application_instructions",
    "reference_number",
    "contact_details",
    "detail",
    "detail_schema_version",
    # Added in D-55. Optional, and hashed only when set, so every revision approved before they existed keeps
    # the hash it was approved with.
    "salary_text",
    "application_email_subject",
    "seo_title",
    "seo_description",
    "og_title",
    "og_description",
    "slug_hint",
)
OPTIONAL_HASHED = frozenset(
    {
        "salary_text",
        "application_email_subject",
        "seo_title",
        "seo_description",
        "og_title",
        "og_description",
        "slug_hint",
    }
)


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    raise TypeError(f"not serialisable: {type(value)!r}")


def snapshot(version: OpportunityVersion) -> dict[str, Any]:
    """Every material field of a revision in one canonical structure (hashed at submission)."""
    data: dict[str, Any] = {"category": version.opportunity.category.code}
    for column in COPIED_COLUMNS:
        value = getattr(version, column)
        if column in OPTIONAL_HASHED and value in (None, ""):
            continue
        if column == "deadline_at" and value is not None:
            value = value.astimezone(UTC).isoformat()
        data[column] = value
    data["duplicate_acknowledgement"] = version.duplicate_acknowledgement
    data["locations"] = sorted((str(r.location_id), r.is_primary) for r in version.locations.all())
    data["skills"] = sorted((str(r.skill_id), r.is_required) for r in version.skills.all())
    data["sectors"] = sorted(str(r.sector_id) for r in version.sectors.all())
    data["sources"] = sorted(
        (r.kind, r.name, r.url or "", r.citation or "", r.observed_on.isoformat(), r.is_primary)
        for r in version.sources.all()
    )
    return data


def content_hash(version: OpportunityVersion) -> bytes:
    canonical = json.dumps(
        snapshot(version), sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=_json_default
    )
    return hashlib.sha256(canonical.encode("utf-8")).digest()


def raise_if_errors(errors: FieldErrors) -> None:
    if errors:
        raise ValidationFailed(errors)
