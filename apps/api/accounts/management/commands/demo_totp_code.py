"""Print the current two-step code for a demo staff account (development and CI only).

The browser tests use it for the throwaway demo accounts created by `seed_demo`. It resets the replay guard so
repeated sign-ins within one time step work. Refused unless `UPNEXT_DEMO_TOOLS=1`.
"""

from __future__ import annotations

import os
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from accounts import mfa
from accounts.models import StaffMfaDevice


class Command(BaseCommand):
    help = "Print the current TOTP code for a demo staff account."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--email", required=True)

    def handle(self, *args: Any, **options: Any) -> None:
        if os.environ.get("UPNEXT_DEMO_TOOLS") != "1":
            raise CommandError("Set UPNEXT_DEMO_TOOLS=1 (throwaway demo stacks only).")
        email = options["email"]
        if not email.endswith("@demo.upnext.example"):
            raise CommandError("Only demo accounts (@demo.upnext.example).")
        device = StaffMfaDevice.objects.filter(user__email=email, confirmed_at__isnull=False).first()
        if device is None:
            raise CommandError("No confirmed device for that account.")
        device.last_used_step = 0
        device.save(update_fields=["last_used_step"])
        self.stdout.write(mfa.code_at(mfa.secret_for(device), mfa.current_step()))
