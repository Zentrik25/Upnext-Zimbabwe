"""Category detail schemas (ADR-0005): versioned JSON Schema 2020-12 documents shipped with the code.

The documents in `catalog/schemas/<code>/v<N>.json` are authoritative. Everything beyond what JSON
Schema can express (ordering of dates, conditional fields, formats) is enforced by `check_detail`.
Version 1 of every category is the DRAFT from Phase 0, pending owner approval (OQ-06, P2-07).
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .validators import ALLOWED_CURRENCIES, validate_url

SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"
ACTIVE_VERSION = 1


def schema_path(category_code: str, version: int) -> Path:
    return SCHEMA_DIR / category_code / f"v{version}.json"


@cache
def load_schema(category_code: str, version: int) -> dict[str, Any]:
    document: dict[str, Any] = json.loads(schema_path(category_code, version).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(document)
    return document


def schema_sha256(category_code: str, version: int) -> bytes:
    return hashlib.sha256(schema_path(category_code, version).read_bytes()).digest()


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def validate_detail(category_code: str, version: int, detail: Any) -> dict[str, list[tuple[str, str]]]:
    """Return `{path: [(code, message)]}` (empty when valid). Never raises for bad input."""
    errors: dict[str, list[tuple[str, str]]] = {}

    def add(path: str, code: str, message: str) -> None:
        errors.setdefault(f"detail.{path}" if path else "detail", []).append((code, message))

    if not isinstance(detail, dict):
        add("", "schema_violation", "Category details must be an object.")
        return errors
    validator = Draft202012Validator(load_schema(category_code, version))
    for error in sorted(validator.iter_errors(detail), key=lambda e: list(map(str, e.absolute_path))):
        path = ".".join(str(p) for p in error.absolute_path)
        code = "unknown_field" if error.validator == "additionalProperties" else "schema_violation"
        add(path, code, error.message[:300])
    if errors:
        return errors  # cross-field checks assume a structurally valid document

    # Formats the schema declares but jsonschema does not enforce without optional packages.
    for key in ("clarification_deadline_at", "site_visit_at", "bid_opening_at", "expected_start_at"):
        if key in detail and _parse_dt(detail[key]) is None:
            add(key, "invalid_date", "Must be an RFC 3339 date-time with a time zone offset.")
    for key in ("tender_document_url", "programme_url", "website_url"):
        if key in detail:
            try:
                validate_url(str(detail[key]), field_name=key)
            except ValueError as exc:
                add(key, getattr(exc, "code", "invalid_url"), str(exc))
    for fee_key in ("tender_fee", "application_fee"):
        fee = detail.get(fee_key)
        if isinstance(fee, dict):
            try:
                Decimal(str(fee.get("amount")))
            except InvalidOperation:
                add(f"{fee_key}.amount", "invalid_format", "Not a decimal amount.")
            if fee.get("currency") not in ALLOWED_CURRENCIES:
                add(f"{fee_key}.currency", "invalid_currency", "Currency is not on the allowed list.")

    if category_code == "grants" and "cofunding_percent" in detail and not detail.get("cofunding_required"):
        add("cofunding_percent", "schema_violation", "Only allowed when co-funding is required.")
    return errors
