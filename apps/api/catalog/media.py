"""Staff-uploaded listing images (D-47): featured and social-sharing images.

Every upload is decoded with Pillow (the real file content decides the type, never the extension or the
declared MIME type), bounded in size and pixels, stripped of all metadata by re-encoding, and stored as
JPEG or PNG: the two renditions every social crawler reads. Nothing is generated, stylised or silently
reshaped; an image that is unsuitable for sharing yields warnings, and a centre crop happens only when
the editor asks for it.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass, field

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SOURCE_PIXELS = 25_000_000
MIN_WIDTH, MIN_HEIGHT = 300, 157
MAX_EDGE = 1600
SOCIAL_SIZE = (1200, 630)
SOCIAL_RATIO = SOCIAL_SIZE[0] / SOCIAL_SIZE[1]
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class ImageError(ValueError):
    """The uploaded file is not an acceptable image."""


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    content_type: str
    width: int
    height: int
    sha256: str
    warnings: list[str] = field(default_factory=list)


def social_warnings(width: int, height: int) -> list[str]:
    out: list[str] = []
    if width < SOCIAL_SIZE[0] or height < SOCIAL_SIZE[1]:
        out.append(
            f"This image is {width} x {height}. Link previews look best at "
            f"{SOCIAL_SIZE[0]} x {SOCIAL_SIZE[1]}; a smaller image can look blurry or show as a thumbnail."
        )
    ratio = width / height
    if abs(ratio - SOCIAL_RATIO) / SOCIAL_RATIO > 0.12:
        out.append(
            f"The shape ({ratio:.2f}:1) differs from the recommended 1.91:1, so platforms will crop it. "
            "Replace it, or tick 'Crop to 1200 x 630' to crop the centre."
        )
    return out


def process(raw: bytes, *, crop_to_social: bool = False) -> ProcessedImage:
    if not raw:
        raise ImageError("The image file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ImageError("The image is larger than 5 MB.")
    Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise ImageError("The image must be a JPEG, PNG or WebP file.")
            if probe.width * probe.height > MAX_SOURCE_PIXELS:
                raise ImageError("The image has too many pixels.")
            probe.load()
            image = ImageOps.exif_transpose(probe) or probe.copy()
            has_alpha = image.mode in ("RGBA", "LA") or "transparency" in image.info
            image = image.convert("RGBA" if has_alpha else "RGB")
    except ImageError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError, SyntaxError) as exc:
        raise ImageError("The file could not be read as an image.") from exc
    if image.width < MIN_WIDTH or image.height < MIN_HEIGHT:
        raise ImageError(f"The image is too small; use at least {MIN_WIDTH} x {MIN_HEIGHT} pixels.")
    if crop_to_social:
        image = ImageOps.fit(image, SOCIAL_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    elif max(image.size) > MAX_EDGE:
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    if has_alpha:
        image.save(out, format="PNG", optimize=True)
        content_type = "image/png"
    else:
        image.save(out, format="JPEG", quality=85, optimize=True, progressive=True)
        content_type = "image/jpeg"
    data = out.getvalue()
    return ProcessedImage(
        data=data,
        content_type=content_type,
        width=image.width,
        height=image.height,
        sha256=hashlib.sha256(data).hexdigest(),
        warnings=social_warnings(image.width, image.height),
    )
