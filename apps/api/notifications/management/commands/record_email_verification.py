"""Record that e-mail delivery was verified by a person (P5-07). Refuses unless the checks can be true."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from notifications import config, verification


class Command(BaseCommand):
    help = (
        "record_email_verification --provider NAME --operator NAME --mailboxes gmail,outlook,local-isp "
        "--spf --dkim --dmarc: run after check_email_config --send-test reached real inboxes."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--provider", required=True)
        parser.add_argument("--operator", required=True)
        parser.add_argument(
            "--mailboxes", required=True, help="comma-separated families that received the test mail"
        )
        parser.add_argument("--spf", action="store_true", help="SPF passes for the sender domain")
        parser.add_argument("--dkim", action="store_true", help="DKIM signs and passes")
        parser.add_argument("--dmarc", action="store_true", help="a DMARC policy is published")
        parser.add_argument("--note", default="")
        parser.add_argument("--min-mailboxes", type=int, default=3)

    def handle(self, *args: Any, **options: Any) -> None:
        if settings.UPNEXT_EMAIL_BACKEND != "smtp":
            raise CommandError("Only a configured smtp sender can be verified (UPNEXT_EMAIL_BACKEND=smtp).")
        problems = config.problems(settings, production=True)
        if problems:
            raise CommandError("The sender configuration is not valid: " + " ".join(problems))
        families = sorted({m.strip() for m in options["mailboxes"].split(",") if m.strip()})
        unknown = [m for m in families if m not in verification.MAILBOX_FAMILIES]
        if unknown:
            raise CommandError(f"Unknown mailbox families: {', '.join(unknown)}")
        if len(families) < options["min_mailboxes"]:
            raise CommandError(
                f"Test mail must reach at least {options['min_mailboxes']} families of mailbox."
            )
        missing = [n for n in ("spf", "dkim", "dmarc") if not options[n]]
        if missing:
            raise CommandError(f"Domain authentication not confirmed: {', '.join(missing)}.")
        row = verification.EmailDeliveryVerification.objects.create(
            provider=options["provider"][:40],
            config_hash=verification.config_hash(),
            mailboxes=families,
            spf_ok=True,
            dkim_ok=True,
            dmarc_ok=True,
            operator=options["operator"][:80],
            note=options["note"][:300],
        )
        self.stdout.write(f"recorded: {row}")
