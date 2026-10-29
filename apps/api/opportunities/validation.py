"""Publish-grade validation (VALIDATION_SPEC §4-§8), run at submit (T03) and again at publish (T07).

It reads the stored revision, so what is validated is exactly what will be frozen and hashed. All
failures are returned together as `{path: [(code, message)]}`.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from catalog import markdown
from catalog.models import DetailSchema, DetailSchemaStatus
from catalog.schemas import validate_detail
from catalog.text import TextError
from catalog.validators import check_deadline, validate_email, validate_url

from .errors import FieldErrors
from .models import ApplicationMethod, OpportunityVersion

# Common-field applicability by category (CATEGORY_SCHEMA_EXAMPLES §2): R required, A allowed, F forbidden.
_EMPLOYMENT_RULES: dict[str, set[str] | None] = {
    "jobs": {"permanent", "contract", "temporary", "part_time"},
    "internships": {"internship"},
    "graduate-programmes": {"trainee"},
    "scholarships": None,
    "tenders": None,
    "grants": None,
}
_FORBIDDEN: dict[str, set[str]] = {
    "work_mode": {"scholarships", "grants"},
    "experience_level": {"scholarships", "tenders", "grants"},
    "salary": {"scholarships", "tenders", "grants"},
    "funding": {"jobs", "internships", "graduate-programmes"},
}
_FEE_WORDS = re.compile(
    r"\b(application|registration|processing|administration|admin|handling)\s+fee\b|\bpay(?:ment)?\s+(?:a\s+)?(?:deposit|fee)\b|\bdeposit\b",
    re.IGNORECASE,
)
_URL_IN_TEXT = re.compile(r"https?://|www\.", re.IGNORECASE)


def _add(errors: FieldErrors, path: str, code: str, message: str) -> None:
    errors.setdefault(path, []).append((code, message))


def _length(errors: FieldErrors, path: str, value: str | None, low: int, high: int) -> None:
    n = len(value or "")
    if n < low:
        _add(errors, path, "required" if n == 0 else "too_short", f"At least {low} characters.")
    elif n > high:
        _add(errors, path, "too_long", f"At most {high} characters.")


def fee_lint_triggers(version: OpportunityVersion) -> bool:
    """Editorial lint (not a blocker): applicant payments are mentioned outside tenders (scam guard)."""
    if version.opportunity.category.code == "tenders":
        return False
    text = " ".join(
        filter(
            None,
            [
                version.title,
                version.summary,
                version.description_md,
                version.requirements_md,
                version.responsibilities_md,
            ],
        )
    )
    return bool(_FEE_WORDS.search(text))


def _from_employer(version: OpportunityVersion) -> bool:
    """Employer listings have no image upload in the employer portal; they keep their moderation path as it
    was and are shown with the site's default sharing card."""
    from employers.models import EmployerListing

    return EmployerListing.objects.filter(opportunity_id=version.opportunity_id).exists()


