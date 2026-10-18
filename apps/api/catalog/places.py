"""Location hierarchy helper shared by search-like features (country > province > city)."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from .models import Location


def with_descendants(roots: Iterable[Any]) -> set[Any]:
    """The given location ids and every location below them."""
    found = set(roots)
    frontier = set(found)
    for _ in range(3):  # three levels are the deepest the taxonomy has
        if not frontier:
            break
        children = set(Location.objects.filter(parent_id__in=frontier).values_list("pk", flat=True)) - found
        found |= children
        frontier = children
    return found
