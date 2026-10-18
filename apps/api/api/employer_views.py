"""Employer portal endpoints (openapi tag `employer`, Phase 6A, D-35) and the two public ones it feeds
(company profile page, listing counters).

Every employer endpoint needs a signed-in, active account and resolves ids **through the caller's own
memberships**: an id belonging to someone else answers 404, so existence is not revealed. All transitions go
through `employers.services`, `employers.listings` and the publishing service, which decide and audit; nothing
here grants authority.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, cast

from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from catalog.models import Organisation, Sector
from catalog.text import TextError, clean_single_line
from employers import analytics, listings, services
from employers.models import (
    EmployerListing,
    EmployerMembership,
    EmployerProfile,
    OrganisationClaim,
    OrganisationVerification,
    ProfileRevision,
    ProfileState,
    SizeBand,
)
from opportunities.errors import FieldErrors, WorkflowError
from opportunities.models import ListingStatus, Opportunity, OpportunityVersion

from .errors import error_response
from .public_views import PublicView, _iso
from .throttles import IpRateThrottle, UserWriteThrottle

MAX_EVENT_BODY = 512


def _fields(errors: FieldErrors) -> dict[str, list[dict[str, str]]]:
    return {path: [{"code": c, "message": m} for c, m in items] for path, items in errors.items()}


def _refused(exc: WorkflowError) -> Response:
    return error_response(exc.code, exc.message, exc.http_status, _fields(exc.fields) if exc.fields else None)


def _body(request: Request) -> dict[str, Any] | None:
    data = request.data
    return dict(data) if isinstance(data, dict) else None


def _bad_body() -> Response:
    return error_response("validation_failed", "The request body must be a JSON object.", 400)


@method_decorator(never_cache, name="dispatch")
class EmployerView(APIView):
    """Signed-in accounts only; writes are throttled per user."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [UserWriteThrottle]

    def get_throttles(self) -> list[Any]:
        return super().get_throttles() if self.request.method not in ("GET", "HEAD", "OPTIONS") else []

    @staticmethod
    def user_of(request: Request) -> User:
        return cast(User, request.user)

    def membership(self, request: Request, organisation_id: uuid.UUID) -> EmployerMembership | None:
        return services.active_membership(self.user_of(request), organisation_id)


def _not_found() -> Response:
    return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)


# --- shapes ---
def _claim(claim: OrganisationClaim) -> dict[str, Any]:
    return {
        "id": str(claim.pk),
        "organisation_name": claim.organisation_name,
        "organisation_id": str(claim.organisation_id) if claim.organisation_id else None,
        "status": claim.status,
        "role_title": claim.role_title,
        "created_at": _iso(claim.created_at),
        "decided_at": _iso(claim.decided_at),
        "decision_reason": claim.decision_reason if claim.status == "rejected" else None,
    }


def _revision(revision: ProfileRevision | None) -> dict[str, Any] | None:
    if revision is None:
        return None
    return {
        "id": str(revision.pk),
        "version_no": revision.version_no,
        "state": revision.state,
        "tagline": revision.tagline,
        "about": revision.about,
        "sector": {"id": str(revision.sector_id), "name": revision.sector.name} if revision.sector else None,
        "size_band": revision.size_band,
        "founded_year": revision.founded_year,
        "location_text": revision.location_text,
        "submitted_at": _iso(revision.submitted_at),
        "decided_at": _iso(revision.decided_at),
        "decision_reason": revision.decision_reason if revision.state == ProfileState.REJECTED else None,
    }


def _locations(version: OpportunityVersion) -> list[dict[str, Any]]:
    return [
        {
            "location_id": str(r.location_id),
            "slug": r.location.slug,
            "name": r.location.name,
            "is_primary": r.is_primary,
        }
        for r in sorted(version.locations.all(), key=lambda r: (not r.is_primary, r.location.name))
    ]


def _money(low: Any, high: Any, currency: str | None, period: str | None) -> dict[str, Any] | None:
    if low is None and high is None:
        return None
    return {
        "min": None if low is None else f"{low:.2f}",
        "max": None if high is None else f"{high:.2f}",
        "currency": currency,
        "period": period,
    }


