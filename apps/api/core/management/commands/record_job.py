"""Record the outcome of a job that runs outside Django (the backup script calls this after each run)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from core.models import JobRun


class Command(BaseCommand):
    help = "Record a job outcome: record_job NAME --status ok|failed [--detail TEXT]"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("name")
        parser.add_argument("--status", choices=["ok", "failed"], default="ok")
        parser.add_argument("--detail", default="")

    def handle(self, *args: Any, **options: Any) -> None:
        JobRun.record(options["name"], ok=options["status"] == "ok", detail=options["detail"])
        self.stdout.write(f"recorded {options['name']}: {options['status']}")
