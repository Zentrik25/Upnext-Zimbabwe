"""Print content health and launch-target progress. Exit status 1 when separation of duties is broken."""

from __future__ import annotations

import json
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from opportunities import health


class Command(BaseCommand):
    help = "Report live counts, the launch target, queues and the separation-of-duties audit."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--json", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        data = health.report()
        if options["json"]:
            self.stdout.write(json.dumps(data, indent=2))
        else:
            t = data["target"]
            listings, issuers, cats = t["listings"], t["issuers"], t["categories"]
            self.stdout.write(
                f"live and source-checked: {listings['current_source_checked']}/{listings['goal']} "
                f"(live {listings['current_live']}); issuers {issuers['have']}/{issuers['goal']}; "
                f"categories {cats['covered']}/{cats['goal']}; target met: {t['met']}"
            )
            self.stdout.write(f"per category: {data['live_per_category']}")
            self.stdout.write(
                f"pipeline: {data['pipeline']}; closing within 7 days: {data['closing_within_7_days']}"
            )
            self.stdout.write(f"separation-of-duties violations: {len(data['sod_violations'])}")
        if data["sod_violations"]:
            raise CommandError("separation of duties is broken in the data")
