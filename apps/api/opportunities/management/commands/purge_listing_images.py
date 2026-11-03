"""Delete listing images that nothing refers to: uploads that were never attached to a draft, and files
left behind by a draft that dropped them (D-58). Files younger than `--older-than-hours` are kept so an
upload that is about to be saved is never removed. The worker runs the same sweep; this is the manual one."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from opportunities import images


class Command(BaseCommand):
    help = "Delete unreferenced listing images older than a day."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--older-than-hours", type=int, default=24)

    def handle(self, *args: Any, **options: Any) -> None:
        removed = images.purge_unreferenced(older_than=timedelta(hours=options["older_than_hours"]))
        self.stdout.write(f"Removed {removed} unreferenced image file(s).")
