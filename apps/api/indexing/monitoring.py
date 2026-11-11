"""What the Administrator-only SEO monitoring page shows (`/workspace/seo`, `GET /api/v1/staff/seo`).

Everything here is read from this application's own records. It says what UPNEXT **asked** Google to do
and whether Google **accepted the request**; it never says that a page is indexed, because the Indexing API
does not report that. Search Console figures (impressions, clicks, indexed pages) need a separate,
authorised Search Console API integration, which does not exist: the page says "not connected".

Structured-data checks mirror the rules of `apps/web/src/lib/structured-data.ts` (`jobPostingFor`): an
*error* means the page carries no JobPosting at all and so cannot appear in Google for Jobs; a *warning*
names a property Google recommends that the listing does not state. A warning is never fixed by inventing
a value: staff add it only when the issuer actually stated it.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone

from audit import services as audit
from core.models import JobRun
from opportunities.models import OpportunityVersion
from opportunities.public import sitemap_entries, visible_versions

from .eligibility import JOB_CATEGORIES, NOT_A_PLACE
from .models import WAITING, IndexingNotification, Status
from .service import JOB_NAME, mode, status_summary

RECENT_LIMIT = 50
ISSUE_LIMIT = 100
RETRYABLE = (Status.DEAD, Status.FAILED)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _places(version: OpportunityVersion) -> set[str]:
    return {row.location.slug for row in version.locations.all()}


def _job_issues(version: OpportunityVersion) -> list[dict[str, str]]:
    """Problems with the JobPosting of one open job-category listing (empty: complete)."""
    issues: list[dict[str, str]] = []
    places = _places(version)
    countrywide = "zimbabwe" in places
    if version.work_mode == "remote" and not countrywide:
        issues.append({"level": "error", "code": "remote_without_country"})
    elif version.work_mode != "remote" and not (places - NOT_A_PLACE) and not countrywide:
        issues.append({"level": "error", "code": "no_place"})
    if not (version.description_md or "").strip():
        issues.append({"level": "error", "code": "no_description"})
    if version.deadline_at is None:
        issues.append({"level": "warning", "code": "no_deadline"})
    if not version.employment_type:
        issues.append({"level": "warning", "code": "no_employment_type"})
    if version.salary_min is None and version.salary_max is None:
        issues.append({"level": "warning", "code": "no_salary"})
    return issues


def _open_jobs(now: datetime) -> list[OpportunityVersion]:
    return list(
        visible_versions()
        .filter(Q(deadline_at__isnull=True) | Q(deadline_at__gt=now))
        .filter(opportunity__category__code__in=JOB_CATEGORIES)
        .prefetch_related("locations__location")
        .order_by("-opportunity__last_published_at")
    )


def overview(now: datetime | None = None) -> dict[str, Any]:
    now = now or timezone.now()
    summary = status_summary(now)
    jobs = _open_jobs(now)
    sitemap_slugs = {slug for slug, _ in sitemap_entries(now)}
    issues: list[dict[str, Any]] = []
    eligible = 0
    errors = warnings = 0
    for version in jobs:
        found = _job_issues(version)
        if not any(i["level"] == "error" for i in found):
            eligible += 1
        errors += sum(1 for i in found if i["level"] == "error")
        warnings += sum(1 for i in found if i["level"] == "warning")
        if found and len(issues) < ISSUE_LIMIT:
            opp = version.opportunity
            issues.append(
                {
                    "opportunity_id": str(opp.pk),
                    "title": version.title,
                    "slug": opp.slug,
                    "category": opp.category.code,
                    "issues": found,
                }
            )
    issues.sort(key=lambda row: (not any(i["level"] == "error" for i in row["issues"]), row["title"]))
    last_sent = IndexingNotification.objects.filter(status=Status.SENT).aggregate(at=Max("sent_at"))["at"]
    run = JobRun.objects.filter(name=JOB_NAME).first()
    return {
        "mode": mode(),
        "listings": {
            "open_jobs": len(jobs),
            "eligible_for_job_posting": eligible,
            "jobs_in_sitemap": sum(1 for v in jobs if v.opportunity.slug in sitemap_slugs),
            "listings_in_sitemap": len(sitemap_slugs),
        },
        "notifications": {
            **{status: summary["counts"].get(status, 0) for status in Status.values},
            "waiting": sum(summary["counts"].get(s, 0) for s in WAITING),
            "dead_last_24h": summary["dead_last_24h"],
            "oldest_waiting_seconds": summary["oldest_waiting_seconds"],
            "last_sent_at": _iso(last_sent),
        },
        "quota": {"used_today": summary["quota_used_today"], "limit": summary["quota_limit"]},
        "last_run": (
            {
                "status": run.last_status,
                "finished_at": _iso(run.last_finished_at),
                "last_ok_at": _iso(run.last_ok_at),
                "detail": run.last_detail,
            }
            if run
            else None
        ),
        "structured_data": {"errors": errors, "warnings": warnings, "listings": issues},
        # No Search Console API integration exists; nothing here is an indexing figure.
        "search_console": {"connected": False},
    }


def notifications(status: str | None = None, limit: int = RECENT_LIMIT) -> list[dict[str, Any]]:
    rows = IndexingNotification.objects.order_by("-created_at")
    if status in Status.values:
        rows = rows.filter(status=status)
    return [
        {
            "id": str(row.pk),
            "url": row.url,
            "action": row.action,
            "transition": row.transition,
            "status": row.status,
            "attempts": row.attempts,
            "response_status": row.response_status,
            "last_error": row.last_error,
            "created_at": _iso(row.created_at),
            "next_attempt_at": _iso(row.next_attempt_at) if row.status in WAITING else None,
            "sent_at": _iso(row.sent_at),
            "opportunity_id": str(row.opportunity_id) if row.opportunity_id else None,
        }
        for row in rows[: max(1, min(limit, 200))]
    ]


@dataclass
class RetryRefused(Exception):
    code: str
    message: str
    status: int = 409


def _newer_exists(row: IndexingNotification) -> bool:
    return (
        IndexingNotification.objects.filter(url=row.url, created_at__gt=row.created_at)
        .exclude(status=Status.SUPERSEDED)
        .exists()
    )


def _requeue(row: IndexingNotification, now: datetime) -> None:
    row.status = Status.PENDING
    row.attempts = 0
    row.next_attempt_at = now
    row.locked_at = None
    row.locked_by = None
    row.last_error = ""
    row.save()


def retry(
    actor_id: uuid.UUID, notification_id: uuid.UUID, now: datetime | None = None
) -> IndexingNotification:
    """Queue one failed or dead notification again, now, with a fresh set of attempts. The sender still
    re-reads the listing first, so a notification that no longer matches the page is superseded, not sent."""
    now = now or timezone.now()
    with transaction.atomic():
        row = IndexingNotification.objects.select_for_update().filter(pk=notification_id).first()
        if row is None:
            raise RetryRefused("not_found", "Notification not found.", 404)
        if row.status not in RETRYABLE:
            raise RetryRefused("not_retryable", "Only failed or dead notifications can be retried.")
        if _newer_exists(row):
            raise RetryRefused("superseded", "A newer notification for this address replaces this one.")
        before = row.status
        _requeue(row, now)
        audit.record(
            action="indexing.retry",
            object_type="indexing_notification",
            object_id=row.pk,
            actor_id=actor_id,
            changes={"status": [before, Status.PENDING], "action": row.action, "url": row.url},
        )
    return row


def retry_all_dead(actor_id: uuid.UUID, now: datetime | None = None) -> int:
    """Queue again every dead notification that is still the latest for its address."""
    now = now or timezone.now()
    count = 0
    with transaction.atomic():
        for row in IndexingNotification.objects.select_for_update().filter(status=Status.DEAD):
            if _newer_exists(row):
                continue
            _requeue(row, now)
            count += 1
        audit.record(
            action="indexing.retry_all",
            object_type="indexing_notification",
            object_id=None,
            actor_id=actor_id,
            changes={"requeued": count},
        )
    return count
