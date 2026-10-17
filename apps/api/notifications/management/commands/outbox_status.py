"""Summarise the outbox. With --check the exit status is 1 when mail is stuck or dead (monitoring hook)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from notifications.services import status_summary


class Command(BaseCommand):
    help = "Show outbox counts and the age of the oldest waiting message."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--check", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        summary = status_summary()
        for status, count in summary["counts"].items():
            self.stdout.write(f"{status}: {count}")
        age = summary["oldest_waiting_seconds"]
        self.stdout.write(f"oldest waiting: {'none' if age is None else f'{int(age)} s'}")
        if options["check"] and summary["alerts"]:
            raise CommandError("; ".join(summary["alerts"]))
