"""Google Indexing API notifications for public job pages (ADR-0027).

What is sent, and when
----------------------
The Indexing API is supported by Google only for pages that carry `JobPosting` markup (or livestream
`BroadcastEvent`). UPNEXT therefore notifies Google about exactly the pages the web app marks up with `JobPosting`
(`apps/web/src/lib/structured-data.ts`, `jobPostingFor`): the categories jobs, internships and graduate programmes,
open, with a stated place. Scholarships, tenders, grants, listings without a stated place, drafts and every other
address are never submitted. `has_job_markup` mirrors the web rule; `tests/test_indexing.py` pins the cases and the
web unit tests pin the same cases, so a change to one fails the other's tests.

  - published or republished with new content (T07)  -> URL_UPDATED
  - taken down (T09), withdrawn (T10), expired (T11), archived (T12) -> URL_DELETED. The page is still served with
    `noindex` and no markup (or 404 once archived), which Google accepts before a removal request.

The decision is taken twice: when the transition happens (so the row is written in the same transaction) and again just
before sending (so a row that waited while indexing was off, or while the listing changed again, never sends stale
intent). Only the present truth is ever sent.

Sending is by the worker, never in the request that published. It keeps within the daily allowance, backs off
exponentially on transient errors, stops at once on quota or configuration errors, and never marks a page as
indexed: `sent` means Google's API accepted the notification and nothing more.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone

from core.joblock import job_lock
from core.models import JobRun
from opportunities.models import ListingStatus, Opportunity, OpportunityVersion

from . import google
from .models import OPEN_STATUSES, IndexingNotification, NotificationKind, NotificationStatus

logger = logging.getLogger("upnext.indexing")
JOB_NAME = "indexing"

JOB_CATEGORIES = frozenset({"jobs", "internships", "graduate-programmes"})
UPDATE_TRANSITIONS = frozenset({"T07"})
CLOSING_TRANSITIONS = frozenset({"T09", "T10", "T11", "T12"})
NOT_A_PLACE = frozenset({"remote", "zimbabwe"})
MAX_BACKOFF = timedelta(hours=6)
CONFIG_RETRY = timedelta(hours=1)


def listing_url(opportunity: Opportunity) -> str | None:
    if not opportunity.slug:
        return None
    return f"{str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip('/')}/opportunities/{opportunity.slug}"


def has_job_markup(opportunity: Opportunity, version: OpportunityVersion) -> bool:
    """True when the listing's page carries (or, once closed, carried) JobPosting markup: a job-type category and
    the place Google requires. Mirrors `jobPostingFor` in the web app, minus the open/closed test."""
    if opportunity.category.code not in JOB_CATEGORIES:
        return False
    slugs = {row.location.slug for row in version.locations.all()}
    countrywide = "zimbabwe" in slugs
    if version.work_mode == "remote":
        return countrywide
    return countrywide or bool(slugs - NOT_A_PLACE)


def is_open(opportunity: Opportunity, version: OpportunityVersion, now: datetime) -> bool:
    return opportunity.status == ListingStatus.PUBLISHED and (
        version.deadline_at is None or version.deadline_at > now
    )


def desired_kind(opportunity: Opportunity, now: datetime) -> str | None:
    """What Google should be told about this listing's page right now, or None when nothing is supported."""
    version = opportunity.live_version
    if version is None or not opportunity.slug or not has_job_markup(opportunity, version):
        return None
    return NotificationKind.UPDATED if is_open(opportunity, version, now) else NotificationKind.DELETED


def enqueue(
    opportunity: Opportunity | None, url: str, kind: str, trigger: str
) -> IndexingNotification | None:
    """Record one notification, keeping at most one open row per address (duplicate prevention).

    - An open row of the same kind absorbs the request (nothing new is queued).
    - An open row of the other kind is switched to the newer decision and made due now.
    - A removal for an address whose last accepted notification was already a removal is not repeated.
    """
    now = timezone.now()
    with transaction.atomic():
        open_row = (
            IndexingNotification.objects.select_for_update().filter(url=url, status__in=OPEN_STATUSES).first()
        )
        if open_row is not None:
            if open_row.kind != kind:
                open_row.kind, open_row.trigger = kind, trigger
                open_row.attempts, open_row.next_attempt_at, open_row.detail = 0, now, ""
                open_row.status = NotificationStatus.PENDING
                open_row.save()
            return open_row
        if kind == NotificationKind.DELETED:
            last = (
                IndexingNotification.objects.filter(url=url, status=NotificationStatus.SENT)
                .order_by("-sent_at")
                .first()
            )
            if last is not None and last.kind == NotificationKind.DELETED:
                return None
        try:
            with transaction.atomic():
                return IndexingNotification.objects.create(
                    opportunity=opportunity, url=url, kind=kind, trigger=trigger, next_attempt_at=now
                )
        except IntegrityError:  # a concurrent transition queued the same address first
            return IndexingNotification.objects.filter(url=url, status__in=OPEN_STATUSES).first()


