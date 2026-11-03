"""Prove the service-account key works WITHOUT sending any notification: indexing_check [--search-console]."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from seo import google


class Command(BaseCommand):
    help = "Load the key and obtain an access token for the Indexing API (and optionally Search Console)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--search-console", action="store_true")

    def handle(self, *args: Any, **options: Any) -> None:
        try:
            credentials = google.load_credentials()
        except google.CredentialsError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(f"key loaded for {credentials.client_email}")
        tokens = google.TokenSource(credentials)
        scopes = [google.SCOPE_INDEXING] + (
            [google.SCOPE_SEARCH_CONSOLE] if options["search_console"] else []
        )
        for scope in scopes:
            try:
                tokens.token(scope)
            except google.ApiError as exc:
                raise CommandError(f"Google did not issue a token for {scope}: {exc}") from exc
            self.stdout.write(f"token issued for {scope}")
        self.stdout.write(
            "Nothing was sent. The account must also be an Owner of the property in Search Console "
            "(docs/engineering/SEARCH_CONSOLE_GUIDE.md section 7)."
        )
