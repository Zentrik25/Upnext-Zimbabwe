"""Listing image upload (`POST /api/v1/staff/images`, D-58).

The upload only validates, normalises and stores the picture and answers with its generated name and address.
Attaching it to a listing is the ordinary draft save (`featured_image` / `social_image` in the draft content), which
already enforces who may edit, the row version, the audit and the approval rules; so replacing or removing an image
is just saving the draft with a new name or `null`, and the server then deletes a file nothing refers to any more.
An upload that is never attached is swept by `purge_listing_images`.
"""

from __future__ import annotations

from typing import Any

from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from opportunities import images

from .errors import error_response
from .staff_views import StaffView
from .throttles import StaffUploadThrottle

# A multipart body is the file plus a little framing; refuse anything much larger before reading it.
MAX_BODY = images.MAX_BYTES + 64 * 1024


class ImageUploadView(StaffView):
    parser_classes = [
        MultiPartParser,
        JSONParser,
    ]  # JSON is never used; it lets auth and CSRF answer before a 415
    throttle_classes = [StaffUploadThrottle]

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
            201: OpenApiResponse(description="The stored image: name and absolute address"),
            400: None,
            403: None,
            413: None,
            429: None,
        },
    )
    def post(self, request: Request) -> Response:
        user = self.user_of(request)
        if not (
            user.has_permission_code(Permission.OPP_DRAFT_CREATE)
            or user.has_permission_code(Permission.OPP_DRAFT_EDIT_OWN)
        ):
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
            data, width, height = images.process(upload.read(images.MAX_BYTES + 1))
        except images.ImageRejected as exc:
            return error_response(exc.code, exc.message, status.HTTP_400_BAD_REQUEST)
        name = images.store(data)
        return Response(
            {"name": name, "url": images.url_of(name), "width": width, "height": height, "bytes": len(data)},
            status=status.HTTP_201_CREATED,
        )
