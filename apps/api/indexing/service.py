"""Google Indexing API notifications for job listing pages (D-68, docs/engineering/GOOGLE_INDEXING_API.md).

Rules, in the order they apply:

* **Job pages only.** Google allows the API only for pages with JobPosting data. A publication (T07) is sent
  as `URL_UPDATED` only when the page carries JobPosting (`eligibility.carries_job_posting`), or when it
  carried it before (an earlier `URL_UPDATED` was sent), so Google re-reads a job page that has lost its
  markup. Closing a job-category listing (T09 takedown, T10 withdraw, T11 expire, T12 archive) is sent as
  `URL_DELETED`: the page is then `noindex` or `404`, which is what Google requires for a removal. Home,
  category, landing and guide pages are never sent.
* **Off until configured.** `UPNEXT_INDEXING_MODE` is `off` by default: nothing is written. `record` writes
  the queue but sends nothing, so the owner can inspect it first; only `live` sends.
* **Once per event.** Each row has the key `event:<publishing event id>`, so a repeated signal or retried
  transaction writes one row. A newer event for the same address supersedes an older one not yet sent (only
  the latest state matters to Google), and a removal is not repeated when the last one is still waiting or
  was sent.
* **Never in the way.** Rows are written inside the transition's transaction (a rolled-back decision sends
  nothing), in a savepoint that swallows its own failure: indexing can never undo an editorial decision.
* **The current state wins.** Just before sending, the listing is read again: an update for a listing that has
  closed, or a removal for one that is open again, is superseded rather than sent.
* **Quota-aware.** Requests are counted per Google quota day (midnight Pacific time) and never exceed
  `UPNEXT_INDEXING_DAILY_QUOTA`; a `429` from Google ends the day's sending and the rows wait for the next
  day.
* **Retries with exponential back-off** (1 min to 24 h, with jitter) for network errors, `5xx` and `401`; any
  other `4xx` is permanent (`dead`), as is running out of attempts. Dead rows raise the `indexing.dead` alert.
"""

from __future__ import annotations

import logging
import os
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from core.joblock import job_lock
from core.models import JobRun
from opportunities.models import ListingStatus, Opportunity, OpportunityVersion, PublishingEvent

from . import google
from .eligibility import carries_job_posting, is_job_category
from .models import WAITING, Action, IndexingNotification, IndexingQuotaDay, Status

logger = logging.getLogger("upnext.indexing")
JOB_NAME = "indexing"
QUOTA_ZONE = ZoneInfo("America/Los_Angeles")  # Google's quotas reset at midnight Pacific time
BACKOFF_SECONDS = [60, 300, 1800, 7200, 21600, 86400]
MAX_ATTEMPTS = 8
STALE_CLAIM = timedelta(minutes=15)
CLOSING = {"T09", "T10", "T11", "T12"}  # takedown, withdraw, expire, archive
MODES = ("off", "record", "live")


def mode() -> str:
    value = str(getattr(settings, "UPNEXT_INDEXING_MODE", "off")).strip().lower()
    return value if value in MODES else "off"


def public_url(slug: str) -> str:
    return f"{str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip('/')}/opportunities/{slug}"


def _latest(url: str) -> IndexingNotification | None:
    return (
        IndexingNotification.objects.filter(url=url)
        .exclude(status__in=[Status.SUPERSEDED, Status.DEAD])
        .order_by("-created_at")
        .first()
    )


def desired_action(
    transition: str, opportunity: Opportunity, version: OpportunityVersion | None, now: datetime
) -> str | None:
    """The notification a transition calls for, or None. Pure apart from reading the queue's history."""
    if opportunity.slug is None:
        return None
    url = public_url(opportunity.slug)
    if transition == "T07":
        if carries_job_posting(opportunity, version, now):
            return Action.UPDATED
        sent_before = IndexingNotification.objects.filter(
            url=url, action=Action.UPDATED, status=Status.SENT
        ).exists()
        return Action.UPDATED if sent_before else None
    if transition in CLOSING and is_job_category(opportunity):
        latest = _latest(url)
        if latest is not None and latest.action == Action.DELETED:
            return None  # already removed (or waiting to be): withdraw then archive sends one removal
        return Action.DELETED
    return None


def enqueue(event: PublishingEvent, opportunity: Opportunity, version: OpportunityVersion | None) -> int:
    """Record the notification an editorial transition calls for. Returns the number of rows written (0 or
    1)."""
    if mode() == "off":
        return 0
    now = timezone.now()
    action = desired_action(event.transition, opportunity, version, now)
    if action is None:
        return 0
    assert opportunity.slug is not None
    url = public_url(opportunity.slug)
    key = f"event:{event.pk}"
    if IndexingNotification.objects.filter(idempotency_key=key).exists():
        return 0
    IndexingNotification.objects.filter(url=url, status__in=WAITING).update(status=Status.SUPERSEDED)
    try:
        with transaction.atomic():
            IndexingNotification.objects.create(
                idempotency_key=key,
                opportunity=opportunity,
                url=url,
                action=action,
                transition=event.transition,
            )
    except IntegrityError:  # a concurrent call wrote the same event
        return 0
    logger.info(
        "indexing notification queued",
        extra={"event": "indexing.queued", "action": action, "transition": event.transition},
    )
    return 1


