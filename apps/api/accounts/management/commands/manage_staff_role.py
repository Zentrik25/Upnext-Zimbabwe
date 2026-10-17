"""Grant or revoke a staff role (audited). Role changes are privileged: they never happen as a side
effect of anything else, and every one writes an `audit_event` (ERD §3.1, matrix §2.3).

This is the command-line route chosen for Phase 2 (staff UI for role management waits for OQ-13)."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from access.registry import Role
from accounts.models import StaffRoleAssignment, User
from audit import services as audit


class Command(BaseCommand):
    help = "Grant or revoke a staff role for a user, with a recorded reason."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("action", choices=["grant", "revoke"])
        parser.add_argument("--email", required=True)
        parser.add_argument("--role", required=True, choices=[r.value for r in Role])
        parser.add_argument("--reason", required=True, help="At least 10 characters.")
        parser.add_argument("--by", required=True, help="E-mail of the administrator performing the change.")

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        if len(options["reason"].strip()) < 10:
            raise CommandError("The reason must be at least 10 characters.")
        actor = User.objects.filter(email=options["by"]).first()
        if actor is None or not actor.has_permission_code("user.role.grant"):
            raise CommandError("--by must be an active Administrator.")
        target = User.objects.filter(email=options["email"]).first()
        if target is None:
            raise CommandError("No such user.")
        active = StaffRoleAssignment.objects.filter(
            user=target, role=options["role"], revoked_at__isnull=True
        )
        if options["action"] == "grant":
            if active.exists():
                raise CommandError("The user already holds that role.")
            StaffRoleAssignment.objects.create(
                user=target, role=options["role"], granted_by=actor, reason=options["reason"].strip()
            )
        else:
            row = active.first()
            if row is None:
                raise CommandError("The user does not hold that role.")
            row.revoked_at, row.revoked_by = timezone.now(), actor
            row.save()
        audit.record(
            action=f"role.{options['action']}", object_type="user", object_id=target.pk, actor_id=actor.pk,
            severity="privileged", changes={"role": options["role"], "reason": options["reason"].strip()},
        )  # fmt: skip
        verb = "Granted" if options["action"] == "grant" else "Revoked"
        self.stdout.write(f"{verb} {options['role']} for {target.pk}.")
