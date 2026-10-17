"""The background worker: the e-mail outbox every cycle, account deletions and retention every few minutes."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from accounts import deletion, retention
from notifications.services import process_batch

logger = logging.getLogger("upnext.worker")
HEARTBEAT = Path(os.environ.get("UPNEXT_WORKER_HEARTBEAT", "/tmp/upnext-worker-heartbeat"))  # noqa: S108


class Command(BaseCommand):
    help = "Run the worker loop (or one cycle with --once)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=float, default=2.0)
        parser.add_argument("--housekeeping-every", type=float, default=300.0, help="seconds between jobs")

    def handle(self, *args: Any, **options: Any) -> None:
        worker, last_housekeeping = f"worker-{os.getpid()}", 0.0
        while True:
            if options["once"] or time.monotonic() - last_housekeeping >= options["housekeeping_every"]:
                deleted = deletion.execute_due()
                removed = retention.run()
                last_housekeeping = time.monotonic()
                if deleted or any(removed.values()):
                    logger.info(
                        "housekeeping", extra={"event": "worker.housekeeping", "deleted": deleted, **removed}
                    )
            counts = process_batch(worker=worker)  # after housekeeping: its notices go out in the same cycle
            HEARTBEAT.touch()
            if any(counts.values()):
                self.stdout.write(f"outbox: {counts}")
            if options["once"]:
                return
            time.sleep(options["interval"])
