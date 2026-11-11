"""Which listing pages carry JobPosting markup, and so may be sent to the Google Indexing API.

Google allows the Indexing API only for pages with JobPosting (or livestream) structured data. This is the
server-side mirror of `jobPostingFor` and `isOpen` in `apps/web/src/lib/structured-data.ts`, and must stay
in step with it (both sides have tests for the same cases):

* the listing is published, has a public address and its deadline (if any) has not passed;
* it is a job, an internship or a graduate programme (scholarships, tenders and grants carry no JobPosting);
* it states a place: a named town or city, or "Zimbabwe" for a countrywide post; a remote post needs
  "Zimbabwe" (the applicant country Google requires). With no place stated the page has no JobPosting at
  all.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime

from opportunities.models import ListingStatus, Opportunity, OpportunityVersion

JOB_CATEGORIES = frozenset({"jobs", "internships", "graduate-programmes"})
NOT_A_PLACE = frozenset({"remote", "zimbabwe"})


def is_job_category(opportunity: Opportunity) -> bool:
    return opportunity.category.code in JOB_CATEGORIES


def carries_job_posting(opportunity: Opportunity, version: OpportunityVersion | None, now: datetime) -> bool:
    if version is None or opportunity.slug is None or opportunity.status != ListingStatus.PUBLISHED:
        return False
    if version.deadline_at is not None and version.deadline_at <= now:
        return False
    if not is_job_category(opportunity):
        return False
    slugs = {row.location.slug for row in version.locations.select_related("location")}
    countrywide = "zimbabwe" in slugs
    if version.work_mode == "remote":
        return countrywide
    return bool(slugs - NOT_A_PLACE) or countrywide


# What the public job page and its JobPosting are built from. Internal fields (notes, sources, review
# metadata) are left out: changing them changes nothing Google can see, so it is no reason to notify Google.
_PAGE_FIELDS = (
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
    "salary_text",
    "deadline_at",
    "deadline_is_date_only",
    "application_method",
    "application_url",
    "application_email",
    "application_instructions",
    "reference_number",
    "seo_title",
    "seo_description",
    "og_title",
    "og_description",
    "featured_image",
    "featured_image_alt",
    "social_image",
    "organisation_id",
    "detail",
)


def page_fingerprint(version: OpportunityVersion) -> str:
    """A stable hash of the publicly visible content of one revision, including its places."""
    data = {name: getattr(version, name, None) for name in _PAGE_FIELDS}
    data["locations"] = sorted(row.location.slug for row in version.locations.select_related("location"))
    encoded = json.dumps(data, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()
