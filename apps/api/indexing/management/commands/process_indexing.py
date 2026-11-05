"""Send the Indexing API notifications that are due now (the worker does this every housekeeping cycle)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from indexing import service


class Command(BaseCommand):
    help = "Send due Indexing API notifications once (only when UPNEXT_INDEXING_MODE=live)."

    def handle(self, *args: Any, **options: Any) -> None:
        result = service.run()
        self.stdout.write(f"{result.status} {result.counts} {result.detail}".strip())
