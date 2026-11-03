"""Show the Indexing API queue: indexing_status [--recent N] [--check]. Prints no secret."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from seo import indexing


class Command(BaseCommand):
    help = "Show whether Google submissions are enabled, the queue counts and the latest notifications."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--recent", type=int, default=10)
        parser.add_argument(
            "--check", action="store_true", help="exit 1 if submissions are on but cannot work"
        )

    def handle(self, *args: Any, **options: Any) -> None:
        data = indexing.summary()
        self.stdout.write(f"submissions enabled: {data['enabled']}")
        self.stdout.write(
            f"credentials: {data['credentials']} (service account: {data['service_account'] or '-'})"
        )
        self.stdout.write(f"sent in the last 24 hours: {data['sent_last_24h']} of {data['daily_limit']}")
        self.stdout.write(f"queue: {data['counts']}  oldest open: {data['oldest_open_at'] or '-'}")
        for row in indexing.recent(options["recent"]):
            self.stdout.write(
                f"  {row.created_at:%Y-%m-%d %H:%M} {row.kind} {row.status} {row.url} {row.detail}"
            )
        self.stdout.write(
            "`sent` means Google's API accepted the notification; it does not mean the page is indexed."
        )
        if options["check"] and data["enabled"] and data["credentials"] != "ok":
            raise CommandError("Submissions are enabled but the service-account key is not usable.")
