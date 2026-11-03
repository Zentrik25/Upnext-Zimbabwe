"""Import listings from a reviewed file as DRAFTS (P5-06). Never submits, approves, verifies or publishes."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from accounts.models import User
from opportunities import importer


class Command(BaseCommand):
    help = "import_drafts FILE --as EMAIL [--dry-run] [--json]: create drafts authored by that staff member."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("file", type=Path)
        parser.add_argument(
            "--as", dest="author", required=True, help="E-mail of the staff member who will author the drafts"
        )
        parser.add_argument("--dry-run", action="store_true", help="Validate everything, write nothing")
        parser.add_argument(
            "--skip-invalid", action="store_true", help="Create the valid rows even if others are invalid"
        )
        parser.add_argument("--json", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        path: Path = options["file"]
        if not path.is_file():
            raise CommandError(f"{path} not found")
        text = path.read_text(encoding="utf-8")
        try:
            items = importer.read_items(text)
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        actor = User.objects.filter(email__iexact=options["author"]).first()
        if actor is None or not actor.is_active:
            raise CommandError("No active staff member with that e-mail address.")
        dry = options["dry_run"]
        # Validate first; unless the operator accepts partial imports, nothing is written when any row is bad.
        checked = importer.import_drafts(actor, items, dry_run=True)
        bad = [r for r in checked if r.status in ("invalid", "duplicate")]
        results = checked
        if not dry and (not bad or options["skip_invalid"]):
            valid = [item for item, r in zip(items, checked, strict=True) if r.status == "would_create"]
            written = importer.import_drafts(
                actor, valid, dry_run=False, source_sha256=importer.fingerprint(text)
            )
            it = iter(written)
            results = [next(it) if r.status == "would_create" else r for r in checked]
        if options["json"]:
            self.stdout.write(json.dumps([r.__dict__ for r in results], indent=2))
        else:
            for r in results:
                line = f"{r.index:>4} {r.status:<12} {r.title}"
                self.stdout.write(line)
                for p in r.problems:
                    self.stdout.write(f"       problem: {p}")
                for n in r.notes:
                    self.stdout.write(f"       note: {n}")
            counts = {
                s: sum(r.status == s for r in results)
                for s in ("created", "would_create", "invalid", "duplicate")
            }
            self.stdout.write(str(counts))
        if bad and not options["skip_invalid"]:
            raise CommandError(
                f"{len(bad)} row(s) need attention; nothing was written."
                if not dry
                else f"{len(bad)} row(s) need attention."
            )
