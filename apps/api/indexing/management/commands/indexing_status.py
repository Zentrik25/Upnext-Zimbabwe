"""Show the Google Indexing API queue: mode, counts, today's quota and the latest errors (no secrets)."""

from __future__ import annotations

import json
from typing import Any

from django.core.management.base import BaseCommand

from indexing.service import status_summary


class Command(BaseCommand):
    help = "Print the Indexing API queue state as JSON."

    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write(json.dumps(status_summary(), indent=2, default=str))