# --- sending ---------------------------------------------------------------------------------------------
def quota_day(now: datetime) -> Any:
    return now.astimezone(QUOTA_ZONE).date()


def next_quota_day(now: datetime) -> datetime:
    local = now.astimezone(QUOTA_ZONE)
    midnight = datetime.combine(local.date() + timedelta(days=1), time(0, 5), tzinfo=QUOTA_ZONE)
    return midnight.astimezone(UTC)


def quota_used(now: datetime) -> int:
    row = IndexingQuotaDay.objects.filter(day=quota_day(now)).first()
    return row.used if row else 0


def _take_quota(now: datetime) -> bool:
    """Count one request against today's quota, atomically. False when the day's quota is spent."""
    limit = max(0, int(settings.UPNEXT_INDEXING_DAILY_QUOTA))
    day = quota_day(now)
    IndexingQuotaDay.objects.get_or_create(day=day)
    return bool(IndexingQuotaDay.objects.filter(day=day, used__lt=limit).update(used=F("used") + 1))


def _exhaust_quota(now: datetime) -> None:
    IndexingQuotaDay.objects.filter(day=quota_day(now)).update(
        used=max(0, int(settings.UPNEXT_INDEXING_DAILY_QUOTA))
    )


def _recover_stale_claims(now: datetime) -> None:
    """A row a crashed worker left in `sending` is due again (it may or may not have reached Google; sending
    the same notification twice is harmless)."""
    IndexingNotification.objects.filter(status=Status.SENDING, locked_at__lt=now - STALE_CLAIM).update(
        status=Status.FAILED, locked_at=None, locked_by=None, next_attempt_at=now, last_error="claim_expired"
    )


def _claim(worker: str, now: datetime, limit: int) -> list[IndexingNotification]:
    with transaction.atomic():
        rows = list(
            IndexingNotification.objects.select_for_update(skip_locked=True)
            .filter(status__in=WAITING, next_attempt_at__lte=now)
            .order_by("next_attempt_at", "created_at")[:limit]
        )
        ids = [r.pk for r in rows]
        IndexingNotification.objects.filter(pk__in=ids).update(
            status=Status.SENDING, locked_at=now, locked_by=worker, attempts=F("attempts") + 1
        )
    return list(IndexingNotification.objects.filter(pk__in=ids).order_by("next_attempt_at", "created_at"))


def _still_wanted(row: IndexingNotification, now: datetime) -> bool:
    if row.opportunity_id is None:
        return False
    opportunity = (
        Opportunity.objects.select_related("category", "live_version").filter(pk=row.opportunity_id).first()
    )
    if opportunity is None:
        return False
    live = opportunity.status == ListingStatus.PUBLISHED and (
        opportunity.live_version is not None
        and (opportunity.live_version.deadline_at is None or opportunity.live_version.deadline_at > now)
    )
    return live if row.action == Action.UPDATED else not live


def _finish(row: IndexingNotification, status: str, **fields: Any) -> None:
    for name, value in {"status": status, "locked_at": None, "locked_by": None, **fields}.items():
        setattr(row, name, value)
    row.save()


def _retry(row: IndexingNotification, now: datetime, code: str, http: int | None = None) -> str:
    if row.attempts >= MAX_ATTEMPTS:
        _finish(row, Status.DEAD, last_error=f"{code}; out of attempts", response_status=http)
        logger.error("indexing gave up", extra={"event": "indexing.dead", "code": code, "http": http})
        return Status.DEAD
    delay = BACKOFF_SECONDS[min(row.attempts - 1, len(BACKOFF_SECONDS) - 1)]
    jitter = random.uniform(0.8, 1.2)  # noqa: S311 - spreading retries, not security
    _finish(
        row,
        Status.FAILED,
        next_attempt_at=now + timedelta(seconds=delay * jitter),
        last_error=code,
        response_status=http,
    )
    return Status.FAILED


@dataclass
class Run:
    status: str  # off | record | skipped | credentials_error | token_error | ran
    counts: dict[str, int] = field(default_factory=dict)
    detail: str = ""


_clients: dict[str, google.Client] = {}


def _client(transport: google.Transport | None) -> google.Client:
    path = str(settings.UPNEXT_INDEXING_CREDENTIALS_FILE)
    if transport is not None:  # tests: a fresh client with recorded Google answers
        return google.Client(google.load_credentials(path), transport)
    if path not in _clients:
        _clients[path] = google.Client(google.load_credentials(path))
    return _clients[path]


