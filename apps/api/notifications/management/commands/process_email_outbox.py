"""Send due outbox e-mails. `--loop` keeps running (the Compose `worker` service); otherwise one batch."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from notifications.services import process_batch

HEARTBEAT = Path(os.environ.get("UPNEXT_WORKER_HEARTBEAT", "/tmp/upnext-worker-heartbeat"))  # noqa: S108


class Command(BaseCommand):
    help = "Process the e-mail outbox."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--loop", action="store_true")
        parser.add_argument("--interval", type=float, default=2.0)

    def handle(self, *args: Any, **options: Any) -> None:
        worker = f"worker-{os.getpid()}"
        while True:
            counts = process_batch(worker=worker)
            HEARTBEAT.touch()
            if counts["sent"] or counts["failed"] or counts["dead"]:
                self.stdout.write(f"outbox: {counts}")
            if not options["loop"]:
                return
            time.sleep(options["interval"])
