"""Anonymous read access to published opportunities (VALIDATION_SPEC §9, P2-01).

Every public endpoint reads through `visible_versions`, the single place that decides what may leave the
system: only a listing's *live, published* revision, and only while the listing is `published` (or, for
detail pages and `include_expired`, `expired`/`withdrawn` per P2-01). Drafts, reviews, rejections,
approvals, archived/taken-down listings and unpublished amendments cannot be reached through it.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from django.contrib.postgres.search import SearchQuery, SearchRank
from django.core import signing
from django.db.models import F, FloatField, Q, QuerySet
from django.db.models.functions import Cast
from django.http import QueryDict
from django.utils import timezone

from catalog import markdown
from catalog.models import Category, Location
from catalog.text import TextError, clean_single_line

from .models import (
    EmploymentType,
    ExperienceLevel,
    ListingStatus,
    OpportunityVersion,
    VersionState,
    WorkMode,
)

CLOSING_SOON_DAYS = 7  # PROPOSED window (VALIDATION_SPEC §9)
MAX_LIST = 10
DEFAULT_LIMIT, MAX_LIMIT = 20, 50
SORTS = ("relevance", "newest", "closing_soon")
DEADLINE_STATES = ("open", "closing_soon", "unknown", "expired")
KNOWN_PARAMS = frozenset(
    {
        "q", "category", "location", "work_mode", "employment_type", "experience_level", "deadline_state",
        "organisation_id", "posted_within_days", "include_expired", "sort", "limit", "cursor",
    }
)  # fmt: skip
_CURSOR_SALT = "upnext.cursor.v1"


class InvalidQuery(Exception):
    """A rejected query parameter: `code` is `invalid_filter` or `invalid_cursor`."""

    def __init__(self, param: str, message: str, code: str = "invalid_filter") -> None:
        super().__init__(message)
        self.param, self.message, self.code = param, message, code


@dataclass(frozen=True)
class Query:
    q: str | None = None
    categories: tuple[str, ...] = ()
    locations: tuple[str, ...] = ()
    work_modes: tuple[str, ...] = ()
    employment_types: tuple[str, ...] = ()
    experience_levels: tuple[str, ...] = ()
    deadline_states: tuple[str, ...] = ()
    organisation_id: uuid.UUID | None = None
    posted_within_days: int | None = None
    include_expired: bool = False
    sort: str = "newest"
    limit: int = DEFAULT_LIMIT
    cursor: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def fingerprint(self) -> str:
        """Binds a cursor to the sort and filters it was issued for (tampering/mixing is rejected)."""
        data = {k: getattr(self, k) for k in (
            "q", "categories", "locations", "work_modes", "employment_types", "experience_levels",
            "deadline_states", "organisation_id", "posted_within_days", "include_expired", "sort",
        )}  # fmt: skip
        return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _csv(params: QueryDict, name: str, allowed: set[str] | None = None) -> tuple[str, ...]:
    raw = params.get(name)
    if raw is None:
        return ()
    values = [v.strip() for v in raw.split(",")]
    if not raw.strip() or any(not v for v in values):
        raise InvalidQuery(name, "Give one or more comma-separated values.")
    if len(values) > MAX_LIST:
        raise InvalidQuery(name, f"At most {MAX_LIST} values.")
    if allowed is not None:
        bad = [v for v in values if v not in allowed]
        if bad:
            raise InvalidQuery(name, f"Unknown value: {bad[0][:40]}.")
    return tuple(dict.fromkeys(values))


def parse_query(params: QueryDict) -> Query:
    for name in params:
        if name not in KNOWN_PARAMS:
            raise InvalidQuery(name, "Unknown parameter.")
        if len(params.getlist(name)) > 1:
            raise InvalidQuery(name, "Give this parameter once.")
    q: str | None = None
    if (raw_q := params.get("q")) is not None:
        try:
            q = clean_single_line(raw_q)
        except TextError:
            raise InvalidQuery("q", "Contains invalid characters.") from None
        if not 1 <= len(q) <= 100:
            raise InvalidQuery("q", "Use 1-100 characters.")
    category_codes = set(Category.objects.filter(active=True).values_list("code", flat=True))
    categories = _csv(params, "category", category_codes)
    locations = _csv(params, "location")
    if locations:
        known = set(Location.objects.filter(active=True, slug__in=locations).values_list("slug", flat=True))
        unknown = [s for s in locations if s not in known]
        if unknown:
            raise InvalidQuery("location", f"Unknown location: {unknown[0][:40]}.")
    organisation_id = None
    if (raw_org := params.get("organisation_id")) is not None:
        try:
            organisation_id = uuid.UUID(raw_org)
        except ValueError:
            raise InvalidQuery("organisation_id", "Not a valid identifier.") from None
    posted = None
    if (raw_days := params.get("posted_within_days")) is not None:
        if not re.fullmatch(r"\d{1,3}", raw_days) or not 1 <= int(raw_days) <= 365:
            raise InvalidQuery("posted_within_days", "Use a whole number from 1 to 365.")
        posted = int(raw_days)
    include_expired = False
    if (raw_inc := params.get("include_expired")) is not None:
        if raw_inc not in ("true", "false"):
            raise InvalidQuery("include_expired", "Use true or false.")
        include_expired = raw_inc == "true"
    sort = params.get("sort") or ("relevance" if q else "newest")
    if sort not in SORTS:
        raise InvalidQuery("sort", f"Use one of: {', '.join(SORTS)}.")
    if sort == "relevance" and not q:
        raise InvalidQuery("sort", "Relevance sorting needs a search term.")
    limit = DEFAULT_LIMIT
    if (raw_limit := params.get("limit")) is not None:
        if not re.fullmatch(r"\d{1,3}", raw_limit) or not 1 <= int(raw_limit) <= MAX_LIMIT:
            raise InvalidQuery("limit", f"Use a whole number from 1 to {MAX_LIMIT}.")
        limit = int(raw_limit)
    cursor = params.get("cursor")
    if cursor is not None and not 1 <= len(cursor) <= 512:
        raise InvalidQuery("cursor", "Invalid cursor.", "invalid_cursor")
    return Query(
        q=q, categories=categories, locations=locations,
        work_modes=_csv(params, "work_mode", set(WorkMode.values)),
        employment_types=_csv(params, "employment_type", set(EmploymentType.values)),
        experience_levels=_csv(params, "experience_level", set(ExperienceLevel.values)),
        deadline_states=_csv(params, "deadline_state", set(DEADLINE_STATES)),
        organisation_id=organisation_id, posted_within_days=posted, include_expired=include_expired,
        sort=sort, limit=limit, cursor=cursor,
    )  # fmt: skip


def visible_versions(*, detail: bool = False, include_expired: bool = False) -> QuerySet[OpportunityVersion]:
    """The only entry point to public data (see the module docstring)."""
    if detail:
        statuses = [ListingStatus.PUBLISHED, ListingStatus.EXPIRED, ListingStatus.WITHDRAWN]
    elif include_expired:
        statuses = [ListingStatus.PUBLISHED, ListingStatus.EXPIRED]
    else:
        statuses = [ListingStatus.PUBLISHED]
    return OpportunityVersion.objects.filter(
        state=VersionState.PUBLISHED,
        live_for__status__in=statuses,  # joins on live_version_id only: also means "is the live revision"
    ).select_related("opportunity", "opportunity__category", "organisation")


# Under the protocol's 50,000-URL file limit, leaving room for the static and category addresses.
SITEMAP_LIMIT = 49000


def sitemap_entries(now: datetime) -> list[tuple[str, datetime]]:
    """(slug, last published) for every listing that is open for browsing, in a stable order. Closed,
    withdrawn and archived listings are left out (P4-03); a listing whose deadline passed is left out even
    before the expiry job has run, as in the default list."""
    rows = (
        visible_versions()
        .filter(Q(deadline_at__isnull=True) | Q(deadline_at__gt=now))
        .order_by("opportunity__slug")
        .values_list("opportunity__slug", "opportunity__last_published_at")[:SITEMAP_LIMIT]
    )
    return [(slug, stamp) for slug, stamp in rows if slug and stamp]


def derive_deadline_state(deadline_at: datetime | None, now: datetime) -> str:
    if deadline_at is None:
        return "unknown"
    if deadline_at <= now:
        return "expired"
    if deadline_at <= now + timedelta(days=CLOSING_SOON_DAYS):
        return "closing_soon"
    return "open"


def _filtered(query: Query, now: datetime) -> QuerySet[OpportunityVersion]:
    include_expired = query.include_expired or "expired" in query.deadline_states
    qs = visible_versions(include_expired=include_expired)
    if not include_expired:
        # A listing whose deadline passed is not "live" for browsing even if the expiry job has not run.
        qs = qs.filter(Q(deadline_at__isnull=True) | Q(deadline_at__gt=now))
    if query.categories:
        qs = qs.filter(opportunity__category__code__in=query.categories)
    if query.locations:
        wanted = Location.objects.filter(
            Q(slug__in=query.locations)
            | Q(parent__slug__in=query.locations)
            | Q(parent__parent__slug__in=query.locations)
        ).values("pk")
        qs = qs.filter(locations__location__in=wanted).distinct()
    if query.work_modes:
        qs = qs.filter(work_mode__in=query.work_modes)
    if query.employment_types:
        qs = qs.filter(employment_type__in=query.employment_types)
    if query.experience_levels:
        qs = qs.filter(experience_level__in=query.experience_levels)
    if query.organisation_id:
        qs = qs.filter(organisation_id=query.organisation_id)
    if query.posted_within_days:
        qs = qs.filter(opportunity__first_published_at__gte=now - timedelta(days=query.posted_within_days))
    if query.deadline_states:
        soon = now + timedelta(days=CLOSING_SOON_DAYS)
        clauses = {
            "unknown": Q(deadline_at__isnull=True),
            "expired": Q(deadline_at__lte=now),
            "closing_soon": Q(deadline_at__gt=now, deadline_at__lte=soon),
            "open": Q(deadline_at__gt=soon),
        }
        combined = Q()
        for state in query.deadline_states:
            combined |= clauses[state]
        qs = qs.filter(combined)
    return qs


@dataclass
class Page:
    items: Sequence[OpportunityVersion]
    has_more: bool
    next_cursor: str | None
    total: int | None


def _encode(query: Query, key: list[Any]) -> str:
    return signing.dumps({"f": query.fingerprint(), "k": key}, salt=_CURSOR_SALT, compress=True)


def _decode(query: Query) -> list[Any]:
    assert query.cursor is not None
    try:
        payload = signing.loads(query.cursor, salt=_CURSOR_SALT, max_age=60 * 60 * 24)
        key = payload["k"]
        if payload["f"] != query.fingerprint() or not isinstance(key, list):
            raise ValueError
    except signing.BadSignature, ValueError, KeyError, TypeError:
        raise InvalidQuery("cursor", "Invalid cursor.", "invalid_cursor") from None
    return key


def _newest_key(row: Any) -> list[Any]:
    return [row.k0.isoformat(), row.opportunity.slug]


def _closing_key(row: Any) -> list[Any]:
    return [
        0 if row.deadline_at else 1,
        row.deadline_at.isoformat() if row.deadline_at else None,
        str(row.pk),
    ]


def _relevance_key(row: Any) -> list[Any]:
    return [row.k0, str(row.pk)]


def search(query: Query, now: datetime | None = None) -> Page:
    now = now or timezone.now()
    key_of: Callable[[Any], list[Any]]
    qs = _filtered(query, now)
    after: list[Any] | None = _decode(query) if query.cursor else None
    total = qs.count() if after is None else None

    if query.sort == "newest":
        # Ordered by columns of the listing row so PostgreSQL can walk `opp_public_newest_idx` and stop after
        # one page instead of sorting every live listing (found with synthetic data, see PHASE4_REPORT).
        qs = qs.annotate(k0=F("live_for__first_published_at")).order_by("-k0", "-live_for__slug")
        if after:
            cut = datetime.fromisoformat(after[0])
            qs = qs.filter(Q(k0__lt=cut) | Q(k0=cut, live_for__slug__lt=str(after[1])))
        key_of = _newest_key
    elif query.sort == "closing_soon":
        # Earliest deadline first, listings without a deadline last. Ordering by the plain column (nulls last)
        # lets PostgreSQL walk `ver_deadline_id_idx` instead of sorting every live listing.
        qs = qs.order_by(F("deadline_at").asc(nulls_last=True), "id")
        if after:
            flag, deadline, ident = after[0], after[1], uuid.UUID(after[2])
            if flag == 1:
                qs = qs.filter(deadline_at__isnull=True, id__gt=ident)
            else:
                cut = datetime.fromisoformat(deadline)
                qs = qs.filter(
                    Q(deadline_at__isnull=True) | Q(deadline_at__gt=cut) | Q(deadline_at=cut, id__gt=ident)
                )
        key_of = _closing_key
    else:  # relevance
        assert query.q
        search_query = SearchQuery(query.q, search_type="websearch", config="english")
        qs = (
            qs.filter(search_vector=search_query)
            .annotate(k0=Cast(SearchRank(F("search_vector"), search_query), FloatField()))
            .order_by("-k0", "id")
        )
        if after:
            rank, ident = float(after[0]), uuid.UUID(after[1])
            qs = qs.filter(Q(k0__lt=rank) | Q(k0=rank, id__gt=ident))
        key_of = _relevance_key
        if after is None:
            total = qs.count()

    rows = list(qs.prefetch_related("locations__location", "sources")[: query.limit + 1])
    has_more = len(rows) > query.limit
    items = rows[: query.limit]
    next_cursor = _encode(query, key_of(items[-1])) if has_more and items else None
    return Page(items=items, has_more=has_more, next_cursor=next_cursor, total=total)


def get_detail(slug: str) -> OpportunityVersion | None:
    return (
        visible_versions(detail=True)
        .filter(opportunity__slug=slug.lower())
        .prefetch_related("locations__location", "skills__skill", "sectors__sector", "sources")
        .first()
    )


def render_html(markdown_source: str | None) -> str | None:
    return markdown.render(markdown_source) if markdown_source else None