def run(now: datetime | None = None, *, transport: google.Transport | None = None) -> Run:
    """Send what is due, within the quota. Safe to call every worker cycle; one run at a time."""
    if mode() != "live":
        return Run(mode())
    now = now or timezone.now()
    with job_lock(JOB_NAME) as acquired:
        if not acquired:
            return Run("skipped")
        try:
            client = _client(transport)
        except google.CredentialsError as exc:
            JobRun.record(JOB_NAME, ok=False, detail=exc.code)
            logger.error("indexing credentials", extra={"event": "indexing.credentials", "code": exc.code})
            return Run("credentials_error", detail=exc.code)
        result = _send_batch(client, now, f"worker-{os.getpid()}")
        JobRun.record(
            JOB_NAME,
            ok=result.status == "ran",
            detail=" ".join(f"{k}={v}" for k, v in sorted(result.counts.items())) or result.detail,
            started_at=now,
        )
        return result


def _send_batch(client: google.Client, now: datetime, worker: str) -> Run:
    counts: dict[str, int] = {}
    _recover_stale_claims(now)
    if not IndexingNotification.objects.filter(status__in=WAITING, next_attempt_at__lte=now).exists():
        return Run("ran", counts)
    try:  # one token for the batch, before any quota is spent
        client.token()
    except google.TokenError as exc:
        logger.error("indexing token", extra={"event": "indexing.token_failed", "code": exc.code})
        return Run("token_error", counts, exc.code)
    rows = _claim(worker, now, max(1, int(settings.UPNEXT_INDEXING_BATCH)))
    for index, row in enumerate(rows):
        if not _still_wanted(row, now):
            _finish(row, Status.SUPERSEDED, last_error="state_changed")
            counts["superseded"] = counts.get("superseded", 0) + 1
            continue
        if not _take_quota(now):
            _release(rows[index:], next_quota_day(now), "quota_exhausted")
            counts["deferred"] = counts.get("deferred", 0) + len(rows) - index
            break
        try:
            status = client.publish(row.url, row.action)
        except google.TokenError as exc:
            if exc.transient:
                _retry(row, now, exc.code)
            else:
                _release([row], now, exc.code)
            _release(rows[index + 1 :], now, "not_attempted")
            logger.error("indexing token", extra={"event": "indexing.token_failed", "code": exc.code})
            return Run("token_error", counts, exc.code)
        except OSError, TimeoutError:
            outcome = _retry(row, now, "network_error")
            counts[outcome] = counts.get(outcome, 0) + 1
            continue
        outcome = _record_answer(client, row, status, now)
        counts[outcome] = counts.get(outcome, 0) + 1
        if status == 429:
            _release(rows[index + 1 :], next_quota_day(now), "quota_exhausted")
            break
    return Run("ran", counts)


def _release(rows: list[IndexingNotification], when: datetime, code: str) -> None:
    """Put claimed rows back without counting the attempt against them."""
    for row in rows:
        row.refresh_from_db()
        if row.status == Status.SENDING:
            _finish(
                row, Status.FAILED, attempts=max(0, row.attempts - 1), next_attempt_at=when, last_error=code
            )


def _record_answer(client: google.Client, row: IndexingNotification, status: int, now: datetime) -> str:
    if status == 200:
        _finish(row, Status.SENT, sent_at=now, response_status=200, last_error="")
        logger.info("indexing sent", extra={"event": "indexing.sent", "action": row.action})
        return Status.SENT
    if status == 429:  # Google's quota for the day is spent, whatever our own count says
        _exhaust_quota(now)
        _finish(
            row,
            Status.FAILED,
            attempts=max(0, row.attempts - 1),
            next_attempt_at=next_quota_day(now),
            last_error="http_429",
            response_status=429,
        )
        logger.warning("indexing quota exhausted", extra={"event": "indexing.quota_exhausted"})
        return "deferred"
    if status == 401:  # the token expired or was revoked early: fetch a new one next time
        client.forget_token()
        return _retry(row, now, "http_401", 401)
    if status >= 500 or status == 408:
        return _retry(row, now, f"http_{status}", status)
    # 400 (malformed), 403 (the service account is not an owner of the Search Console property), 404, ...
    _finish(row, Status.DEAD, last_error=f"http_{status}", response_status=status)
    logger.error("indexing rejected", extra={"event": "indexing.rejected", "http": status})
    return Status.DEAD


def status_summary(now: datetime | None = None) -> dict[str, Any]:
    now = now or timezone.now()
    counts = {s: IndexingNotification.objects.filter(status=s).count() for s in Status.values}
    oldest = (
        IndexingNotification.objects.filter(status__in=WAITING)
        .order_by("created_at")
        .values_list("created_at", flat=True)
    ).first()
    recent_dead = IndexingNotification.objects.filter(
        status=Status.DEAD, updated_at__gte=now - timedelta(hours=24)
    ).count()
    return {
        "mode": mode(),
        "counts": counts,
        "quota_used_today": quota_used(now),
        "quota_limit": int(settings.UPNEXT_INDEXING_DAILY_QUOTA),
        "oldest_waiting_seconds": (now - oldest).total_seconds() if oldest else None,
        "dead_last_24h": recent_dead,
        "last_errors": list(
            IndexingNotification.objects.exclude(last_error="")
            .filter(Q(status=Status.DEAD) | Q(status=Status.FAILED))
            .order_by("-updated_at")
            .values_list("action", "url", "last_error")[:5]
        ),
    }
