"""Run one pass of the job-alert scheduler by hand.

`--dry-run` builds the digests and reports counts without writing anything (no outbox row, no ledger row,
no watermark change). Either way nothing is sent here: a pass only queues outbox rows, and does nothing at
all while e-mail delivery is unverified (B-01).
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from alerts import service


class Command(BaseCommand):
    help = "Queue due job-alert e-mails (a no-op while e-mail delivery is unverified)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        result = service.run_due(dry_run=options["dry_run"])
        if result.status == "delivery_unverified":
            self.stdout.write("e-mail delivery is not verified: nothing was checked or queued")
            return
        self.stdout.write(
            f"checked={result.checked} queued={result.queued} skipped={result.skipped} "
            f"listings={result.listings}{' (dry run)' if options['dry_run'] else ''}"
        )
