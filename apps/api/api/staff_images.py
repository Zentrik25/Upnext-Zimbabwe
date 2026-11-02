"""The Media Library API (D-62): `GET /api/v1/staff/media` to browse and search, `POST` to upload.

An upload is validated, optimised and registered in the library (`opportunities.media`); uploading a picture that
is already there answers with the existing asset and stores nothing new. Attaching a picture to a listing is the
ordinary draft save (`featured_image` / `social_image` in the draft content, a library name), which already enforces
who may edit, the row version, the audit and the approval rules. Replacing or removing it is just saving a different
name or `null`: the library keeps the file for every other listing. `POST /staff/images` is the earlier address of
the same upload and answers with the same fields.
"""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from accounts.models import User
from opportunities import images, media

from .errors import error_response
from .staff_views import StaffView
from .throttles import StaffUploadThrottle

# A multipart body is the file plus a little framing; refuse anything much larger before reading it.
MAX_BODY = images.MAX_BYTES + 64 * 1024


def _may_use_library(user: User) -> bool:
    return bool(
        user.has_permission_code(Permission.OPP_DRAFT_CREATE)
        or user.has_permission_code(Permission.OPP_DRAFT_EDIT_OWN)
    )


class MediaView(StaffView):
    parser_classes = [
        MultiPartParser,
        JSONParser,
    ]  # JSON is never used; it lets auth and CSRF answer before a 415
    throttle_classes = [StaffUploadThrottle]

    @extend_schema(
        operation_id="listStaffMedia",
        tags=["staff"],
        responses={
            200: OpenApiResponse(description="Library pictures, newest first, with paging"),
            403: None,
        },
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not _may_use_library(user):
            return error_response(
                "permission_denied", "You cannot use the media library.", status.HTTP_403_FORBIDDEN
            )
        try:
            page = max(1, int(request.query_params.get("page", 1)))
            size = min(48, max(1, int(request.query_params.get("page_size", 24))))
        except ValueError:
            page, size = 1, 24
        queryset = media.search(request.query_params.get("q", ""))
        total = queryset.count()
        assets = list(queryset[(page - 1) * size : page * size])
        usage = media.usage_counts([a.name for a in assets])
        return Response(
            {
                "data": [media.serialise(a, usage.get(a.name, 0)) for a in assets],
                "page": {"page": page, "page_size": size, "total": total, "pages": max(1, -(-total // size))},
            }
        )

    @extend_schema(
        operation_id="uploadStaffMedia",
        tags=["staff"],
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {"file": {"type": "string", "format": "binary"}},
            }
        },
        responses={
            200: OpenApiResponse(
                description="The picture was already in the library; nothing new was stored"
            ),
            201: OpenApiResponse(description="The stored picture"),
            400: None,
            403: None,
            413: None,
            429: None,
        },
    )
    def post(self, request: Request) -> Response:
        user = self.user_of(request)
        if not _may_use_library(user):
            return error_response(
                "permission_denied", "You cannot upload listing images.", status.HTTP_403_FORBIDDEN
            )
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            return error_response(
                "file_too_large", "The image is larger than 5 MB.", status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )
        upload: Any = request.FILES.get("file")
        if upload is None:
            return error_response(
                "validation_failed", "Choose an image to upload.", status.HTTP_400_BAD_REQUEST
            )
        if upload.size > images.MAX_BYTES:
            return error_response(
                "file_too_large", "The image is larger than 5 MB.", status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )
        try:
            asset, reused = media.add(
                upload.read(images.MAX_BYTES + 1), uploader=user, original_filename=str(upload.name or "")
            )
        except images.ImageRejected as exc:
            return error_response(exc.code, exc.message, status.HTTP_400_BAD_REQUEST)
        used = media.usage_counts([asset.name])[asset.name]
        return Response(
            {**media.serialise(asset, used), "reused": reused},
            status=status.HTTP_200_OK if reused else status.HTTP_201_CREATED,
        )


class ImageUploadView(MediaView):
    """The earlier address of the same upload (`POST /staff/images`); it answers with the same fields."""

    http_method_names = ["post", "options"]

    @extend_schema(
        operation_id="uploadListingImage",
        tags=["staff"],
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {"file": {"type": "string", "format": "binary"}},
            }
        },
        responses={
            200: OpenApiResponse(description="Already in the library; nothing new stored"),
            201: OpenApiResponse(description="The stored picture"),
            400: None,
            403: None,
            413: None,
            429: None,
        },
    )
    def post(self, request: Request) -> Response:
        return super().post(request)
