"""Check the e-mail configuration without sending anything unless asked.

    manage.py check_email_config              # settings only
    manage.py check_email_config --connect    # also connect and authenticate (smtp)
    manage.py check_email_config --send-test --to you@example.org

Secrets are never printed.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from notifications import config
from notifications.sender import EmailMessage, SmtpSender, get_sender


class Command(BaseCommand):
    help = "Validate the e-mail settings; optionally connect or send a test message."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--connect", action="store_true")
        parser.add_argument("--send-test", action="store_true")
        parser.add_argument("--to")

    def handle(self, *args: Any, **options: Any) -> None:
        backend = settings.UPNEXT_EMAIL_BACKEND
        production = settings.UPNEXT_ENVIRONMENT == "production"
        self.stdout.write(f"backend: {backend}")
        if backend == "smtp":
            self.stdout.write(
                f"smtp: {settings.UPNEXT_SMTP_HOST}:{settings.UPNEXT_SMTP_PORT} "
                f"security={settings.UPNEXT_SMTP_SECURITY} "
                f"auth={'yes' if settings.UPNEXT_SMTP_USER else 'no'} from={settings.UPNEXT_EMAIL_FROM}"
            )
        found = config.problems(settings, production=production)
        if found:
            raise CommandError("\n".join(found))
        if backend == "none":
            self.stdout.write(
                "Delivery is disabled: queued mail waits in the outbox until a provider is configured."
            )
        if options["connect"]:
            sender = get_sender()
            if not isinstance(sender, SmtpSender):
                raise CommandError("--connect needs UPNEXT_EMAIL_BACKEND=smtp.")
            try:
                sender.check()
            except Exception as exc:  # report the failure class, not details that might include credentials
                raise CommandError(f"Could not connect or authenticate ({type(exc).__name__}).") from None
            self.stdout.write("connection and authentication: ok")
        if options["send_test"]:
            if not options["to"]:
                raise CommandError("--send-test needs --to.")
            result = get_sender().send(
                EmailMessage(
                    idempotency_key=f"test-{uuid.uuid4().hex}",
                    to=options["to"],
                    subject="NextJob Zimbabwe test message",
                    body="This is a test message from the NextJob Zimbabwe e-mail configuration check.\n",
                    kind="test",
                )
            )
            if result.outcome != "sent":
                raise CommandError(f"Test message not sent: {result.outcome} ({result.error_code}).")
            self.stdout.write("test message: sent")
        self.stdout.write("configuration: ok")