def queue_for(opportunity: Opportunity, trigger: str) -> IndexingNotification | None:
    """Queue what the listing's present state calls for, if the page type is supported."""
    kind = desired_kind(opportunity, timezone.now())
    url = listing_url(opportunity)
    if kind is None or url is None:
        return None
    return enqueue(opportunity, url, kind, trigger)


# --- sending ---------------------------------------------------------------------------------------------
@dataclass
class RunResult:
    status: str  # disabled | not_configured | skipped | ran
    sent: int = 0
    retried: int = 0
    dead: int = 0
    dropped: int = 0
    held: str = ""  # "quota" | "daily_limit" | "configuration" when the batch stopped early


def sent_in_last_day(now: datetime) -> int:
    return IndexingNotification.objects.filter(
        status=NotificationStatus.SENT, sent_at__gte=now - timedelta(hours=24)
    ).count()


def backoff(attempts: int) -> timedelta:
    """2, 4, 8, 16, 32 ... minutes after the 1st, 2nd, 3rd ... failed attempt, never more than six hours."""
    return min(timedelta(minutes=2) * (2 ** max(attempts - 1, 0)), MAX_BACKOFF)  # type: ignore[no-any-return]


def _finish(row: IndexingNotification, status: str, detail: str = "", **fields: Any) -> None:
    row.status, row.detail = status, detail[:300]
    for name, value in fields.items():
        setattr(row, name, value)
    row.save()


def _revalidate(row: IndexingNotification, now: datetime) -> bool:
    """Bring the row in line with the listing's state now. False (and the row skipped) if nothing is supported."""
    opportunity = (
        Opportunity.objects.select_related("category", "live_version")
        .prefetch_related("live_version__locations__location")
        .filter(pk=row.opportunity_id)
        .first()
        if row.opportunity_id
        else None
    )
    if opportunity is None:
        _finish(row, NotificationStatus.SKIPPED, "listing_gone")
        return False
    kind = desired_kind(opportunity, now)
    if kind is None:
        _finish(row, NotificationStatus.SKIPPED, "not_eligible")
        return False
    if kind == NotificationKind.DELETED:
        last = (
            IndexingNotification.objects.filter(url=row.url, status=NotificationStatus.SENT)
            .order_by("-sent_at")
            .first()
        )
        if last is not None and last.kind == NotificationKind.DELETED:
            _finish(row, NotificationStatus.SKIPPED, "already_removed")
            return False
    row.kind = kind
    return True


def run(
    now: datetime | None = None,
    client_factory: Callable[[google.Credentials], google.IndexingClient] | None = None,
) -> RunResult:
    """Send due notifications, one run at a time. Safe to call every worker cycle."""
    if not settings.UPNEXT_INDEXING_ENABLED:
        return RunResult("disabled")
    now = now or timezone.now()
    started = timezone.now()
    with job_lock(JOB_NAME) as acquired:
        if not acquired:
            return RunResult("skipped")
        try:
            credentials = google.load_credentials()
        except google.CredentialsError as exc:
            JobRun.record(JOB_NAME, ok=False, detail=f"credentials: {exc}"[:200], started_at=started)
            logger.error("indexing credentials unusable", extra={"event": "indexing.credentials"})
            return RunResult("not_configured")
        result = RunResult("ran")
        result.dropped = _drop_stale(now)
        budget = min(
            int(settings.UPNEXT_INDEXING_BATCH),
            int(settings.UPNEXT_INDEXING_DAILY_LIMIT) - sent_in_last_day(now),
        )
        if budget <= 0:
            result.held = "daily_limit"
        else:
            client = (
                client_factory(credentials)
                if client_factory
                else google.IndexingClient(google.TokenSource(credentials))
            )
            _send_batch(client, now, budget, result)
        ok = result.held != "configuration"
        JobRun.record(
            JOB_NAME,
            ok=ok,
            detail=(
                f"sent={result.sent} retry={result.retried} dead={result.dead} "
                f"dropped={result.dropped} held={result.held or '-'}"
            ),
            started_at=started,
        )
        return result


def _drop_stale(now: datetime) -> int:
    cutoff = now - timedelta(days=int(settings.UPNEXT_INDEXING_MAX_AGE_DAYS))
    return IndexingNotification.objects.filter(status__in=OPEN_STATUSES, created_at__lt=cutoff).update(
        status=NotificationStatus.SKIPPED, detail="stale", updated_at=now
    )


