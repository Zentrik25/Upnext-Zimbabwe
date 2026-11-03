"""The Media Library (D-62): one stored picture, any number of listings.

An upload is validated and re-encoded by `opportunities.images`, then registered here as a `MediaAsset`.
Uploading the same picture twice finds the existing asset by its content hash and stores nothing new. A
listing refers to an asset by its storage name (the `featured_image` / `social_image` of a revision), so
taking the picture off a listing only changes that revision; the asset and its file stay in the library
and keep serving every other listing.
"""

from __future__ import annotations

import hashlib
import os
import re
from typing import Any

from django.core.files.storage import default_storage
from django.db.models import Q, QuerySet

from accounts.models import User

from . import images
from .models import MediaAsset, OpportunityVersion, VersionState

_TITLE_JUNK = re.compile(r"[\\/\x00-\x1f]+")
_USED_STATES = (VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED, VersionState.PUBLISHED)


def title_from_filename(filename: str) -> str:
    """A readable library title from the client's file name. The name is never used as a path."""
    base = os.path.basename(_TITLE_JUNK.sub("/", filename or "").strip())
    stem = os.path.splitext(base)[0].replace("_", " ").replace("-", " ")
    return " ".join(stem.split())[:200] or "Untitled image"


def add(data: bytes, *, uploader: User | None, original_filename: str = "") -> tuple[MediaAsset, bool]:
    """Validate, optimise and register an upload. Returns (asset, reused): `reused` is True when the same
    picture was already in the library, in which case no new file is written. Raises
    `images.ImageRejected`."""
    jpeg, width, height = images.process(data)
    digest = hashlib.sha256(jpeg).hexdigest()
    for existing in MediaAsset.objects.filter(content_hash=digest):
        if default_storage.exists(existing.name):
            return existing, True
    name = images.store(jpeg)
    asset = MediaAsset.objects.create(
        name=name,
        thumb_name=images.store_thumbnail(name, jpeg),
        title=title_from_filename(original_filename),
        original_filename=(original_filename or "")[:255],
        content_hash=digest,
        width=width,
        height=height,
        byte_size=len(jpeg),
        uploaded_by=uploader,
    )
    return asset, False


def search(term: str = "") -> QuerySet[MediaAsset]:
    queryset = MediaAsset.objects.select_related("uploaded_by")
    term = term.strip()[:100]
    if term:
        queryset = queryset.filter(Q(title__icontains=term) | Q(original_filename__icontains=term))
    return queryset


def usage_counts(names: list[str]) -> dict[str, int]:
    """How many listings currently use each picture (as featured or sharing image), in two queries."""
    owners: dict[str, set[Any]] = {name: set() for name in names}
    for column in ("featured_image", "social_image"):
        used = OpportunityVersion.objects.filter(**{f"{column}__in": names}, state__in=_USED_STATES)
        rows = used.values_list(column, "opportunity_id")
        for name, opportunity_id in rows:
            owners[name].add(opportunity_id)
    return {name: len(ids) for name, ids in owners.items()}


def serialise(asset: MediaAsset, used_in: int | None = None) -> dict[str, Any]:
    thumb = asset.thumb_name if asset.thumb_name and default_storage.exists(asset.thumb_name) else ""
    return {
        "id": str(asset.pk),
        "name": asset.name,
        "url": images.url_of(asset.name),
        "thumb": thumb or asset.name,  # a storage name, served at /media/<thumb> like `name`
        "thumb_url": images.url_of_any(thumb) if thumb else images.url_of(asset.name),
        "title": asset.title,
        "original_filename": asset.original_filename,
        "width": asset.width,
        "height": asset.height,
        "bytes": asset.byte_size,
        "uploaded_by": asset.uploaded_by.display_name if asset.uploaded_by else None,
        "created_at": asset.created_at.isoformat().replace("+00:00", "Z"),
        "used_in": used_in,
    }
