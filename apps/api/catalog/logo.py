"""Organisation logo intake (D-46).

A logo is accepted only as PNG, JPEG or WebP, decoded with Pillow, bounded in size and pixels, stripped of
all metadata by re-encoding, and stored as a small PNG data URI. SVG is refused (script-capable), nothing is
fetched from a third party and no file storage is involved.
"""

from __future__ import annotations

import base64
import io

from PIL import Image, UnidentifiedImageError

MAX_UPLOAD_BYTES = 512 * 1024
MAX_SOURCE_PIXELS = 4_000_000
MAX_EDGE = 256
MAX_RESULT_BYTES = 60 * 1024
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}


class LogoError(ValueError):
    """The uploaded file is not an acceptable logo."""


def to_data_uri(raw: bytes) -> str:
    if not raw:
        raise LogoError("The logo file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise LogoError("The logo file is larger than 512 KB.")
    Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise LogoError("The logo must be a PNG, JPEG or WebP image.")
            if probe.width * probe.height > MAX_SOURCE_PIXELS:
                raise LogoError("The logo image is too large.")
            image = probe.convert("RGBA")
    except LogoError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as exc:
        raise LogoError("The logo file could not be read as an image.") from exc
    image.thumbnail((MAX_EDGE, MAX_EDGE))
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    data = out.getvalue()
    if len(data) > MAX_RESULT_BYTES:
        raise LogoError("The logo is too detailed; use a simpler or smaller image.")
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")
