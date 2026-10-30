"""Read-only data for the staff dashboard, the bell menu and the sidebar counts (served by `api.staff_views`).

Nothing here writes anything. Every figure is a query over existing tables, scoped to what the signed-in staff
member may already see in the staff site: the listing scope is `opportunities.admin.listings_visible_to` (the
same definition the list uses), review counts exclude what the person authored or submitted
(`awaiting_review`), and a count is only produced for someone who holds the permission that makes it
actionable. A hidden button is not authorisation: every link target re-checks on the server.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from django.db.models import Count, Q
from django.utils import timezone

from access.registry import Permission
from employers.models import ClaimStatus, OrganisationClaim, ProfileRevision, ProfileState
from opportunities.models import (
    ListingStatus,
    OpportunityVersion,
    PublishingEvent,
    VersionState,
)
from opportunities.staff import (
    TRANSITION_LABELS,
    awaiting_review,
    listings_scope,
    listings_visible_to,
)
from reports.models import OPEN_STATUSES, ListingReport

if TYPE_CHECKING:
    from accounts.models import User

CLOSING_DAYS = 7
LATEST_ROWS = 6
ACTIVITY_ROWS = 6


@dataclass(frozen=True)
class Kpi:
    key: str
    label: str
    value: int
    note: str
    icon: str


@dataclass(frozen=True)
class Attention:
    key: str
    label: str
    count: int
    icon: str
    actionable: bool  # counts towards the bell; "closing soon" is information, not a task


@dataclass(frozen=True)
class Activity:
    opportunity_id: str
    subject: str
    verb: str
    actor: str
    when: datetime


def kpis(user: User, now: datetime | None = None) -> list[Kpi]:
    """One aggregate query. Total, Published, Drafts and Expired use `Opportunity.status`, so the three status
    cards never count a listing twice; "closing within 7 days" is the part of Published whose live revision
    has a deadline in the next seven days (the list's deadline filter uses the same rule)."""
    now = now or timezone.now()
    soon = now + timedelta(days=CLOSING_DAYS)
    published = Q(status=ListingStatus.PUBLISHED)
    counts = listings_scope(user).aggregate(
        total=Count("pk"),
        published=Count("pk", filter=published),
        drafts=Count("pk", filter=Q(status=ListingStatus.DRAFT)),
        expired=Count("pk", filter=Q(status=ListingStatus.EXPIRED)),
        closing=Count(
            "pk",
            filter=published & Q(live_version__deadline_at__gt=now, live_version__deadline_at__lte=soon),
        ),
    )
    return [
        Kpi("total", "Total opportunities", counts["total"], "Listings you can see", "briefcase"),
        Kpi(
            "published",
            "Published",
            counts["published"],
            "Live on site",
            "send",
        ),
        Kpi(
            "closing",
            "Closing within 7 days",
            counts["closing"],
            "Needs attention",
            "clock",
        ),
        Kpi("drafts", "Drafts", counts["drafts"], "Not submitted", "file"),
        Kpi(
            "expired",
            "Expired",
            counts["expired"],
            "No longer open",
            "archive",
        ),
    ]


def attention(user: User, now: datetime | None = None) -> list[Attention]:
    """The "needs attention" rows this person may act on. A row appears only if they hold the permission that
    makes it actionable, so a contributor never sees a review count and nobody sees their own work as review
    work."""
    now = now or timezone.now()
    rows: list[Attention] = []
    visible = listings_visible_to(user)

    if user.has_permission_code(Permission.OPP_REVIEW_APPROVE):
        rows.append(
            Attention(
                "review",
                "Awaiting your review",
                awaiting_review(visible, user).count(),
                "inbox",
                True,
            )
        )
    if user.has_permission_code(Permission.OPP_PUBLISH):
        rows.append(
            Attention(
                "ready",
                "Approved, ready to publish",
                visible.filter(pending_version__state=VersionState.APPROVED).count(),
                "send",
                True,
            )
        )
    if user.has_permission_code(Permission.EMPLOYER_REVIEW):
        claims = OrganisationClaim.objects.filter(status=ClaimStatus.PENDING).count()
        profiles = ProfileRevision.objects.filter(state=ProfileState.PENDING).count()
        rows.append(Attention("employers", "Employer submissions", claims + profiles, "users", True))
    if user.has_permission_code(Permission.REPORT_READ):
        rows.append(
            Attention(
                "reports",
                "Reports to check",
                ListingReport.objects.filter(status__in=OPEN_STATUSES).count(),
                "flag",
                True,
            )
        )
    if user.has_permission_code(Permission.OPP_DRAFT_CREATE):
        rows.append(
            Attention(
                "mine",
                "Your drafts and rejected items",
                visible.filter(
                    pending_version__author=user,
                    pending_version__state__in=[VersionState.DRAFT, VersionState.REJECTED],
                ).count(),
                "file",
                True,
            )
        )
    closing = visible.filter(
        status=ListingStatus.PUBLISHED,
        live_version__deadline_at__gt=now,
        live_version__deadline_at__lte=now + timedelta(days=CLOSING_DAYS),
    ).count()
    rows.append(
        Attention(
            "closing",
            "Opportunities closing within 7 days",
            closing,
            "clock",
            False,
        )
    )
    return rows


def _title(version: OpportunityVersion | None) -> str:
    return (version.title if version and version.title else "") or "Untitled draft"


def recent_activity(user: User, limit: int = ACTIVITY_ROWS) -> list[Activity]:
    """The latest workflow transitions on listings this person can see (the typed history written with every
    audit event); nothing is invented, and an Administrator reads the full audit log from the sidebar."""
    visible_ids = listings_scope(user).values("pk")
    events = (
        PublishingEvent.objects.filter(opportunity__in=visible_ids)
        .select_related("version", "actor", "opportunity")
        .order_by("-occurred_at")[:limit]
    )
    rows = []
    for event in events:
        who = event.actor.display_name if event.actor is not None else "System"
        rows.append(
            Activity(
                opportunity_id=str(event.opportunity_id),
                subject=_title(event.version),
                verb=TRANSITION_LABELS.get(event.transition, event.to_status.replace("_", " ")),
                actor=who,
                when=event.occurred_at,
            )
        )
    return rows


def primary_location(version: OpportunityVersion | None) -> str:
    """The primary place of a revision, from prefetched rows when the caller prefetched them."""
    if version is None:
        return "-"
    rows = list(version.locations.all())
    chosen = next((r for r in rows if r.is_primary), rows[0] if rows else None)
    if chosen is not None:
        return chosen.location.name
    return version.location_text or "-"
