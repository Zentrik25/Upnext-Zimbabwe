"""Preflight for a deployment (P5-03). Exit status 1 when any blocking finding exists. Changes nothing."""

from __future__ import annotations

import json
import os
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import connection

from core import preflight


class Command(BaseCommand):
    help = "Check settings, database privileges and (with --url) a running stack's headers, cookies and TLS."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--url", help="Public https address of a running stack to probe, e.g. https://localhost:8443"
        )
        parser.add_argument("--http-url", help="Plain-http address that must redirect to https")
        parser.add_argument(
            "--ca-file", help="CA bundle that signed the stack's certificate (local TLS rehearsal)"
        )
        parser.add_argument("--json", action="store_true", help="Machine-readable output")
        parser.add_argument("--skip-database", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        findings = preflight.settings_findings(settings, dict(os.environ))
        if not options["skip_database"]:
            findings += preflight.database_findings(connection, settings)
        if options["url"]:
            findings += preflight.http_findings(
                options["url"],
                ca_file=options["ca_file"],
                http_url=options["http_url"],
                relaxed=settings.UPNEXT_ENVIRONMENT == "local-prod-like",
            )
        passed, warned, failed = preflight.summarise(findings)
        if options["json"]:
            self.stdout.write(json.dumps([f.__dict__ for f in findings], indent=2))
        else:
            for f in findings:
                if f.status != preflight.PASS:
                    self.stdout.write(f"{f.status.upper():5} [{f.group}] {f.name}: {f.detail}")
            self.stdout.write(
                f"{passed} passed, {warned} warnings, {failed} failures ({settings.UPNEXT_ENVIRONMENT})"
            )
        if failed:
            raise CommandError(f"{failed} blocking finding(s).")
