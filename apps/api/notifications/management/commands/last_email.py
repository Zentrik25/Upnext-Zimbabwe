"""Print the newest spooled e-mail for an address (development and CI only; needs the `file` backend).

Used by the browser tests to read verification and reset links without a mail server.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser


class Command(BaseCommand):
    help = "Print the latest spooled e-mail body for an address as JSON."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--to", required=True)
        parser.add_argument("--kind")

    def handle(self, *args: Any, **options: Any) -> None:
        if settings.UPNEXT_EMAIL_BACKEND != "file":
            raise CommandError("Only available with UPNEXT_EMAIL_BACKEND=file.")
        spool = Path(settings.UPNEXT_EMAIL_FILE_DIR)
        for path in sorted(spool.glob("*.json"), reverse=True):
            record = json.loads(path.read_text(encoding="utf-8"))
            if record["to"].lower() == options["to"].lower() and options.get("kind") in (
                None,
                record["kind"],
            ):
                self.stdout.write(json.dumps(record))
                return
        raise CommandError("No matching e-mail.")
