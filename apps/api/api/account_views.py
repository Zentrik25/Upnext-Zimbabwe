"""Account endpoints (openapi tags `auth` and `me`): registration, verification, reset, password change,
sessions, deletion request and saved opportunities."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, cast

from django.contrib.auth import update_session_auth_hash
from django.core import signing
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from access.drf import HasRequiredPermission
from access.registry import Permission
from accounts import services
from accounts.models import User, UserSession
from catalog.models import Category
from opportunities import public, saved
from opportunities.models import OpportunityVersion

from .account_serializers import (
    AcceptedSerializer,
    ChangePasswordSerializer,
    DeletionRequestedSerializer,
    EmailOnlySerializer,
    MeUpdateSerializer,
    PasswordOnlySerializer,
    RegisterSerializer,
    ResetConfirmSerializer,
    SavedItemSerializer,
    SavedListSerializer,
    SessionListSerializer,
    TokenSerializer,
)
from .errors import CodedPermissionDenied, error_response
from .public_views import _iso, summary_of
from .serializers import UserSerializer
from .throttles import (
    EmailFailureLimiter,
    EmailRequestIpThrottle,
    RegisterIpThrottle,
    TokenIpThrottle,
    UserWriteThrottle,
    email_request_gate,
)

ACCEPTED = {"status": "accepted"}
_SAVED_SALT = "upnext.saved.cursor"


def _fields(exc: services.AccountError) -> exceptions.ValidationError:
    return exceptions.ValidationError(exc.fields)


@method_decorator(never_cache, name="dispatch")
class AuthBaseView(APIView):
    permission_classes = [AllowAny]


class RegisterView(AuthBaseView):
    throttle_classes = [RegisterIpThrottle]

    @extend_schema(
        operation_id="register",
        tags=["auth"],
        request=RegisterSerializer,
        responses={202: AcceptedSerializer, 400: OpenApiResponse(description="validation_failed")},
    )
    def post(self, request: Request) -> Response:
        data = RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            services.register(**data.validated_data)
        except services.AccountError as exc:
            raise _fields(exc) from None
        return Response(ACCEPTED, status=status.HTTP_202_ACCEPTED)


class VerifyEmailView(AuthBaseView):
    throttle_classes = [TokenIpThrottle]

    @extend_schema(
        operation_id="verifyEmail",
        tags=["auth"],
        request=TokenSerializer,
        responses={204: OpenApiResponse(description="Verified. No session is created."), 400: None},
    )
    def post(self, request: Request) -> Response:
        data = TokenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not services.verify_email(data.validated_data["token"]):
            return error_response("invalid_token", "This link is invalid or has expired.", 400)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResendVerificationView(AuthBaseView):
    throttle_classes = [EmailRequestIpThrottle]

    @extend_schema(
        operation_id="resendVerification",
        tags=["auth"],
        request=EmailOnlySerializer,
        responses={202: AcceptedSerializer},
    )
    def post(self, request: Request) -> Response:
        data = EmailOnlySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"]
        email_request_gate(email)
        services.resend_verification(email)
        return Response(ACCEPTED, status=status.HTTP_202_ACCEPTED)


class PasswordResetRequestView(AuthBaseView):
    throttle_classes = [EmailRequestIpThrottle]

    @extend_schema(
        operation_id="requestPasswordReset",
        tags=["auth"],
        request=EmailOnlySerializer,
        responses={202: AcceptedSerializer},
    )
    def post(self, request: Request) -> Response:
        data = EmailOnlySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"]
        email_request_gate(email)
        services.request_password_reset(email)
        return Response(ACCEPTED, status=status.HTTP_202_ACCEPTED)


class PasswordResetConfirmView(AuthBaseView):
    throttle_classes = [TokenIpThrottle]

    @extend_schema(
        operation_id="confirmPasswordReset",
        tags=["auth"],
        request=ResetConfirmSerializer,
        responses={204: OpenApiResponse(description="Password changed"), 400: None},
    )
    def post(self, request: Request) -> Response:
        data = ResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            done = services.confirm_password_reset(
                data.validated_data["token"], data.validated_data["new_password"]
            )
        except services.AccountError as exc:
            raise _fields(exc) from None
        if not done:
            return error_response("invalid_token", "This link is invalid or has expired.", 400)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- /me --------------------------------------------------------------------------------------------
@method_decorator(never_cache, name="dispatch")
class MeBaseView(APIView):
    permission_classes = [HasRequiredPermission]
    required_permission = Permission.ME_PROFILE
    throttle_classes = [UserWriteThrottle]

    def get_throttles(self) -> list[Any]:
        # Writes only: reads are not limited here.
        return super().get_throttles() if self.request.method not in ("GET", "HEAD", "OPTIONS") else []

    @staticmethod
    def user_of(request: Request) -> User:
        return cast(User, request.user)

    def reauthenticate(self, request: Request, password: str) -> None:
        """Password re-entry for sensitive actions. Wrong attempts count against the same limiter as login."""
        user = self.user_of(request)
        if EmailFailureLimiter.blocked(user.email):
            raise exceptions.Throttled(wait=15 * 60)
        if not user.check_password(services.normalise_password(password)):
            EmailFailureLimiter.record_failure(user.email)
            raise CodedPermissionDenied("reauth_required")
        EmailFailureLimiter.reset(user.email)


class MeView(MeBaseView):
    @extend_schema(operation_id="getMe", tags=["me"], responses=UserSerializer)
    def get(self, request: Request) -> Response:
        return Response(UserSerializer(self.user_of(request)).data)

    @extend_schema(
        operation_id="updateMe",
        tags=["me"],
        request=MeUpdateSerializer,
        responses={200: UserSerializer},
    )
    def patch(self, request: Request) -> Response:
        data = MeUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        name = data.validated_data["display_name"].strip()
        if problem := services.display_name_problem(name):
            raise exceptions.ValidationError({"display_name": [problem]})
        user = self.user_of(request)
        user.display_name = name
        user.save(update_fields=["display_name", "updated_at"])
        return Response(UserSerializer(user).data)


class ChangePasswordView(MeBaseView):
    @extend_schema(
        operation_id="changePassword",
        tags=["auth"],
        request=ChangePasswordSerializer,
        responses={204: OpenApiResponse(description="Changed; other sessions revoked"), 400: None, 403: None},
    )
    def post(self, request: Request) -> Response:
        data = ChangePasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = self.user_of(request)
        self.reauthenticate(request, data.validated_data["current_password"])
        old_key = request.session.session_key
        try:
            services.change_password(
                user,
                current_password=data.validated_data["current_password"],
                new_password=data.validated_data["new_password"],
                session_key=old_key,
            )
        except services.AccountError as exc:
            raise _fields(exc) from None
        # Keep this browser signed in: the password hash changed, so the session must be re-bound (and its key
        # rotates). The metadata row follows the new key.
        update_session_auth_hash(request._request, user)
        UserSession.objects.filter(session_key=old_key).update(session_key=request.session.session_key)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionListView(MeBaseView):
    required_permission = Permission.ME_SESSIONS

    @extend_schema(operation_id="listSessions", tags=["me"], responses=SessionListSerializer)
    def get(self, request: Request) -> Response:
        current = request.session.session_key
        rows = UserSession.objects.filter(user=self.user_of(request), revoked_at__isnull=True).order_by(
            "-last_seen_at"
        )
        return Response(
            {
                "data": [
                    {
                        "id": str(r.pk),
                        "created_at": _iso(r.created_at),
                        "last_seen_at": _iso(r.last_seen_at),
                        "user_agent_summary": r.user_agent_summary or None,
                        "current": r.session_key == current,
                    }
                    for r in rows
                ]
            }
        )


class SessionDetailView(MeBaseView):
    required_permission = Permission.ME_SESSIONS

    @extend_schema(
        operation_id="revokeSession",
        tags=["me"],
        request=None,
        responses={204: OpenApiResponse(description="Revoked"), 404: None},
    )
    def delete(self, request: Request, session_id: uuid.UUID) -> Response:
        if not services.revoke_session(self.user_of(request), session_id):
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeletionRequestView(MeBaseView):
    required_permission = Permission.ME_DELETE

    @extend_schema(
        operation_id="requestAccountDeletion",
        tags=["me"],
        request=PasswordOnlySerializer,
        responses={202: DeletionRequestedSerializer, 403: None, 409: None},
    )
    def post(self, request: Request) -> Response:
        data = PasswordOnlySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        self.reauthenticate(request, data.validated_data["password"])
        try:
            requested, due = services.request_deletion(self.user_of(request))
        except services.StaffAccountError:
            return error_response(
                "staff_account",
                "An administrator must remove your staff access before the account can be deleted.",
                status.HTTP_409_CONFLICT,
            )
        return Response(
            {"deletion_requested_at": _iso(requested), "scheduled_for": _iso(due)},
            status=status.HTTP_202_ACCEPTED,
        )

    @extend_schema(
        operation_id="cancelAccountDeletion",
        tags=["me"],
        request=None,
        responses={204: OpenApiResponse(description="Cancelled"), 409: None},
    )
    def delete(self, request: Request) -> Response:
        if not services.cancel_deletion(self.user_of(request)):
            return error_response(
                "state_conflict", "No deletion request is pending.", status.HTTP_409_CONFLICT
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- saved opportunities ----------------------------------------------------------------------------
def _saved_dict(row: Any, versions: dict[uuid.UUID, OpportunityVersion], now: datetime) -> dict[str, Any]:
    opportunity = row.opportunity
    availability = saved.availability_of(opportunity)
    version = versions.get(opportunity.pk) if availability != "unavailable" else None
    return {
        "opportunity_id": str(opportunity.pk),
        "saved_at": _iso(row.created_at),
        "availability": availability,
        "opportunity": summary_of(version, now) if version is not None else None,
    }


class SavedListView(MeBaseView):
    required_permission = Permission.ME_SAVED

    @extend_schema(
        operation_id="listSaved",
        tags=["me"],
        parameters=[
            OpenApiParameter("category", str),
            OpenApiParameter("limit", int),
            OpenApiParameter("cursor", str),
            OpenApiParameter(
                "ids", str, description="Comma-separated opportunity ids (at most 50): states only"
            ),
        ],
        responses={200: SavedListSerializer, 400: None},
    )
    def get(self, request: Request) -> Response:
        params = request.query_params
        unknown = set(params) - {"category", "limit", "cursor", "ids"}
        if unknown:
            return error_response("invalid_filter", f"Unknown parameter {sorted(unknown)[0]}.", 400)
        user = self.user_of(request)
        now = timezone.now()
        if "ids" in params:
            return self._states(user, params["ids"])
        try:
            limit = int(params.get("limit", 20))
        except ValueError:
            return error_response("invalid_filter", "limit must be a number.", 400)
        if not 1 <= limit <= 50:
            return error_response("invalid_filter", "limit must be between 1 and 50.", 400)
        category = params.get("category")
        if category and not Category.objects.filter(code=category).exists():
            return error_response("invalid_filter", "Unknown category.", 400)
        qs = saved.rows_for(user, category=category or None)
        if cursor := params.get("cursor"):
            try:
                payload = signing.loads(cursor, salt=_SAVED_SALT, max_age=86400)
                stamp, ident = datetime.fromisoformat(payload["t"]), uuid.UUID(payload["i"])
                if payload["c"] != (category or ""):
                    raise ValueError
            except signing.BadSignature, KeyError, ValueError, TypeError:
                return error_response("invalid_cursor", "Invalid cursor.", 400)
            from django.db.models import Q

            qs = qs.filter(Q(created_at__lt=stamp) | Q(created_at=stamp, id__lt=ident))
        rows = list(qs[: limit + 1])
        has_more = len(rows) > limit
        rows = rows[:limit]
        total = qs.model.objects.filter(user=user).count() if not cursor else None
        versions = {
            v.opportunity_id: v
            for v in public.visible_versions(detail=True)
            .filter(opportunity_id__in=[r.opportunity_id for r in rows])
            .prefetch_related("locations__location", "sources")
        }
        next_cursor = (
            signing.dumps(
                {"t": rows[-1].created_at.isoformat(), "i": str(rows[-1].pk), "c": category or ""},
                salt=_SAVED_SALT,
            )
            if has_more and rows
            else None
        )
        return Response(
            {
                "data": [_saved_dict(r, versions, now) for r in rows],
                "page": {"limit": limit, "has_more": has_more, "next_cursor": next_cursor, "total": total},
            }
        )

    def _states(self, user: User, raw: str) -> Response:
        try:
            ids = [uuid.UUID(part) for part in raw.split(",") if part]
        except ValueError:
            return error_response("invalid_filter", "ids must be a list of identifiers.", 400)
        if len(ids) > 50:
            return error_response("invalid_filter", "At most 50 ids.", 400)
        data = [
            {
                "opportunity_id": str(r.opportunity_id),
                "saved_at": _iso(r.created_at),
                "availability": saved.availability_of(r.opportunity),
                "opportunity": None,
            }
            for r in saved.states_for(user, ids)
        ]
        return Response(
            {"data": data, "page": {"limit": len(ids), "has_more": False, "next_cursor": None, "total": None}}
        )


class SavedDetailView(MeBaseView):
    required_permission = Permission.ME_SAVED

    @extend_schema(
        operation_id="saveOpportunity",
        tags=["me"],
        request=None,
        responses={200: SavedItemSerializer, 201: SavedItemSerializer, 404: None, 409: None},
    )
    def put(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        try:
            outcome = saved.save(user, opportunity_id)
        except saved.NotSaveable:
            return error_response("listing_not_saveable", "This listing is no longer open.", 409)
        except saved.LimitReached:
            return error_response(
                "saved_limit_reached", f"You can save up to {saved.MAX_SAVED} listings.", 409
            )
        if outcome is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        row, created = outcome
        row = saved.rows_for(user).get(pk=row.pk)
        now = timezone.now()
        versions = {
            v.opportunity_id: v
            for v in public.visible_versions(detail=True)
            .filter(opportunity_id=row.opportunity_id)
            .prefetch_related("locations__location", "sources")
        }
        body = _saved_dict(row, versions, now)
        return Response(body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(
        operation_id="unsaveOpportunity",
        tags=["me"],
        request=None,
        responses={204: OpenApiResponse(description="Not saved")},
    )
    def delete(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        saved.unsave(self.user_of(request), opportunity_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
