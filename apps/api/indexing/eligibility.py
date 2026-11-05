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

from datetime import datetime

from opportunities.models import ListingStatus, Opportunity, OpportunityVersion

JOB_CATEGORIES = frozenset({"jobs", "internships", "graduate-programmes"})
_NOT_A_PLACE = {"remote", "zimbabwe"}


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
    return bool(slugs - _NOT_A_PLACE) or countrywide
