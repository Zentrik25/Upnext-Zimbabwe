"""After restoring an older backup, delete again the accounts whose deletion had already completed (P5-04).

A restored database can contain people who were deleted after the backup was taken. The only durable record of
a completed deletion is the structured log line `account.deletion_completed` (opaque user id, no personal
data), which is kept off the database. Feed those lines (JSON, one per line)
or a plain file of ids to this command.
Each account is deleted exactly as in the normal lifecycle, without sending a second completion e-mail.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from accounts import deletion


def parse_ids(text: str) -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        candidate = line
        if line.startswith("{"):
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if record.get("event") != "account.deletion_completed":
                continue
            candidate = str(record.get("user_id", ""))
        try:
            ids.append(uuid.UUID(candidate))
        except ValueError:
            continue
    return list(dict.fromkeys(ids))


class Command(BaseCommand):
    help = "Re-apply completed deletions from a log file or a file of user ids."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("file", type=Path)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        path: Path = options["file"]
        if not path.is_file():
            raise CommandError(f"{path} not found")
        ids = parse_ids(path.read_text())
        done = 0
        for user_id in ids:
            if options["dry_run"]:
                self.stdout.write(f"would re-apply {user_id}")
                continue
            done += int(deletion.execute(user_id, restored=True))
        self.stdout.write(f"{len(ids)} id(s) read, {done} deletion(s) re-applied")
