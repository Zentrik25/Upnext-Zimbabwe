"""Describe a database for backup/restore rehearsals (P5-04): row counts of every table, migration state and a
few invariants. Run it against the source before the backup and against the restored copy; the two outputs
must be identical (`--json`). Reads only; changes nothing.
"""

from __future__ import annotations

import json
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from psycopg import sql

EXCLUDED = {"django_session", "core_jobrun"}  # change while the stack runs; not part of the comparison


class Command(BaseCommand):
    help = "Print row counts, pending migrations and invariants; --expect FILE compares with a saved run."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--json", action="store_true")
        parser.add_argument(
            "--expect", help="JSON file written earlier by --json; any difference is an error"
        )
        parser.add_argument(
            "--smoke", action="store_true", help="Also answer the readiness probe and a public list request"
        )

    def handle(self, *args: Any, **options: Any) -> None:
        with connection.cursor() as cur:
            cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
            tables = [r[0] for r in cur.fetchall() if r[0] not in EXCLUDED]
            counts: dict[str, int] = {}
            for t in tables:
                cur.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(t)))
                counts[t] = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal")
            triggers = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'")
            indexes = cur.fetchone()[0]
        executor = MigrationExecutor(connection)
        pending = len(executor.migration_plan(executor.loader.graph.leaf_nodes()))
        report = {"counts": counts, "triggers": triggers, "indexes": indexes, "pending_migrations": pending}
        if options["json"]:
            self.stdout.write(json.dumps(report, sort_keys=True))
        else:
            self.stdout.write(
                f"{len(counts)} tables, {sum(counts.values())} rows, {triggers} triggers, {indexes} indexes"
            )
            self.stdout.write(f"pending migrations: {pending}")
        problems = []
        if pending:
            problems.append(f"{pending} pending migration(s)")
        if options["expect"]:
            with open(options["expect"]) as fh:
                expected = json.load(fh)
            for key in ("triggers", "indexes", "pending_migrations"):
                if expected.get(key) != report[key]:
                    problems.append(f"{key}: expected {expected.get(key)}, found {report[key]}")
            for t in sorted(set(expected["counts"]) | set(counts)):
                if expected["counts"].get(t) != counts.get(t):
                    problems.append(f"{t}: expected {expected['counts'].get(t)} rows, found {counts.get(t)}")
        if options["smoke"]:
            from django.test import Client

            client = Client(HTTP_HOST="localhost")
            for path in ("/health/ready", "/api/v1/opportunities?limit=1", "/api/v1/sitemap"):
                status = client.get(path, secure=True).status_code
                if status != 200:
                    problems.append(f"GET {path} answered {status}")
        if problems:
            raise CommandError("; ".join(problems))
        if options["expect"]:
            self.stdout.write("restored database matches the source")
