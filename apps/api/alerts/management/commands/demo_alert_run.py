"""Make one person's job alert due now and run a pass (development and CI only).

The browser tests use it so a daily or weekly alert can be seen without waiting: the alert's position is moved
back in time, so the demo listings published since then count as new. Refused unless `UPNEXT_DEMO_TOOLS=1`.
It only queues outbox rows; the throwaway stack's worker writes them to the file spool, never to a provider.
"""

from __future__ import annotations

import os
from datetime import timedelta
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.utils import timezone

from alerts import service
from alerts.models import JobAlert


class Command(BaseCommand):
    help = "Move a demo alert's position back and run one pass."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--email", required=True)
        parser.add_argument("--days-back", type=int, default=3650)

    def handle(self, *args: Any, **options: Any) -> None:
        if os.environ.get("UPNEXT_DEMO_TOOLS") != "1":
            raise CommandError("Set UPNEXT_DEMO_TOOLS=1 (throwaway demo stacks only).")
        alert = JobAlert.objects.filter(user__email=options["email"], enabled=True).first()
        if alert is None:
            raise CommandError("No enabled alert for that address.")
        alert.last_checked_at = timezone.now() - timedelta(days=options["days_back"])
        alert.save(update_fields=["last_checked_at", "updated_at"])
        result = service.run_due()
        self.stdout.write(f"{result.status} checked={result.checked} queued={result.queued}")
