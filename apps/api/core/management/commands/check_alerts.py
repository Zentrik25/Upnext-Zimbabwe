"""Evaluate the alert catalogue. Exit status 1 when anything is firing (for cron or an external probe)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from core import alerts


class Command(BaseCommand):
    help = "List firing alerts; with --notify also log them and send them to UPNEXT_ALERT_WEBHOOK_URL if set."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--notify", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        firing = alerts.evaluate()
        for a in firing:
            self.stdout.write(f"{a.severity.upper():8} {a.code}: {a.message}")
        if options["notify"] and not alerts.notify(firing):
            raise CommandError("alerts could not be delivered")
        if firing:
            raise CommandError(f"{len(firing)} alert(s) firing")
        self.stdout.write("no alerts firing")
