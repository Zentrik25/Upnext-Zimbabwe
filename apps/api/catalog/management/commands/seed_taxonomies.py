"""Load the starter locations, sectors and skills (idempotent). Contents are provisional (OQ-21).

`--dry-run` reports what would be created, and which existing places are inactive (the seed never
re-activates or edits a row), then rolls everything back: use it on production before the approved run
(D-75, O-2)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from catalog.models import Location
from catalog.seed import seed_taxonomies


class Command(BaseCommand):
    help = "Create the starter taxonomies if they are missing (never overwrites existing rows)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--dry-run", action="store_true", help="Report only; write nothing")

    def handle(self, *args: Any, **options: Any) -> None:
        dry = options["dry_run"]
        inactive = sorted(Location.objects.filter(active=False).values_list("slug", flat=True))
        with transaction.atomic():
            created = seed_taxonomies()
            if dry:
                transaction.set_rollback(True)
        verb = "Would create" if dry else "Created"
        self.stdout.write(f"{verb}: " + ", ".join(f"{n} {k}" for k, n in created.items()))
        if inactive:
            self.stdout.write(
                "Inactive places left unchanged (re-activate them in the staff interface if wanted): "
                + ", ".join(inactive)
            )
