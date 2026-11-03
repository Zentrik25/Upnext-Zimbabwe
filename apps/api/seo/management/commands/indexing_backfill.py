"""Queue URL_UPDATED for open, supported listings not yet announced: indexing_backfill [--limit N] [--dry-run]."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from seo import indexing


class Command(BaseCommand):
    help = (
        "Deliberate first submission after the owner enables the Indexing API. The worker paces the sending."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        outcome = indexing.backfill(limit=options["limit"], dry_run=options["dry_run"])
        prefix = "would queue" if options["dry_run"] else "queued"
        self.stdout.write(
            f"{prefix} {outcome['queued']}; already notified or waiting: {outcome['already_notified']}"
        )
