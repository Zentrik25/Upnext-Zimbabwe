"""Custom model fields.

Django 5.2 removed `django.contrib.postgres.fields.CIEmailField`. The ERD specifies PostgreSQL
`citext` for e-mail addresses (case-insensitive equality and uniqueness), so we keep that column
type with a minimal EmailField subclass. The `citext` extension is created by the first migration.
"""

from __future__ import annotations

from typing import Any

from django.db import models
from django.db.backends.base.base import BaseDatabaseWrapper


class CaseInsensitiveEmailField(models.EmailField):  # type: ignore[type-arg]
    def db_type(self, connection: BaseDatabaseWrapper) -> str:
        return "citext"

    def get_internal_type(self) -> str:
        return "EmailField"

    def deconstruct(self) -> tuple[str, str, list[Any], dict[str, Any]]:
        name, _path, args, kwargs = super().deconstruct()
        return name, "accounts.fields.CaseInsensitiveEmailField", list(args), kwargs
