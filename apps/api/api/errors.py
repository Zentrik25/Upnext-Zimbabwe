"""One error shape for the whole API (openapi.yaml `Error`): {error:{code,message,request_id,fields?}}."""

from __future__ import annotations

from typing import Any

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from core.context import get_request_id


class CodedPermissionDenied(exceptions.PermissionDenied):
    """403 with a specific machine code (e.g. email_not_verified, account_unavailable)."""

    def __init__(self, code: str) -> None:
        super().__init__()
        self.upnext_code = code


def error_response(
    code: str,
    message: str,
    http_status: int,
    fields: dict[str, list[dict[str, str]]] | None = None,
    headers: dict[str, str] | None = None,
) -> Response:
    body: dict[str, Any] = {"error": {"code": code, "message": message, "request_id": get_request_id()}}
    if fields:
        body["error"]["fields"] = fields
    return Response(body, status=http_status, headers=headers)


def _flatten(detail: Any, prefix: str = "") -> dict[str, list[dict[str, str]]]:
    out: dict[str, list[dict[str, str]]] = {}
    if isinstance(detail, dict):
        for key, value in detail.items():
            out.update(_flatten(value, f"{prefix}.{key}" if prefix else str(key)))
    elif isinstance(detail, list):
        for item in detail:
            if isinstance(item, (dict, list)):
                out.update(_flatten(item, prefix))
            else:
                out.setdefault(prefix or "non_field_errors", []).append(
                    {"code": getattr(item, "code", "invalid"), "message": str(item)}
                )
    else:
        out.setdefault(prefix or "non_field_errors", []).append(
            {"code": getattr(detail, "code", "invalid"), "message": str(detail)}
        )
    return out


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, exceptions.ValidationError):
        return error_response(
            "validation_failed", "The request is invalid.", status.HTTP_400_BAD_REQUEST, _flatten(exc.detail)
        )
    if isinstance(exc, exceptions.ParseError):
        return error_response("validation_failed", "Malformed request body.", status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, exceptions.UnsupportedMediaType):
        return error_response(
            "validation_failed",
            "Content-Type must be application/json.",
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )
    if isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        return error_response("unauthenticated", "Authentication is required.", status.HTTP_401_UNAUTHORIZED)
    if isinstance(exc, exceptions.PermissionDenied):
        if str(exc.detail).startswith("CSRF"):
            return error_response("csrf_failed", "CSRF verification failed.", status.HTTP_403_FORBIDDEN)
        code = getattr(exc, "upnext_code", "permission_denied")
        return error_response(
            code, "You do not have permission to perform this action.", status.HTTP_403_FORBIDDEN
        )
    if isinstance(exc, (exceptions.NotFound,)) or exc.__class__.__name__ == "Http404":
        return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
    if isinstance(exc, exceptions.MethodNotAllowed):
        return error_response("method_not_allowed", "Method not allowed.", status.HTTP_405_METHOD_NOT_ALLOWED)
    if isinstance(exc, exceptions.Throttled):
        wait = getattr(exc, "wait", None)
        headers = {"Retry-After": str(int(wait))} if wait else None
        return error_response(
            "rate_limited", "Too many requests.", status.HTTP_429_TOO_MANY_REQUESTS, headers=headers
        )
    return drf_exception_handler(exc, context)
