"""Seeker profile, For You and job-alert endpoints (openapi tags `me`, `discovery`, `alerts`; Phase 6B).

Every `/me/*` view works on `request.user` only: there is no identifier in any path or body that selects an
account, so there is no way to name another person's profile or alert.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.core import signing
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from alerts import service as alert_service
from alerts import tokens as alert_tokens
from alerts.models import CONSENT_WORDING_VERSION, JobAlert
from catalog.models import Category
from notifications import verification
from opportunities.models import SavedOpportunity
from profiles import foryou
from profiles import service as profile_service
from profiles.models import SeekerProfile

from .account_views import MeBaseView
from .errors import error_response
from .profile_serializers import (
    AlertSerializer,
    AlertUpdateSerializer,
    ForYouSerializer,
    ProfileSerializer,
    ProfileUpdateSerializer,
    UnsubscribeSerializer,
)
from .public_views import _iso, summary_of
from .throttles import ForYouThrottle, UnsubscribeIpThrottle

CONSENT_WORDING = (
    "Send me an e-mail with new opportunities that match what I chose here. I can change or stop these "
    "e-mails at any time."
)
_FORYOU_SALT = "upnext.foryou.cursor"
DEFAULT_LIMIT, MAX_LIMIT = 20, 50


def _named(row: Any) -> dict[str, Any]:
    return {"id": str(row.pk), "slug": row.slug, "name": row.name}


def profile_dict(profile: SeekerProfile | None) -> dict[str, Any]:
    if profile is None:
        return {
            "exists": False,
            "home_location": None,
            "highest_qualification": None,
            "experience_level": None,
            "work_arrangements": [],
            "employment_types": [],
            "categories": [],
            "sectors": [],
            "preferred_locations": [],
            "skills": [],
            "fields_filled": 0,
            "fields_total": profile_service.TOTAL_FIELDS,
            "updated_at": None,
        }
    return {
        "exists": True,
        "home_location": _named(profile.home_location) if profile.home_location else None,
        "highest_qualification": profile.highest_qualification,
        "experience_level": profile.experience_level,
        "work_arrangements": list(profile.work_arrangements),
        "employment_types": list(profile.employment_types),
        "categories": [{"code": c.code, "name": c.name} for c in profile.categories.all()],
        "sectors": [_named(s) for s in profile.sectors.all()],
        "preferred_locations": [_named(loc) for loc in profile.preferred_locations.all()],
        "skills": [{"id": str(s.pk), "name": s.name} for s in profile.skills.all()],
        "fields_filled": len(profile_service.filled_fields(profile)),
        "fields_total": profile_service.TOTAL_FIELDS,
        "updated_at": _iso(profile.updated_at),
    }


class ProfileView(MeBaseView):
    @extend_schema(operation_id="getProfile", tags=["me"], responses=ProfileSerializer)
    def get(self, request: Request) -> Response:
        return Response(profile_dict(profile_service.get(self.user_of(request))))

    @extend_schema(
        operation_id="updateProfile",
        tags=["me"],
        request=ProfileUpdateSerializer,
        responses={200: ProfileSerializer, 400: OpenApiResponse(description="validation_failed")},
    )
    def patch(self, request: Request) -> Response:
        data = ProfileUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        profile = profile_service.update(self.user_of(request), data.validated_data)
        return Response(profile_dict(profile))

    @extend_schema(
        operation_id="deleteProfile",
        tags=["me"],
        request=None,
        responses={204: OpenApiResponse(description="Deleted, or there was none")},
    )
    def delete(self, request: Request) -> Response:
        profile_service.delete(self.user_of(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileResetView(MeBaseView):
    @extend_schema(
        operation_id="resetProfilePreferences",
        tags=["me"],
        request=None,
        responses={200: ProfileSerializer},
    )
    def post(self, request: Request) -> Response:
        profile = profile_service.reset_preferences(self.user_of(request))
        return Response(profile_dict(profile))


class ForYouView(MeBaseView):
    throttle_classes = [ForYouThrottle]

    def get_throttles(self) -> list[Any]:
        return [t() for t in self.throttle_classes]  # reads are limited here, unlike the other /me views

    @extend_schema(
        operation_id="getForYou",
        tags=["discovery"],
        parameters=[
            OpenApiParameter("category", str),
            OpenApiParameter("location", str),
            OpenApiParameter("limit", int),
            OpenApiParameter("cursor", str),
        ],
        responses={200: ForYouSerializer, 400: OpenApiResponse(description="invalid_filter")},
    )
    def get(self, request: Request) -> Response:
        params = request.query_params
        unknown = set(params) - {"category", "location", "limit", "cursor"}
        if unknown:
            return error_response("invalid_filter", f"Unknown parameter {sorted(unknown)[0]}.", 400)
        try:
            limit = int(params.get("limit", DEFAULT_LIMIT))
        except ValueError:
            return error_response("invalid_filter", "limit must be a number.", 400)
        if not 1 <= limit <= MAX_LIMIT:
            return error_response("invalid_filter", f"limit must be between 1 and {MAX_LIMIT}.", 400)
        category = params.get("category") or None
        if category and not Category.objects.filter(code=category, active=True).exists():
            return error_response("invalid_filter", "Unknown category.", 400)
        location = params.get("location") or None
        offset = 0
        if cursor := params.get("cursor"):
            try:
                offset = int(signing.loads(cursor, salt=_FORYOU_SALT, max_age=3600)["o"])
            except signing.BadSignature, KeyError, ValueError, TypeError:
                return error_response("invalid_cursor", "Invalid cursor.", 400)
        user = self.user_of(request)
        now = timezone.now()
        result = foryou.recommend(profile_service.get(user), now, category=category, location=location)
        window = result.matches[offset : offset + limit]
        has_more = offset + limit < len(result.matches)
        saved_ids = set(
            SavedOpportunity.objects.filter(
                user=user, opportunity_id__in=[m.version.opportunity_id for m in window]
            ).values_list("opportunity_id", flat=True)
        )
        data = []
        for match in window:
            summary = summary_of(match.version, now)
            summary["is_saved"] = match.version.opportunity_id in saved_ids
            data.append(
                {
                    "opportunity": summary,
                    "match": {
                        "reasons": [{"signal": n.signal, "text": n.text} for n in match.reasons],
                        "unknowns": [{"signal": n.signal, "text": n.text} for n in match.unknowns],
                        "notes": [{"signal": n.signal, "text": n.text} for n in match.notes],
                    },
                }
            )
        next_cursor = signing.dumps({"o": offset + limit}, salt=_FORYOU_SALT) if has_more and window else None
        return Response(
            {
                "data": data,
                "page": {
                    "limit": limit,
                    "has_more": has_more,
                    "next_cursor": next_cursor,
                    "total": len(result.matches) if offset == 0 else None,
                },
                "meta": {
                    "model_version": foryou.MODEL_VERSION,
                    "mode": result.mode,
                    "fields_filled": result.fields_filled,
                    "fields_total": profile_service.TOTAL_FIELDS,
                    "suggestions": [{"signal": n.signal, "text": n.text} for n in result.suggestions],
                },
            }
        )


# --- job alerts -------------------------------------------------------------------------------------
def alert_dict(alert: JobAlert | None) -> dict[str, Any]:
    base: dict[str, Any] = {
        "delivery_available": verification.delivery_verified(),
        "consent_wording": CONSENT_WORDING,
    }
    if alert is None:
        return {
            **base,
            "enabled": False,
            "frequency": "weekly",
            "categories": [],
            "locations": [],
            "consented_at": None,
            "consent_wording_version": "",
            "last_sent_at": None,
            "updated_at": None,
        }
    return {
        **base,
        "enabled": alert.enabled,
        "frequency": alert.frequency,
        "categories": [{"code": c.code, "name": c.name} for c in alert.categories.all()],
        "locations": [_named(loc) for loc in alert.locations.all()],
        "consented_at": _iso(alert.consented_at),
        "consent_wording_version": alert.consent_wording_version,
        "last_sent_at": _iso(alert.last_sent_at),
        "updated_at": _iso(alert.updated_at),
    }


class AlertView(MeBaseView):
    @extend_schema(operation_id="getJobAlert", tags=["alerts"], responses=AlertSerializer)
    def get(self, request: Request) -> Response:
        return Response(alert_dict(alert_service.get(self.user_of(request))))

    @extend_schema(
        operation_id="updateJobAlert",
        tags=["alerts"],
        request=AlertUpdateSerializer,
        responses={
            200: AlertSerializer,
            400: OpenApiResponse(description="validation_failed"),
            403: OpenApiResponse(description="email_not_verified"),
        },
    )
    def put(self, request: Request) -> Response:
        data = AlertUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            alert = alert_service.update(self.user_of(request), data.validated_data)
        except alert_service.AlertError as exc:
            if exc.code == "email_not_verified":
                raise exceptions.PermissionDenied from None
            raise exceptions.ValidationError(exc.fields) from None
        return Response(alert_dict(alert))


class UnsubscribeView(APIView):
    """The unsubscribe link in every alert (RFC 8058 one-click POST). No session, no CSRF: the signed token
    is the credential and the only effect is switching that person's alert off."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [UnsubscribeIpThrottle]

    @extend_schema(
        operation_id="unsubscribeJobAlert",
        tags=["alerts"],
        parameters=[
            OpenApiParameter("token", str, description="Alternative to the body, for one-click POST")
        ],
        request=UnsubscribeSerializer,
        responses={
            204: OpenApiResponse(description="Alerts are off"),
            400: OpenApiResponse(description="invalid_token"),
        },
    )
    def post(self, request: Request) -> Response:
        token = request.query_params.get("token")
        if token is None:
            body = UnsubscribeSerializer(data=request.data)
            body.is_valid(raise_exception=True)
            token = body.validated_data["token"]
        user_id: uuid.UUID | None = alert_tokens.read(token)
        if user_id is None:
            return error_response("invalid_token", "This link is invalid.", 400)
        alert_service.withdraw(user_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


__all__ = ["CONSENT_WORDING_VERSION"]
