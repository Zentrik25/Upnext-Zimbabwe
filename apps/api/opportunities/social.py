"""What a shared link shows (D-47): the Open Graph text and image of a listing.

Editors may type their own text; anything they leave empty falls back to a suggestion built from the facts of
the listing, at the moment it is read. Typed text is therefore never overwritten when other fields change, and
the suggestion never needs storing. The staff editor's script (`social_preview.js`) builds the same wording.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings

from catalog import media
from catalog.models import MediaAsset

TITLE_MAX, DESCRIPTION_MAX = 95, 200
JOB_CATEGORIES = {"jobs", "internships", "graduate-programmes"}


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:.- ")
    return f"{cut}…"


def suggest_title(title: str, organisation: str) -> str:
    suffix = f" | {settings.UPNEXT_BRAND_NAME}"
    base = f"{title} at {organisation}" if organisation else title
    return _clip(base, TITLE_MAX - len(suffix)) + suffix


def suggest_description(category_code: str, title: str, organisation: str, location: str | None) -> str:
    where = f" in {location}" if location else ""
    tail = f" View requirements, closing date and application details on {settings.UPNEXT_BRAND_NAME}."
    if category_code in JOB_CATEGORIES:
        head = f"{organisation} is recruiting a {title}{where}."
    else:
        head = f"{title} from {organisation}{where}."
    room = DESCRIPTION_MAX - len(tail)
    return _clip(head, room) + tail


def _location_text(version: Any) -> str | None:
    rows = sorted(version.locations.all(), key=lambda r: (not r.is_primary, r.location.name))
    if not rows:
        return None
    name = rows[0].location.name
    return name if "zimbabwe" in name.lower() else f"{name}, Zimbabwe"


def image_of(asset: MediaAsset | None, alt: str | None) -> dict[str, Any] | None:
    if asset is None:
        return None
    return {
        "url": asset.public_path,
        "width": asset.width,
        "height": asset.height,
        "content_type": asset.content_type,
        "alt": alt or "",
    }


def resolved(version: Any) -> dict[str, Any]:
    """The values a shared link uses for `version`, with fallbacks applied."""
    organisation = version.organisation.name
    category = version.opportunity.category.code
    featured = image_of(version.featured_image, version.featured_image_alt)
    social = image_of(version.social_image, version.social_image_alt) or featured
    return {
        "featured_image": featured,
        "social_image": social,
        "og_title": version.og_title or suggest_title(version.title, organisation),
        "og_description": version.og_description
        or suggest_description(category, version.title, organisation, _location_text(version)),
    }


def warnings_for(asset: MediaAsset) -> list[str]:
    """Why this image may look poor as a link preview (empty when it suits)."""
    return media.social_warnings(asset.width, asset.height)
