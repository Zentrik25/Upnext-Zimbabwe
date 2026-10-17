"""Bootstrap a staff account for local development.

This is a stop-gap until role management (Phase 2) and the single-administrator bootstrap policy
(OQ-13) exist. The password is read from the environment or prompted — never taken as an argument.
"""

from __future__ import annotations

import getpass
import os
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from access.registry import Role
from accounts.models import AccountStatus, StaffRoleAssignment, User


class Command(BaseCommand):
    help = "Create an active, verified staff user with the given roles (development bootstrap)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--email", required=True)
        parser.add_argument("--display-name", required=True)
        parser.add_argument(
            "--role", action="append", choices=[r.value for r in Role], required=True, dest="roles"
        )

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        password = os.environ.get("UPNEXT_BOOTSTRAP_PASSWORD") or getpass.getpass("Password: ")
        if not password:
            raise CommandError("A password is required.")
        user = User.objects.create_user(
            options["email"],
            password,
            options["display_name"],
            status=AccountStatus.ACTIVE,
            email_verified_at=timezone.now(),
        )
        for role in dict.fromkeys(options["roles"]):
            StaffRoleAssignment.objects.create(
                user=user, role=role, reason="Development bootstrap (create_staff_user)"
            )
        self.stdout.write(f"Created staff user {user.pk} with roles: {', '.join(options['roles'])}")
