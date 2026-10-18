"""API root, CSRF bootstrap, login and logout (the rest of the account product is in account_views)."""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.contrib.auth import login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.http import HttpRequest, JsonResponse
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import exceptions, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import services
from accounts.models import AccountStatus, User
from accounts.sessions import client_ip
from audit import services as audit
from audit.models import Severity
from core.context import get_request_id

from . import schema as _schema  # noqa: F401  (registers the OpenAPI auth extension)
from .errors import CodedPermissionDenied, error_response
from .serializers import (
    ApiRootSerializer,
    CsrfTokenSerializer,
    LoginSerializer,
    UserSerializer,
)
from .throttles import EmailFailureLimiter, LoginIpThrottle, hash_key

logger = logging.getLogger("upnext.auth")
_DUMMY_HASH: str | None = None


def _dummy_password_check(password: str) -> None:
    """Spend the same hashing time for unknown e-mail addresses (anti-enumeration timing)."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = make_password("not-a-real-password")
    check_password(password, _DUMMY_HASH)


class ApiRootView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(operation_id="getApiRoot", responses=ApiRootSerializer, tags=["health"])
    def get(self, request: Request) -> Response:
        return Response({"name": "NextJob API", "version": settings.API_VERSION, "status": "ok"})


@method_decorator(never_cache, name="dispatch")
@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(operation_id="getCsrfToken", responses=CsrfTokenSerializer, tags=["auth"])
    def get(self, request: Request) -> Response:
        return Response({"csrf_token": get_token(request._request)})


@method_decorator(never_cache, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginIpThrottle]

    @extend_schema(
        operation_id="login",
        tags=["auth"],
        request=LoginSerializer,
        responses={
            200: UserSerializer,
            401: OpenApiResponse(description="invalid_credentials (generic)"),
            403: OpenApiResponse(description="email_not_verified or account_unavailable"),
            429: OpenApiResponse(description="rate_limited"),
        },
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email: str = serializer.validated_data["email"]
        password: str = serializer.validated_data["password"]
        email_hash = hash_key(email)

        if EmailFailureLimiter.blocked(email):
            logger.warning("login blocked", extra={"event": "auth.login.blocked", "email_hash": email_hash})
            raise exceptions.Throttled(wait=settings.UPNEXT_LOGIN_FAILURE_WINDOW_SECONDS)

        user = User.objects.filter(email=email).first()
        if user is None:
            _dummy_password_check(password)
        credentials_ok = user is not None and user.check_password(services.normalise_password(password))
        if not credentials_ok or user is None:
            EmailFailureLimiter.record_failure(email)
            logger.info("login failed", extra={"event": "auth.login.failure", "email_hash": email_hash})
            audit.record(
                action="auth.login_failed",
                object_type="user",
                object_id=user.pk if user else None,
                actor_id=None,
                severity=Severity.SECURITY,
                changes={"email_hash": email_hash, "ip_hash": hash_key(client_ip(request._request) or "-")},
            )
            return error_response(
                "invalid_credentials", "Incorrect e-mail or password.", status.HTTP_401_UNAUTHORIZED
            )

        # Only after correct credentials do we reveal the account state (OQ-04/OQ-15 semantics).
        if user.status == AccountStatus.PENDING_VERIFICATION:
            raise CodedPermissionDenied("email_not_verified")
        if user.status != AccountStatus.ACTIVE:
            raise CodedPermissionDenied("account_unavailable")

        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        EmailFailureLimiter.reset(email)
        logger.info("login succeeded", extra={"event": "auth.login.success", "user_id": str(user.pk)})
        audit.record(
            action="auth.login",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            changes={"ip_hash": hash_key(client_ip(request._request) or "-")},
        )
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    @extend_schema(
        operation_id="logout",
        tags=["auth"],
        request=None,
        responses={204: OpenApiResponse(description="Session destroyed")},
    )
    def post(self, request: Request) -> Response:
        user_id = str(request.user.pk)
        logout(request._request)
        logger.info("logout", extra={"event": "auth.logout", "user_id": user_id})
        return Response(status=status.HTTP_204_NO_CONTENT)


def api_not_found(request: HttpRequest, *args: Any, **kwargs: Any) -> JsonResponse:
    """Catch-all so unknown /api/v1/ paths return the standard JSON error, not an HTML page."""
    return JsonResponse(
        {"error": {"code": "not_found", "message": "Not found.", "request_id": get_request_id()}},
        status=404,
    )
