"""Anonymous, read-only catalogue endpoints (openapi tag `public`)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from django.conf import settings
from django.core.cache import caches
from django.db.models import Case, When
from django.http import HttpRequest, HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from access.drf import HasRequiredPermission
from access.registry import Permission
from catalog.models import Category, Location, Sector, Skill
from catalog.text import TextError, clean_single_line
from employers.models import EmployerProfile
from opportunities import public, social
from opportunities.models import OpportunityVersion

from .errors import error_response
from .public_serializers import (
    CategoryListSerializer,
    LocationListSerializer,
    OpportunityDetailSerializer,
    OpportunityListSerializer,
    SectorListSerializer,
    SitemapSerializer,
    SkillListSerializer,
)
from .throttles import PublicReadThrottle

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


def _money(low: Any, high: Any, currency: str | None, period: str | None) -> dict[str, Any] | None:
    if low is None and high is None:
        return None
    return {
        "min": None if low is None else f"{low:.2f}",
        "max": None if high is None else f"{high:.2f}",
        "currency": currency,
        "period": period,
    }


def summary_of(version: OpportunityVersion, now: datetime) -> dict[str, Any]:
    opportunity = version.opportunity
    locations = sorted(version.locations.all(), key=lambda r: (not r.is_primary, r.location.name))
    primary = next((s for s in version.sources.all() if s.is_primary), None)
    assert opportunity.first_published_at is not None
    assert opportunity.slug is not None
    return {
        "id": str(opportunity.pk),
        "slug": opportunity.slug,
        "title": version.title,
        "summary": version.summary,
        "category": {"code": opportunity.category.code, "name": opportunity.category.name},
        "organisation": {"id": str(version.organisation_id), "name": version.organisation.name},
        "locations": [
            {"slug": r.location.slug, "name": r.location.name, "is_primary": r.is_primary} for r in locations
        ],
        "work_mode": version.work_mode,
        "employment_type": version.employment_type,
        "deadline": {
            "at": _iso(version.deadline_at),
            "timezone": version.deadline_timezone,
            "is_date_only": version.deadline_is_date_only,
            "state": public.derive_deadline_state(version.deadline_at, now),
        },
        "salary": _money(
            version.salary_min, version.salary_max, version.salary_currency, version.salary_period
        ),
        "verification": {
            "level": opportunity.verification_level,
            "checked_at": _iso(opportunity.verification_checked_at),
        },
        "primary_source_name": primary.name if primary else None,
        "status": opportunity.status,
        "published_at": _iso(opportunity.first_published_at),
        "is_saved": None,  # anonymous callers; saved items arrive with accounts (Phase 4)
    }


def detail_of(version: OpportunityVersion, now: datetime) -> dict[str, Any]:
    opportunity = version.opportunity
    assert opportunity.last_published_at is not None
    out = summary_of(version, now)
    out["organisation"]["profile_slug"] = (
        EmployerProfile.objects.filter(
            organisation_id=version.organisation_id,
            live_revision__isnull=False,
            organisation__verifications__revoked_at__isnull=True,
        )
        .values_list("slug", flat=True)
        .first()
    )
    organisation = version.organisation
    out.update(social.resolved(version))
    out["organisation"]["website_url"] = organisation.website_url
    out["organisation"]["logo"] = organisation.logo_data
    out.update(
        {
            "description_html": public.render_html(version.description_md) or "",
            "responsibilities_html": public.render_html(version.responsibilities_md),
            "requirements_html": public.render_html(version.requirements_md),
            "seo_title": version.seo_title,
            "seo_description": version.seo_description,
            "geographic_eligibility": version.geographic_eligibility,
            "location_text": version.location_text,
            "experience_level": version.experience_level,
            "funding": _money(
                version.funding_min, version.funding_max, version.funding_currency, version.funding_period
            ),
            "skills": [
                {"name": r.skill.name, "is_required": r.is_required}
                for r in sorted(version.skills.all(), key=lambda r: (not r.is_required, r.skill.name))
            ],
            "sectors": [
                {"id": str(r.sector.pk), "slug": r.sector.slug, "name": r.sector.name}
                for r in sorted(version.sectors.all(), key=lambda r: r.sector.name)
            ],
            "reference_number": version.reference_number,
            "contact_details": version.contact_details,
            "application": {
                "method": version.application_method,
                "url": version.application_url,
                "email": version.application_email,
                "instructions": version.application_instructions,
            },
            "sources": [
                {
                    "kind": s.kind,
                    "name": s.name,
                    "url": s.url,
                    "citation": s.citation,
                    "observed_on": s.observed_on.isoformat(),
                    "is_primary": s.is_primary,
                }
                for s in sorted(version.sources.all(), key=lambda s: (not s.is_primary, s.name))
            ],
            "detail": version.detail,
            "detail_schema_version": version.detail_schema_version,
            "canonical_path": f"/opportunities/{opportunity.slug}",
            "updated_at": _iso(opportunity.last_published_at),
        }
    )
    return out


@method_decorator(never_cache, name="dispatch")
class PublicView(APIView):
    """Base: no session lookup, public permission only, per-IP throttle."""

    authentication_classes: list[Any] = []
    permission_classes = [HasRequiredPermission]
    required_permission = Permission.OPP_READ_PUBLIC
    throttle_classes = [PublicReadThrottle]


def _query_error(exc: public.InvalidQuery) -> Response:
    message = "The cursor is invalid." if exc.code == "invalid_cursor" else "A query parameter is not valid."
    return error_response(
        exc.code,
        message,
        status.HTTP_400_BAD_REQUEST,
        {exc.param: [{"code": exc.code, "message": exc.message}]},
    )


_LIST_PARAMS = [
    OpenApiParameter("q", str, description="Search words (1-100 characters)."),
    OpenApiParameter("category", str, description="Comma-separated category codes (max 10)."),
    OpenApiParameter("location", str, description="Comma-separated location slugs (max 10)."),
    OpenApiParameter("work_mode", str),
    OpenApiParameter("employment_type", str),
    OpenApiParameter("experience_level", str),
    OpenApiParameter("deadline_state", str),
    OpenApiParameter("organisation_id", str),
    OpenApiParameter("posted_within_days", int),
    OpenApiParameter("include_expired", bool),
    OpenApiParameter("sort", str, enum=list(public.SORTS)),
    OpenApiParameter("limit", int),
    OpenApiParameter("cursor", str),
]


class OpportunityListView(PublicView):
    @extend_schema(
        operation_id="listOpportunities",
        tags=["public"],
        parameters=_LIST_PARAMS,
        responses={
            200: OpportunityListSerializer,
            400: OpenApiResponse(description="invalid_filter or invalid_cursor"),
            429: OpenApiResponse(description="rate_limited"),
        },
    )
    def get(self, request: Request) -> Response:
        try:
            query = public.parse_query(request.query_params)
            page = public.search(query)
        except public.InvalidQuery as exc:
            return _query_error(exc)
        now = timezone.now()
        return Response(
            {
                "data": [summary_of(v, now) for v in page.items],
                "page": {
                    "limit": query.limit,
                    "has_more": page.has_more,
                    "next_cursor": page.next_cursor,
                    "total": page.total,
                },
            }
        )


class OpportunityDetailView(PublicView):
    @extend_schema(
        operation_id="getOpportunity",
        tags=["public"],
        responses={
            200: OpportunityDetailSerializer,
            301: OpenApiResponse(description="moved: the listing has a new address"),
            404: OpenApiResponse(description="not_found"),
            429: OpenApiResponse(description="rate_limited"),
        },
    )
    def get(self, request: Request, slug: str) -> Response:
        if not 8 <= len(slug) <= 80 or not SLUG_RE.match(slug.lower()):
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        version = public.get_detail(slug)
        if version is None:
            moved = public.moved_to(slug)
            if moved is not None:  # an address the listing used to have (D-47): permanent redirect
                response = Response(
                    {"error": {"code": "moved", "message": "This listing has a new address."}, "slug": moved},
                    status=status.HTTP_301_MOVED_PERMANENTLY,
                )
                response["Location"] = f"/api/v1/opportunities/{moved}"
                return response
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        return Response(detail_of(version, timezone.now()))


class SitemapView(PublicView):
    """Slugs of the listings that belong in the XML sitemap (the web app renders the file)."""

    @extend_schema(
        operation_id="getSitemapEntries",
        tags=["public"],
        responses={200: SitemapSerializer, 429: OpenApiResponse(description="rate_limited")},
    )
    def get(self, request: Request) -> Response:
        ttl = settings.UPNEXT_SITEMAP_API_CACHE_SECONDS
        payload = caches["local"].get("sitemap-feed") if ttl else None
        if payload is None:
            entries = public.sitemap_entries(timezone.now())
            payload = {"data": [{"slug": slug, "updated_at": _iso(stamp)} for slug, stamp in entries]}
            if ttl:
                caches["local"].set(
                    "sitemap-feed", payload, ttl
                )  # a few minutes of staleness; pages say noindex themselves
        return Response(payload)


class CategoryListView(PublicView):
    @extend_schema(operation_id="listCategories", tags=["public"], responses={200: CategoryListSerializer})
    def get(self, request: Request) -> Response:
        rows = Category.objects.filter(active=True).order_by("sort_order", "code")
        return Response({"data": [{"code": c.code, "name": c.name} for c in rows]})


class LocationListView(PublicView):
    @extend_schema(operation_id="listLocations", tags=["public"], responses={200: LocationListSerializer})
    def get(self, request: Request) -> Response:
        rows = Location.objects.filter(active=True).select_related("parent").order_by("kind", "name")
        return Response(
            {
                "data": [
                    {
                        "id": str(loc.pk),
                        "slug": loc.slug,
                        "name": loc.name,
                        "kind": loc.kind,
                        "parent_slug": loc.parent.slug if loc.parent else None,
                    }
                    for loc in rows
                ]
            }
        )


class SectorListView(PublicView):
    @extend_schema(operation_id="listSectors", tags=["public"], responses={200: SectorListSerializer})
    def get(self, request: Request) -> Response:
        rows = Sector.objects.filter(active=True).order_by("name")
        return Response({"data": [{"id": str(s.pk), "slug": s.slug, "name": s.name} for s in rows]})


class SkillSearchView(PublicView):
    @extend_schema(
        operation_id="searchSkills",
        tags=["public"],
        parameters=[OpenApiParameter("q", str, required=True), OpenApiParameter("limit", int)],
        responses={200: SkillListSerializer, 400: OpenApiResponse(description="invalid_filter")},
    )
    def get(self, request: Request) -> Response:
        for name in request.query_params:
            if name not in {"q", "limit"}:
                return _query_error(public.InvalidQuery(name, "Unknown parameter."))
        try:
            term = clean_single_line(request.query_params.get("q", ""))
        except TextError:
            return _query_error(public.InvalidQuery("q", "Contains invalid characters."))
        if not 2 <= len(term) <= 50:
            return _query_error(public.InvalidQuery("q", "Use 2-50 characters."))
        raw_limit = request.query_params.get("limit", "10")
        if not re.fullmatch(r"\d{1,2}", raw_limit) or not 1 <= int(raw_limit) <= 20:
            return _query_error(public.InvalidQuery("limit", "Use a whole number from 1 to 20."))
        needle = term.casefold()
        rows = (
            Skill.objects.filter(active=True, status="approved", name_normalized__contains=needle)
            .annotate(prefix_rank=Case(When(name_normalized__startswith=needle, then=0), default=1))
            .order_by("prefix_rank", "name")[: int(raw_limit)]
        )
        return Response({"data": [{"id": str(s.pk), "name": s.name} for s in rows]})


@require_safe
def media_view(request: HttpRequest, name: str) -> HttpResponse:
    """A listing image by content hash (D-47). Public and unauthenticated so social crawlers can fetch it, but
    only while a publicly readable listing shows it: nothing from a draft, a rejected or an archived listing,
    and no other stored media, is reachable. Content-addressed, so it is cacheable for good."""
    sha, _, extension = name.partition(".")
    if not re.fullmatch(r"[0-9a-f]{64}", sha) or extension not in ("jpg", "png"):
        return HttpResponse(status=404)
    asset = public.public_asset(sha)
    if asset is None or asset.extension != extension:
        return HttpResponse(status=404)
    if request.headers.get("If-None-Match") == f'"{sha}"':
        response = HttpResponse(status=304)
    else:
        data = bytes(asset.data)
        response = HttpResponse(data if request.method == "GET" else b"", content_type=asset.content_type)
        response["Content-Length"] = str(len(data))
    response["ETag"] = f'"{sha}"'
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = "inline"
    response["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response