def _send_batch(client: google.IndexingClient, now: datetime, budget: int, result: RunResult) -> None:
    due = list(
        IndexingNotification.objects.filter(status__in=OPEN_STATUSES, next_attempt_at__lte=now).order_by(
            # removals first (URL_DELETED sorts before URL_UPDATED): a closed job still shown as open is the worse error
            "kind",
            "created_at",
        )[: budget * 3]
    )
    attempted = 0
    for row in due:
        if attempted >= budget:
            break
        if not _revalidate(row, now):
            continue
        attempted += 1
        try:
            published = client.publish(row.url, row.kind)
        except google.ApiError as exc:
            if exc.kind == "quota":  # nothing more today: keep the row and stop the batch
                _finish(
                    row,
                    NotificationStatus.RETRY,
                    "quota_exceeded",
                    http_status=exc.status,
                    next_attempt_at=now + CONFIG_RETRY,
                )
                result.held = "quota"
                logger.warning("indexing quota reached", extra={"event": "indexing.quota"})
                return
            if exc.kind in ("auth", "permission"):  # configuration: do not burn the row's attempts
                _finish(
                    row,
                    NotificationStatus.RETRY,
                    f"{exc.kind}: {exc}",
                    http_status=exc.status or None,
                    next_attempt_at=now + CONFIG_RETRY,
                )
                result.held = "configuration"
                logger.error("indexing refused", extra={"event": "indexing.refused", "kind": exc.kind})
                return
            row.attempts += 1
            if exc.kind in ("invalid", "not_found") or row.attempts >= int(
                settings.UPNEXT_INDEXING_MAX_ATTEMPTS
            ):
                _finish(row, NotificationStatus.DEAD, f"{exc.kind}: {exc}", http_status=exc.status or None)
                result.dead += 1
            else:
                _finish(
                    row,
                    NotificationStatus.RETRY,
                    f"{exc.kind}: {exc}",
                    http_status=exc.status or None,
                    next_attempt_at=now + backoff(row.attempts),
                )
                result.retried += 1
            continue
        row.attempts += 1
        _finish(
            row,
            NotificationStatus.SENT,
            "",
            http_status=published.http_status,
            google_notify_time=published.notify_time,
            sent_at=timezone.now(),
        )
        result.sent += 1


# --- reporting -------------------------------------------------------------------------------------------
def summary(now: datetime | None = None) -> dict[str, Any]:
    now = now or timezone.now()
    counts = {
        row["status"]: row["n"]
        for row in IndexingNotification.objects.values("status").annotate(n=Count("pk"))
    }
    oldest = IndexingNotification.objects.filter(status__in=OPEN_STATUSES).order_by("created_at").first()
    state, account = google.credentials_status()
    return {
        "enabled": bool(settings.UPNEXT_INDEXING_ENABLED),
        "credentials": state,
        "service_account": account,
        "daily_limit": int(settings.UPNEXT_INDEXING_DAILY_LIMIT),
        "sent_last_24h": sent_in_last_day(now),
        "counts": {s.value: counts.get(s.value, 0) for s in NotificationStatus},
        "oldest_open_at": oldest.created_at.isoformat().replace("+00:00", "Z") if oldest else None,
    }


def recent(limit: int = 50) -> list[IndexingNotification]:
    return list(IndexingNotification.objects.order_by("-created_at")[:limit])


def backfill(*, limit: int | None = None, dry_run: bool = False) -> dict[str, int]:
    """Queue URL_UPDATED for open, supported listings Google has not been told about since their last
    publication. A deliberate step the owner runs after enabling submissions; the worker then paces the sending."""
    now = timezone.now()
    queued = skipped = 0
    rows = (
        Opportunity.objects.filter(status=ListingStatus.PUBLISHED, live_version__isnull=False)
        .select_related("category", "live_version")
        .prefetch_related("live_version__locations__location")
        .order_by("last_published_at")
    )
    for opportunity in rows:
        if limit is not None and queued >= limit:
            break
        if desired_kind(opportunity, now) != NotificationKind.UPDATED:
            continue
        url = listing_url(opportunity)
        assert url is not None
        already = IndexingNotification.objects.filter(
            Q(status__in=OPEN_STATUSES)
            | Q(
                status=NotificationStatus.SENT,
                kind=NotificationKind.UPDATED,
                sent_at__gte=opportunity.last_published_at,
            ),
            url=url,
        ).exists()
        if already:
            skipped += 1
            continue
        if not dry_run:
            enqueue(opportunity, url, NotificationKind.UPDATED, "backfill")
        queued += 1
    return {"queued": queued, "already_notified": skipped}
