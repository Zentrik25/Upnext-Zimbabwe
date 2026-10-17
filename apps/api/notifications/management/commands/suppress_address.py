"""Add or remove an address on the suppression list (mail is never sent to a suppressed address)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from notifications import suppression


class Command(BaseCommand):
    help = "Suppress or release an e-mail address."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--email", required=True)
        parser.add_argument("--release", action="store_true")
        parser.add_argument("--reason", choices=suppression.REASONS, default="manual")

    def handle(self, *args: Any, **options: Any) -> None:
        if options["release"]:
            self.stdout.write("released" if suppression.release(options["email"]) else "was not suppressed")
        else:
            created = suppression.suppress(options["email"], options["reason"])
            self.stdout.write("suppressed" if created else "already suppressed")
