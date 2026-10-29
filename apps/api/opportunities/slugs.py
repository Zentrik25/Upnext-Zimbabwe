"""Listing addresses (D-47): one namespace, compared without regard to letter case.

An address is taken when another listing uses it now or any listing used it before (old addresses stay
reserved for their redirect). Nothing here invents a replacement: a clash is reported and the editor chooses.
"""

from __future__ import annotations

import re
import unicodedata
import uuid

from catalog.validators import RESERVED_SLUGS

from .models import Opportunity, SlugRedirect

SLUG_TAKEN_MESSAGE = "This slug already exists. Please enter a unique slug."
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MIN_LENGTH, MAX_LENGTH = 8, 80


def format_error(slug: str) -> str | None:
    """Why `slug` cannot be an address, or None when its form is acceptable."""
    if not SLUG_PATTERN.match(slug):
        return "Use lower-case letters, digits and single hyphens."
    if not MIN_LENGTH <= len(slug) <= MAX_LENGTH:
        return f"Use {MIN_LENGTH} to {MAX_LENGTH} characters."
    if slug in RESERVED_SLUGS:
        return "That address is reserved."
    return None


def is_taken(slug: str, *, exclude_opportunity_id: uuid.UUID | str | None = None) -> bool:
    """True when another listing uses `slug`, or when it is a recorded old address of any listing."""
    others = Opportunity.objects.filter(slug__iexact=slug)
    if exclude_opportunity_id is not None:
        others = others.exclude(pk=exclude_opportunity_id)
    return others.exists() or SlugRedirect.objects.filter(old_slug__iexact=slug).exists()


def suggest(title: str, organisation_name: str) -> str:
    """A readable starting point built from the title and organisation; the editor may change it. It never
    adds numbers or random characters."""
    text = f"{title} {organisation_name}".strip()
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    words = re.sub(r"[^a-z0-9]+", "-", folded).strip("-")
    if len(words) > MAX_LENGTH:
        words = words[:MAX_LENGTH].rsplit("-", 1)[0]
    return words.strip("-")
