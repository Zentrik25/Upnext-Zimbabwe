"""Remove a staff member's two-step device so they can enrol again (audited, privileged).

An Administrator resets someone else with `--by`. Without `--by` it is the break-glass route for
a person with shell access to the server (recorded as a system action). An Administrator
cannot reset themselves.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from accounts import mfa
from accounts.models import User


class Command(BaseCommand):
    help = "Reset a staff member's two-step verification device."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--email", required=True)
        parser.add_argument("--reason", required=True, help="At least 10 characters.")
        parser.add_argument(
            "--by", help="E-mail of the administrator performing the reset (omit for break-glass)."
        )

    def handle(self, *args: Any, **options: Any) -> None:
        if len(options["reason"].strip()) < 10:
            raise CommandError("The reason must be at least 10 characters.")
        target = User.objects.filter(email=options["email"]).first()
        if target is None:
            raise CommandError("No such user.")
        actor = None
        if options["by"]:
            actor = User.objects.filter(email=options["by"]).first()
            if actor is None or not actor.has_permission_code("user.status.change"):
                raise CommandError("--by must be an active Administrator.")
            if actor.pk == target.pk:
                raise CommandError("Administrators cannot reset their own two-step verification.")
        if not mfa.reset(target, actor=actor, reason=options["reason"].strip()):
            raise CommandError("That user has no two-step device.")
        self.stdout.write("Two-step verification reset; the user re-enrols at next staff sign-in.")
