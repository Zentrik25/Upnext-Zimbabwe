"""Load the starter locations, sectors and skills (idempotent). Contents are provisional (OQ-21)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from catalog.seed import seed_taxonomies


class Command(BaseCommand):
    help = "Create the starter taxonomies if they are missing (never overwrites existing rows)."

    def handle(self, *args: Any, **options: Any) -> None:
        created = seed_taxonomies()
        self.stdout.write("Created: " + ", ".join(f"{n} {k}" for k, n in created.items()))
