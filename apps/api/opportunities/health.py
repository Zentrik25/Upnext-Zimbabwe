"""Content health and launch-target progress (P5-06): read-only counts for editors and administrators.

Everything here is a query over existing tables; nothing is written. `sod_violations` re-checks the
separation-of-duties rules after the fact (the database triggers already refuse violations; this proves
that none exist in the data, for example after an import or a restore).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.db import connection
from django.db.models import Count, Min, Q
from django.utils import timezone

from catalog.models import Category

from .models import (
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    VerificationLevel,
    VersionState,
)

UNKNOWN_DEADLINE_REVIEW_DAYS = 30


def _live(now: datetime) -> Any:
    """Published listings whose live revision is still open (no deadline, or one in the future)."""
    return OpportunityVersion.objects.filter(
        live_for__status=ListingStatus.PUBLISHED,
    ).filter(Q(deadline_at__isnull=True) | Q(deadline_at__gt=now))


def report(now: datetime | None = None) -> dict[str, Any]:
    now = now or timezone.now()
    live = _live(now)
    target_listings = int(getattr(settings, "UPNEXT_LAUNCH_TARGET_LISTINGS", 100))
    target_issuers = int(getattr(settings, "UPNEXT_LAUNCH_TARGET_ISSUERS", 30))
    categories = list(Category.objects.filter(active=True).order_by("code").values_list("code", "name"))
    per_category = dict(live.values_list("opportunity__category__code").annotate(n=Count("pk")))
    source_checked = live.filter(
        opportunity__verification_level__in=[
            VerificationLevel.SOURCE_CHECKED,
            VerificationLevel.ISSUER_VERIFIED,
        ]
    )
    issuers = live.values("organisation_id").distinct().count()
    soon = live.filter(deadline_at__lte=now + timedelta(days=7)).count()
    stale_unknown = live.filter(
        deadline_at__isnull=True,
        opportunity__first_published_at__lte=now - timedelta(days=UNKNOWN_DEADLINE_REVIEW_DAYS),
    ).count()
    pipeline = dict(
        Opportunity.objects.filter(
            status__in=[
                ListingStatus.DRAFT,
                ListingStatus.IN_REVIEW,
                ListingStatus.APPROVED,
                ListingStatus.REJECTED,
            ]
        )
        .values_list("status")
        .annotate(n=Count("pk"))
    )
    oldest_review = OpportunityVersion.objects.filter(state=VersionState.IN_REVIEW).aggregate(
        first=Min("submitted_at")
    )["first"]
    by_status = dict(Opportunity.objects.values_list("status").annotate(n=Count("pk")))
    live_total = live.count()
    covered = [code for code, _ in categories if per_category.get(code, 0) > 0]
    return {
        "generated_at": now.isoformat(),
        "target": {
            "listings": {
                "goal": target_listings,
                "current_source_checked": source_checked.count(),
                "current_live": live_total,
            },
            "issuers": {"goal": target_issuers, "have": issuers},
            "categories": {
                "goal": len(categories),
                "covered": len(covered),
                "missing": [c for c, _ in categories if c not in covered],
            },
            "met": source_checked.count() >= target_listings
            and issuers >= target_issuers
            and len(covered) == len(categories),
        },
        "live_per_category": {code: per_category.get(code, 0) for code, _ in categories},
        "listings_by_status": by_status,
        "pipeline": pipeline,
        "oldest_waiting_review_hours": None
        if oldest_review is None
        else round((now - oldest_review).total_seconds() / 3600, 1),
        "closing_within_7_days": soon,
        "unknown_deadline_over_30_days": stale_unknown,
        "live_not_verified": live_total - source_checked.count(),
        "sod_violations": sod_violations(),
    }


SOD_SQL = """
SELECT 'approved_by_author_or_submitter' AS rule, v.id
  FROM opportunities_opportunityversion v
 WHERE v.approved_by_id IS NOT NULL AND v.approved_by_id IN (SELECT upnext_chain_authors(v.id))
UNION ALL
SELECT 'review_by_author_or_submitter', d.version_id
  FROM opportunities_reviewdecision d
 WHERE d.decided_by_id IN (SELECT upnext_chain_authors(d.version_id))
UNION ALL
SELECT 'verification_by_author_or_submitter', r.version_id
  FROM opportunities_verificationrecord r
 WHERE r.checked_by_id IN (SELECT upnext_chain_authors(r.version_id))
UNION ALL
SELECT 'published_without_approval', v.id
  FROM opportunities_opportunityversion v
 WHERE v.state IN ('published', 'superseded') AND v.approved_by_id IS NULL
"""


def sod_violations() -> list[dict[str, str]]:
    """Rows that break separation of duties. Expected to be empty at all times."""
    with connection.cursor() as cur:
        cur.execute(SOD_SQL)
        return [{"rule": rule, "version_id": str(vid)} for rule, vid in cur.fetchall()]