def validate_publishable(version: OpportunityVersion, *, now: datetime | None = None) -> FieldErrors:
    now = now or datetime.now(UTC)
    errors: FieldErrors = {}
    category = version.opportunity.category.code

    _length(errors, "title", version.title, 5, 200)
    letters = [c for c in version.title if c.isalpha()]
    if len(letters) >= 8 and sum(c.isupper() for c in letters) / len(letters) > 0.6:
        _add(errors, "title", "invalid_format", "The title must not be mostly capital letters.")
    if _URL_IN_TEXT.search(version.title):
        _add(errors, "title", "invalid_format", "The title must not contain a web address.")
    _length(errors, "summary", version.summary, 20, 300)
    _length(errors, "description_md", version.description_md, 50, 20000)
    for field in ("description_md", "requirements_md", "responsibilities_md"):
        value = getattr(version, field)
        if value:
            try:
                markdown.check(value)
            except TextError as exc:
                _add(errors, field, exc.code, str(exc))
    if version.requirements_md is not None:
        _length(errors, "requirements_md", version.requirements_md, 0, 10000)
    if version.responsibilities_md is not None:
        _length(errors, "responsibilities_md", version.responsibilities_md, 0, 10000)
    if version.seo_title is not None:
        _length(errors, "seo_title", version.seo_title, 0, 70)
    if version.seo_description is not None:
        _length(errors, "seo_description", version.seo_description, 0, 160)
    if version.og_title is not None:
        _length(errors, "og_title", version.og_title, 0, 95)
    if version.og_description is not None:
        _length(errors, "og_description", version.og_description, 0, 200)
    if version.featured_image_id is not None and not (version.featured_image_alt or "").strip():
        _add(
            errors,
            "featured_image_alt",
            "required",
            "Describe the featured image for people who cannot see it.",
        )
    if version.social_image_id is not None and not (version.social_image_alt or "").strip():
        _add(errors, "social_image_alt", "required", "Describe the social sharing image.")
    if (
        version.featured_image_id is None
        and version.opportunity.first_published_at is None
        and not _from_employer(version)
    ):
        _add(errors, "featured_image_id", "required", "Upload a featured image before publishing.")

    locations = list(version.locations.all())
    if not locations:
        _add(errors, "locations", "required", "Choose at least one location.")
    elif sum(1 for r in locations if r.is_primary) != 1:
        _add(errors, "locations", "invalid_choice", "Exactly one location must be primary.")

    allowed_types = _EMPLOYMENT_RULES[category]
    if allowed_types is None:
        if version.employment_type:
            _add(errors, "employment_type", "invalid_choice", "Not applicable to this category.")
    elif version.employment_type not in allowed_types:
        _add(errors, "employment_type", "required", f"Choose one of: {', '.join(sorted(allowed_types))}.")
    if version.work_mode and category in _FORBIDDEN["work_mode"]:
        _add(errors, "work_mode", "invalid_choice", "Not applicable to this category.")
    if version.experience_level and category in _FORBIDDEN["experience_level"]:
        _add(errors, "experience_level", "invalid_choice", "Not applicable to this category.")
    if (version.salary_min is not None or version.salary_max is not None) and category in _FORBIDDEN[
        "salary"
    ]:
        _add(errors, "salary", "invalid_choice", "Not applicable to this category.")
    if (version.funding_min is not None or version.funding_max is not None) and category in _FORBIDDEN[
        "funding"
    ]:
        _add(errors, "funding", "invalid_choice", "Not applicable to this category.")

    if version.deadline_at is None:
        if category == "tenders":
            _add(errors, "deadline_at", "required", "A tender needs a closing time.")
    else:
        try:
            check_deadline(version.deadline_at, now)
        except TextError as exc:
            _add(errors, "deadline_at", exc.code, str(exc))

    method = version.application_method
    if method == ApplicationMethod.EXTERNAL_URL:
        if not version.application_url:
            _add(errors, "application_url", "required", "Add the address where people apply.")
        else:
            _recheck_url(errors, "application_url", version.application_url)
    elif method == ApplicationMethod.EMAIL:
        if not version.application_email:
            _add(errors, "application_email", "required", "Add the application e-mail address.")
        else:
            try:
                validate_email(version.application_email)
            except TextError as exc:
                _add(errors, "application_email", exc.code, str(exc))
    elif method == ApplicationMethod.INSTRUCTIONS:
        _length(errors, "application_instructions", version.application_instructions, 20, 2000)

    sources = list(version.sources.all())
    if not sources:
        _add(errors, "sources", "source_required", "Add at least one source.")
    elif sum(1 for s in sources if s.is_primary) != 1:
        _add(errors, "sources", "primary_source_required", "Exactly one source must be primary.")
    for i, source in enumerate(sources):
        if not source.url and not source.citation:
            _add(errors, f"sources.{i}", "required", "A source needs a URL or a citation.")
        if source.url:
            _recheck_url(errors, f"sources.{i}.url", source.url)
        if source.observed_on > now.date():
            _add(errors, f"sources.{i}.observed_on", "in_past", "The check date cannot be in the future.")
        elif source.observed_on < (now - timedelta(days=366)).date():
            _add(
                errors,
                f"sources.{i}.observed_on",
                "out_of_range",
                "The source was checked more than a year ago.",
            )

    active = DetailSchema.objects.filter(
        category=version.opportunity.category, status=DetailSchemaStatus.ACTIVE
    ).first()
    if active is None or active.version != version.detail_schema_version:
        _add(errors, "detail", "schema_violation", "The category schema version is no longer active.")
    else:
        for path, items in validate_detail(category, version.detail_schema_version, version.detail).items():
            for code, message in items:
                _add(errors, path, code, message)
        if category == "tenders":
            _tender_dates(errors, version)
    return errors


def _recheck_url(errors: FieldErrors, path: str, url: str) -> None:
    try:
        validate_url(url)
    except TextError as exc:
        _add(errors, path, exc.code, str(exc))


def _tender_dates(errors: FieldErrors, version: OpportunityVersion) -> None:
    """clarification < closing <= opening; site visit < closing (CATEGORY_SCHEMA_EXAMPLES §3.3)."""
    detail: dict[str, Any] = version.detail
    closing = version.deadline_at

    def parse(key: str) -> datetime | None:
        raw = detail.get(key)
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00")) if isinstance(raw, str) else None
        except ValueError:
            return None
        return parsed if parsed and parsed.tzinfo else None

    if closing is None:
        return
    clarification, visit, opening = (
        parse("clarification_deadline_at"),
        parse("site_visit_at"),
        parse("bid_opening_at"),
    )
    if clarification and clarification >= closing:
        _add(errors, "detail.clarification_deadline_at", "out_of_range", "Must be before the closing time.")
    if visit and visit >= closing:
        _add(errors, "detail.site_visit_at", "out_of_range", "Must be before the closing time.")
    if opening and opening < closing:
        _add(errors, "detail.bid_opening_at", "out_of_range", "Must not be before the closing time.")