def _content(version: OpportunityVersion) -> dict[str, Any]:
    return {
        "title": version.title,
        "summary": version.summary,
        "description_md": version.description_md,
        "requirements_md": version.requirements_md,
        "locations": _locations(version),
        "location_text": version.location_text,
        "work_mode": version.work_mode,
        "employment_type": version.employment_type,
        "experience_level": version.experience_level,
        "salary": _money(
            version.salary_min, version.salary_max, version.salary_currency, version.salary_period
        ),
        "deadline_at": _iso(version.deadline_at),
        "deadline_timezone": version.deadline_timezone,
        "deadline_is_date_only": version.deadline_is_date_only,
        "application_method": version.application_method,
        "application_url": version.application_url,
        "application_email": version.application_email,
        "application_instructions": version.application_instructions,
        "reference_number": version.reference_number,
        "detail": version.detail,
    }


def _listing_row(user: User, opportunity: Opportunity) -> dict[str, Any]:
    version = opportunity.pending_version or opportunity.live_version
    assert version is not None
    return {
        "id": str(opportunity.pk),
        "title": version.title or "Untitled draft",
        "category": {"code": opportunity.category.code, "name": opportunity.category.name},
        "status": opportunity.status,
        "version_state": version.state,
        "row_version": opportunity.row_version,
        "slug": opportunity.slug,
        "updated_at": _iso(opportunity.updated_at),
        "decision": listings.latest_decision(opportunity.pending_version),
        "next_actions": listings.next_actions(user, opportunity),
    }


def _listing_detail(user: User, opportunity: Opportunity) -> dict[str, Any]:
    version = opportunity.pending_version or opportunity.live_version
    assert version is not None
    binding = opportunity.employer_binding
    return {
        **_listing_row(user, opportunity),
        "organisation": {"id": str(binding.organisation_id), "name": binding.organisation.name},
        "version_no": version.version_no,
        "authored_by_you": version.author_id == user.pk,
        "content": _content(version),
        "has_live_version": opportunity.live_version_id is not None,
        "public_path": f"/opportunities/{opportunity.slug}" if opportunity.slug else None,
    }


def _own_listing(user: User, opportunity_id: uuid.UUID) -> Opportunity | None:
    try:
        binding = listings.member_listing(user, opportunity_id)
    except WorkflowError:
        return None
    return Opportunity.objects.select_related(
        "category", "pending_version", "live_version", "employer_binding__organisation"
    ).get(pk=binding.opportunity_id)


