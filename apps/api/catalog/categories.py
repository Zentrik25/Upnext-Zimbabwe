"""Categories with the fields of their active detail schema, for the editor forms (staff and employer)."""

from __future__ import annotations

from collections.abc import Collection
from typing import Any

from .models import Category
from .schemas import load_schema


def category_payload(only: Collection[str] | None = None) -> list[dict[str, Any]]:
    """Active categories with the fields of their active detail schema (what an editor form needs). `only`
    narrows it to some category codes (the employer form passes the three employers may post in)."""
    out = []
    categories = Category.objects.filter(active=True).order_by("sort_order", "code")
    if only is not None:
        categories = categories.filter(code__in=only)
    for cat in categories:
        schema = cat.detail_schemas.filter(status="active").first()
        fields: list[dict[str, Any]] = []
        required: list[str] = []
        if schema is not None:
            loaded = load_schema(cat.code, schema.version)
            required = list(loaded.get("required", []))
            for key, prop in loaded.get("properties", {}).items():
                items = prop.get("items", {})
                fields.append(
                    {
                        "name": key,
                        "type": prop.get("type"),
                        "format": prop.get("format"),
                        "enum": prop.get("enum"),
                        "item_enum": items.get("enum"),
                        "item_type": items.get("type"),
                        "max_length": prop.get("maxLength"),
                        "required": key in required,
                    }
                )
        out.append({"code": cat.code, "name": cat.name, "detail_fields": fields})
    return out
