"""The background worker: the e-mail outbox every cycle, account deletions and retention every few minutes."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from accounts import deletion, retention
from core import alerts as alert_catalogue
from core.models import JobRun
from notifications.services import process_batch, status_summary

logger = logging.getLogger("upnext.worker")
HEARTBEAT = Path(os.environ.get("UPNEXT_WORKER_HEARTBEAT", "/tmp/upnext-worker-heartbeat"))  # noqa: S108


class Command(BaseCommand):
    help = "Run the worker loop (or one cycle with --once)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=float, default=2.0)
        parser.add_argument("--housekeeping-every", type=float, default=300.0, help="seconds between jobs")

    def handle(self, *args: Any, **options: Any) -> None:
        worker, last_housekeeping, last_recorded = f"worker-{os.getpid()}", 0.0, -1e9
        debounce = alert_catalogue.Debouncer()
        while True:
            if options["once"] or time.monotonic() - last_housekeeping >= options["housekeeping_every"]:
                try:
                    deleted = deletion.execute_due()
                    removed = retention.run()
                except Exception:
                    JobRun.record("housekeeping", ok=False, detail="housekeeping raised; see the log")
                    raise
                last_housekeeping = time.monotonic()
                JobRun.record("housekeeping", detail=f"deleted={deleted} removed={sum(removed.values())}")
                if alerts := status_summary()["alerts"]:
                    logger.warning(
                        "outbox needs attention", extra={"event": "outbox.alert", "alerts": alerts}
                    )
                try:
                    alert_catalogue.notify(debounce.due(alert_catalogue.evaluate()))
                except Exception:  # monitoring must never stop the worker
                    logger.exception("alert evaluation failed", extra={"event": "alert.evaluation_failed"})
                if deleted or any(removed.values()):
                    logger.info(
                        "housekeeping", extra={"event": "worker.housekeeping", "deleted": deleted, **removed}
                    )
            counts = process_batch(worker=worker)  # after housekeeping: its notices go out in the same cycle
            HEARTBEAT.touch()
            if (
                options["once"] or time.monotonic() - last_recorded >= 30
            ):  # a row update every cycle would only churn
                JobRun.record("worker", detail="cycle")
                last_recorded = time.monotonic()
            if any(counts.values()):
                self.stdout.write(f"outbox: {counts}")
            if options["once"]:
                return
            time.sleep(options["interval"])