# --- overview, search, claims ---
class OverviewView(EmployerView):
    @extend_schema(
        operation_id="getEmployerOverview",
        tags=["employer"],
        responses={200: OpenApiResponse(description="Claims and organisations of the caller")},
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        claims = OrganisationClaim.objects.filter(user=user).order_by("-created_at")[:20]
        organisations = []
        for m in listings.memberships_of(user):
            profile = (
                EmployerProfile.objects.filter(organisation=m.organisation)
                .select_related("live_revision")
                .first()
            )
            pending = (
                ProfileRevision.objects.filter(profile=profile, state=ProfileState.PENDING).first()
                if profile
                else None
            )
            organisations.append(
                {
                    "id": str(m.organisation_id),
                    "name": m.organisation.name,
                    "role": m.role,
                    "verified": services.is_verified(m.organisation_id),
                    "profile_slug": profile.slug if profile and profile.live_revision_id else None,
                    "profile_pending": pending is not None,
                    "listing_count": EmployerListing.objects.filter(organisation=m.organisation).count(),
                }
            )
        return Response(
            {
                "account_ready": bool(
                    user.is_active and user.email_verified_at and not user.deletion_requested_at
                ),
                "claims": [_claim(c) for c in claims],
                "organisations": organisations,
            }
        )


class OrganisationSearchView(EmployerView):
    @extend_schema(
        operation_id="searchOrganisationsToClaim",
        tags=["employer"],
        parameters=[
            OpenApiParameter("q", str, description="Start of an organisation name (2-100 characters).")
        ],
        responses={200: OpenApiResponse(description="Up to 8 organisations (id and name)"), 400: None},
    )
    def get(self, request: Request) -> Response:
        try:
            q = clean_single_line(request.query_params.get("q", ""))
        except TextError:
            q = ""
        if not 2 <= len(q) <= 100:
            return error_response(
                "invalid_filter",
                "Type at least two characters.",
                400,
                {"q": [{"code": "invalid_filter", "message": "2-100 characters."}]},
            )
        from catalog.text import normalise_name

        rows = Organisation.objects.filter(
            name_normalized__startswith=normalise_name(q), merged_into__isnull=True
        )[:8]
        return Response({"data": [{"id": str(o.pk), "name": o.name} for o in rows]})


class ClaimListView(EmployerView):
    @extend_schema(
        operation_id="submitOrganisationClaim",
        tags=["employer"],
        request=None,
        responses={201: OpenApiResponse(description="The waiting claim"), 400: None, 403: None, 409: None},
    )
    def post(self, request: Request) -> Response:
        data = _body(request)
        if data is None:
            return _bad_body()
        try:
            claim = services.submit_claim(self.user_of(request), data)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(_claim(claim), status=status.HTTP_201_CREATED)


class ClaimDetailView(EmployerView):
    @extend_schema(
        operation_id="withdrawOrganisationClaim",
        tags=["employer"],
        responses={204: OpenApiResponse(description="Withdrawn"), 404: None, 409: None},
    )
    def delete(self, request: Request, claim_id: uuid.UUID) -> Response:
        try:
            services.withdraw_claim(self.user_of(request), claim_id)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- company profile ---
class ProfileView(EmployerView):
    @extend_schema(
        operation_id="getEmployerProfile",
        tags=["employer"],
        responses={200: OpenApiResponse(description="Live and waiting company profile"), 404: None},
    )
    def get(self, request: Request, organisation_id: uuid.UUID) -> Response:
        membership = self.membership(request, organisation_id)
        if membership is None:
            return _not_found()
        profile = (
            EmployerProfile.objects.filter(organisation_id=organisation_id)
            .select_related("live_revision")
            .first()
        )
        revisions = (
            list(profile.revisions.select_related("sector").order_by("-version_no")[:5]) if profile else []
        )
        pending = next((r for r in revisions if r.state == ProfileState.PENDING), None)
        latest_rejected = next((r for r in revisions if r.state == ProfileState.REJECTED), None)
        live = profile.live_revision if profile else None
        return Response(
            {
                "organisation": {"id": str(organisation_id), "name": membership.organisation.name},
                "verified": services.is_verified(organisation_id),
                "can_edit": membership.role == "owner",
                "slug": profile.slug if profile and live else None,
                "live": _revision(live),
                "pending": _revision(pending),
                "last_rejected": _revision(latest_rejected) if latest_rejected and not pending else None,
                "sectors": [
                    {"id": str(s.pk), "name": s.name}
                    for s in Sector.objects.filter(active=True).order_by("name")
                ],
                "size_bands": list(SizeBand.values),
            }
        )

    @extend_schema(
        operation_id="submitEmployerProfile",
        tags=["employer"],
        request=None,
        responses={
            201: OpenApiResponse(description="The revision now waiting for review"),
            400: None,
            403: None,
            404: None,
        },
    )
    def post(self, request: Request, organisation_id: uuid.UUID) -> Response:
        data = _body(request)
        if data is None:
            return _bad_body()
        try:
            revision = services.submit_profile_revision(self.user_of(request), organisation_id, data)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(_revision(revision), status=status.HTTP_201_CREATED)


class ProfileRevisionView(EmployerView):
    @extend_schema(
        operation_id="withdrawEmployerProfileRevision",
        tags=["employer"],
        responses={204: OpenApiResponse(description="Withdrawn"), 404: None, 409: None},
    )
    def delete(self, request: Request, organisation_id: uuid.UUID, revision_id: uuid.UUID) -> Response:
        try:
            services.withdraw_profile_revision(self.user_of(request), organisation_id, revision_id)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- listings ---
class OrganisationListingsView(EmployerView):
    @extend_schema(
        operation_id="listEmployerListings",
        tags=["employer"],
        responses={200: OpenApiResponse(description="The organisation's employer listings"), 404: None},
    )
    def get(self, request: Request, organisation_id: uuid.UUID) -> Response:
        membership = self.membership(request, organisation_id)
        if membership is None:
            return _not_found()
        rows = (
            Opportunity.objects.filter(employer_binding__organisation_id=organisation_id)
            .select_related("category", "pending_version", "live_version")
            .order_by("-updated_at")[:200]
        )
        return Response(
            {
                "organisation": {"id": str(organisation_id), "name": membership.organisation.name},
                "verified": services.is_verified(organisation_id),
                "data": [_listing_row(self.user_of(request), o) for o in rows],
            }
        )

    @extend_schema(
        operation_id="createEmployerListing",
        tags=["employer"],
        request=None,
        responses={201: OpenApiResponse(description="The new draft"), 400: None, 403: None, 404: None},
    )
    def post(self, request: Request, organisation_id: uuid.UUID) -> Response:
        data = _body(request)
        if data is None:
            return _bad_body()
        category = data.pop("category", None)
        content = data.get("content")
        if not isinstance(category, str) or not isinstance(content, dict):
            return error_response(
                "validation_failed",
                "Send a category and the content.",
                400,
                {"category": [{"code": "required", "message": "Required."}]},
            )
        try:
            opportunity = listings.create(self.user_of(request), organisation_id, category, content)
        except WorkflowError as exc:
            return _refused(exc)
        full = _own_listing(self.user_of(request), opportunity.pk)
        assert full is not None
        return Response(_listing_detail(self.user_of(request), full), status=status.HTTP_201_CREATED)


class ListingView(EmployerView):
    @extend_schema(
        operation_id="getEmployerListing",
        tags=["employer"],
        responses={200: OpenApiResponse(description="Listing with its current revision"), 404: None},
    )
    def get(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        opportunity = _own_listing(self.user_of(request), opportunity_id)
        if opportunity is None:
            return _not_found()
        return Response(_listing_detail(self.user_of(request), opportunity))

    @extend_schema(
        operation_id="saveEmployerListing",
        tags=["employer"],
        request=None,
        responses={
            200: OpenApiResponse(description="The saved draft"),
            400: None,
            403: None,
            404: None,
            409: None,
        },
    )
    def patch(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        data = _body(request)
        user = self.user_of(request)
        if (
            data is None
            or not isinstance(data.get("content"), dict)
            or not isinstance(data.get("row_version"), int)
        ):
            return _bad_body()
        try:
            listings.save(user, opportunity_id, data["row_version"], data["content"])
        except WorkflowError as exc:
            return _refused(exc)
        opportunity = _own_listing(user, opportunity_id)
        assert opportunity is not None
        return Response(_listing_detail(user, opportunity))


class _ListingActionView(EmployerView):
    runner: Any = None

    def post(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        data = _body(request)
        user = self.user_of(request)
        if data is None or not isinstance(data.get("row_version"), int):
            return error_response(
                "validation_failed",
                "Send the row_version you were shown.",
                400,
                {"row_version": [{"code": "required", "message": "Required."}]},
            )
        try:
            self.runner(user, opportunity_id, data["row_version"])
        except WorkflowError as exc:
            return _refused(exc)
        opportunity = _own_listing(user, opportunity_id)
        if (
            opportunity is None
        ):  # a discarded, never-published draft keeps its row but has no revision to show
            return Response({"id": str(opportunity_id), "status": "archived"})
        return Response(_listing_detail(user, opportunity))


_ACTION_RESPONSES = {
    200: OpenApiResponse(description="The listing after the action"),
    400: None,
    403: None,
    404: None,
    409: None,
}


class SubmitListingView(_ListingActionView):
    runner = staticmethod(listings.submit)

    @extend_schema(
        operation_id="submitEmployerListing", tags=["employer"], request=None, responses=_ACTION_RESPONSES
    )
    def post(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        return super().post(request, opportunity_id)


class DiscardListingView(_ListingActionView):
    runner = staticmethod(listings.discard)

    @extend_schema(
        operation_id="discardEmployerListing", tags=["employer"], request=None, responses=_ACTION_RESPONSES
    )
    def post(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        return super().post(request, opportunity_id)


class ReopenListingView(_ListingActionView):
    runner = staticmethod(listings.reopen)

    @extend_schema(
        operation_id="reopenEmployerListing", tags=["employer"], request=None, responses=_ACTION_RESPONSES
    )
    def post(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        return super().post(request, opportunity_id)


class AmendListingView(_ListingActionView):
    runner = staticmethod(listings.amend)

    @extend_schema(
        operation_id="amendEmployerListing", tags=["employer"], request=None, responses=_ACTION_RESPONSES
    )
    def post(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        return super().post(request, opportunity_id)


class CloseListingView(EmployerView):
    @extend_schema(
        operation_id="closeEmployerListing",
        tags=["employer"],
        request=None,
        responses=_ACTION_RESPONSES,
    )
    def post(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        data = _body(request)
        user = self.user_of(request)
        fields: dict[str, list[dict[str, str]]] = {}
        if data is None or not isinstance(data.get("row_version"), int):
            fields["row_version"] = [{"code": "required", "message": "Send the row_version you were shown."}]
        if data is None or not isinstance(data.get("reason"), str):
            fields["reason"] = [{"code": "required", "message": "Say why you are closing it."}]
        if fields or data is None:
            return error_response("validation_failed", "The request is invalid.", 400, fields)
        try:
            listings.close(user, opportunity_id, data["row_version"], data["reason"])
        except WorkflowError as exc:
            return _refused(exc)
        opportunity = _own_listing(user, opportunity_id)
        assert opportunity is not None
        return Response(_listing_detail(user, opportunity))


class AnalyticsView(EmployerView):
    @extend_schema(
        operation_id="getEmployerAnalytics",
        tags=["employer"],
        responses={200: OpenApiResponse(description="Aggregate counters per listing"), 404: None},
    )
    def get(self, request: Request, organisation_id: uuid.UUID) -> Response:
        if self.membership(request, organisation_id) is None:
            return _not_found()
        return Response(
            {
                "note": "Counts are approximate: repeat visits and automated visits are included.",
                "as_of": _iso(timezone.now()),
                "data": analytics.summary(organisation_id),
            }
        )


# --- public: company profile and listing counters ---
class PublicProfileView(PublicView):
    @extend_schema(
        operation_id="getEmployerProfilePublic",
        tags=["public"],
        responses={
            200: OpenApiResponse(description="Approved profile of a verified organisation"),
            404: None,
            429: None,
        },
    )
    def get(self, request: Request, slug: str) -> Response:
        profile = (
            EmployerProfile.objects.filter(slug=slug, live_revision__isnull=False)
            .select_related("organisation", "live_revision__sector")
            .first()
        )
        if (
            profile is None
            or not OrganisationVerification.objects.filter(
                organisation=profile.organisation, revoked_at__isnull=True
            ).exists()
        ):
            return _not_found()
        live = profile.live_revision
        assert live is not None
        return Response(
            {
                "slug": profile.slug,
                "organisation": {
                    "id": str(profile.organisation_id),
                    "name": profile.organisation.name,
                    "website_url": profile.organisation.website_url,
                },
                "tagline": live.tagline,
                "about": live.about,
                "sector": {"id": str(live.sector_id), "name": live.sector.name} if live.sector else None,
                "size_band": live.size_band,
                "founded_year": live.founded_year,
                "location_text": live.location_text,
                "updated_at": _iso(live.decided_at),
                "open_listings": Opportunity.objects.filter(
                    status=ListingStatus.PUBLISHED, live_version__organisation=profile.organisation
                ).count(),
            }
        )


class EventThrottle(IpRateThrottle):
    scope = "listing_event_ip"


@method_decorator(never_cache, name="dispatch")
class ListingEventView(APIView):
    """Aggregate counter beacon. No cookie, session, identifier or body content is stored."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [EventThrottle]

    @extend_schema(
        operation_id="recordListingEvent",
        tags=["public"],
        request=None,
        responses={204: OpenApiResponse(description="Counted or ignored"), 400: None, 413: None, 429: None},
    )
    def post(self, request: Request, slug: str) -> Response:
        try:
            length = int(request.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > MAX_EVENT_BODY:
            return error_response("too_large", "Not accepted.", 413)
        try:
            payload = json.loads(request.body or b"{}")
        except ValueError:
            payload = None
        kind = payload.get("type") if isinstance(payload, dict) else None
        if kind not in analytics.KINDS:
            return error_response(
                "validation_failed",
                "Unknown event.",
                400,
                {"type": [{"code": "invalid_choice", "message": "view or apply"}]},
            )
        analytics.record(slug.lower(), kind)  # unknown or closed listings are ignored silently
        return Response(status=status.HTTP_204_NO_CONTENT)
