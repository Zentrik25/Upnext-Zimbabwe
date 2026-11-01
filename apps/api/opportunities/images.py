"""Listing images (D-58): validate, normalise and store the featured and social images of a listing.

An upload is never trusted for what it says it is. The bytes are opened with Pillow and the *decoded format* decides
(JPEG, PNG or WebP), not the file name or the declared content type. The picture is then re-encoded from its pixels:
orientation is applied, transparency is flattened onto white, large pictures are scaled down, and every piece of
metadata (EXIF location, camera, comments, embedded profiles) is dropped. What is stored is a new JPEG under a
random generated name, so nothing the client chose (name, extension, path) reaches the file system.

Storage is Django's default storage on a persistent location (`MEDIA_ROOT`, a volume in production). The database
holds only the generated names. A name is released (the file deleted) only when no revision refers to it any more.
"""

from __future__ import annotations

import io
import logging
import re
import uuid
from collections.abc import Iterable
from datetime import timedelta
from typing import Final

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger("upnext.images")

PREFIX: Final = "listings/"
NAME_RE: Final = re.compile(r"^listings/[0-9a-f]{32}\.jpg$")
ALLOWED_FORMATS: Final = {"JPEG", "PNG", "WEBP"}
MAX_BYTES: Final = 5 * 1024 * 1024
MIN_WIDTH, MIN_HEIGHT = 400, 225
MAX_SIDE: Final = 8000
MAX_PIXELS: Final = 40_000_000
OUTPUT_MAX: Final = 1600  # the longer side after scaling down
JPEG_QUALITY: Final = 82
SLOTS: Final = ("featured", "social")


class ImageRejected(Exception):
    """The upload was refused; `code` is stable for the API, `message` is safe to show to the person."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def is_stored_name(value: str) -> bool:
    return bool(NAME_RE.match(value))


def exists(name: str) -> bool:
    return is_stored_name(name) and default_storage.exists(name)


def url_of(name: str | None) -> str | None:
    """The absolute https address of a stored image (social cards need absolute addresses)."""
    if not name or not is_stored_name(name):
        return None
    path = default_storage.url(name)
    if path.startswith(("http://", "https://")):
        return path
    return f"{settings.UPNEXT_PUBLIC_BASE_URL.rstrip('/')}{path}"


def _flatten(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        base = Image.new("RGB", rgba.size, (255, 255, 255))
        base.paste(rgba, mask=rgba.getchannel("A"))
        return base
    return img.convert("RGB")


def process(data: bytes) -> tuple[bytes, int, int]:
    """Validate and normalise an upload. Returns (jpeg bytes, width, height) or raises `ImageRejected`."""
    if not data:
        raise ImageRejected("empty_file", "The file is empty.")
    if len(data) > MAX_BYTES:
        raise ImageRejected("file_too_large", f"The image is larger than {MAX_BYTES // (1024 * 1024)} MB.")
    try:
        opened = Image.open(io.BytesIO(data))
        fmt = opened.format
        width, height = opened.size
    except UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError:
        raise ImageRejected("not_an_image", "That file is not a JPEG, PNG or WebP image.") from None
    if fmt not in ALLOWED_FORMATS:
        raise ImageRejected("unsupported_type", "Use a JPEG, PNG or WebP image.")
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        raise ImageRejected(
            "image_too_small", f"The image is too small. Use at least {MIN_WIDTH} x {MIN_HEIGHT} pixels."
        )
    if width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise ImageRejected(
            "image_too_large", f"The image is too large. Use at most {MAX_SIDE} pixels a side."
        )
    try:
        opened.seek(0)  # an animated picture keeps its first frame only
        opened.load()
        flat = _flatten(ImageOps.exif_transpose(opened))
        if max(flat.size) > OUTPUT_MAX:
            flat.thumbnail((OUTPUT_MAX, OUTPUT_MAX), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        flat.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    except OSError, ValueError, SyntaxError, EOFError, Image.DecompressionBombError:
        raise ImageRejected("not_an_image", "That image could not be read. Try saving it again.") from None
    return out.getvalue(), flat.size[0], flat.size[1]


def store(data: bytes) -> str:
    """Write processed bytes under a new random name and return the name."""
    name = f"{PREFIX}{uuid.uuid4().hex}.jpg"
    return default_storage.save(name, ContentFile(data))


def referenced(name: str) -> bool:
    from .models import OpportunityVersion

    return (
        OpportunityVersion.objects.filter(featured_image=name).exists()
        or OpportunityVersion.objects.filter(social_image=name).exists()
    )


def release(names: Iterable[str | None]) -> int:
    """Delete stored files that no revision refers to any more. Safe to call with names still in use."""
    removed = 0
    for name in {n for n in names if n and is_stored_name(n)}:
        if referenced(name):
            continue
        try:
            if default_storage.exists(name):
                default_storage.delete(name)
                removed += 1
        except OSError:  # a failed clean-up must never fail the request that triggered it
            logger.warning("image.release_failed")
    return removed


def purge_unreferenced(*, older_than: timedelta = timedelta(hours=24)) -> int:
    """Delete uploads that were never attached to a draft (or were detached long ago)."""
    cutoff = timezone.now() - older_than
    removed = 0
    try:
        _, files = default_storage.listdir(PREFIX.rstrip("/"))
    except FileNotFoundError, OSError:
        return 0
    for file in files:
        name = f"{PREFIX}{file}"
        if not is_stored_name(name) or referenced(name):
            continue
        try:
            if default_storage.get_modified_time(name) < cutoff:
                default_storage.delete(name)
                removed += 1
        except OSError:
            logger.warning("image.purge_failed")
    return removed
