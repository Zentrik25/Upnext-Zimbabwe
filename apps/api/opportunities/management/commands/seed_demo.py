"""Load clearly fictional demonstration data for local development (never for production)."""

from __future__ import annotations

import os
import secrets
from datetime import date
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.utils import timezone

from access.registry import Role
from accounts.models import AccountStatus, StaffMfaDevice, StaffRoleAssignment, User
from catalog.models import Location, Organisation, Sector, Skill
from catalog.seed import seed_taxonomies, slugify_skill
from opportunities import demo, workflow
from opportunities.models import Opportunity

USERS = [
    ("contributor@demo.upnext.example", "Demo Contributor", [Role.CONTRIBUTOR]),
    ("editor@demo.upnext.example", "Demo Editor", [Role.EDITOR]),
    ("second-editor@demo.upnext.example", "Demo Second Editor", [Role.EDITOR, Role.CONTRIBUTOR]),
    ("admin@demo.upnext.example", "Demo Administrator", [Role.ADMINISTRATOR]),
]


class Command(BaseCommand):
    help = "Create demo staff users and fictional listings in every category (development only)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--force", action="store_true", help="Allow running with DEBUG off.")

    def handle(self, *args: Any, **options: Any) -> None:
        if not (settings.DEBUG or options["force"]):
            raise CommandError("Demo data is for development; pass --force to load it anyway.")
        with transaction.atomic():
            seed_taxonomies()
            users, passwords = self._users()
            self._listings(users)
        for email, password in passwords.items():
            self.stdout.write(f"{email}  password: {password}")
        if not passwords:
            self.stdout.write("Demo users already exist (passwords unchanged).")

    def _users(self) -> tuple[dict[str, User], dict[str, str]]:
        users: dict[str, User] = {}
        passwords: dict[str, str] = {}
        for email, name, roles in USERS:
            user = User.objects.filter(email=email).first()
            if user is None:
                # A shared password is for throwaway local/CI stacks only (set UPNEXT_DEMO_PASSWORD yourself).
                password = os.environ.get("UPNEXT_DEMO_PASSWORD") or secrets.token_urlsafe(16)
                user = User.objects.create_user(
                    email, password, name, status=AccountStatus.ACTIVE, email_verified_at=timezone.now()
                )
                for role in roles:
                    StaffRoleAssignment.objects.create(user=user, role=role, reason="Demo data (seed_demo)")
                passwords[email] = password
                # Demo staff start with two-step verification already set up (see `demo_totp_code`).
                StaffMfaDevice.objects.create(
                    user=user, nonce=secrets.token_hex(16), confirmed_at=timezone.now()
                )
            users[email.split("@")[0]] = user
        return users, passwords

    def _listings(self, users: dict[str, User]) -> None:
        if Opportunity.objects.exists():
            self.stdout.write("Listings already exist; skipping.")
            return
        contributor, editor = users["contributor"], users["editor"]
        second = users["second-editor"]
        admin_user = users["admin"]
        org_ids = {}
        for suffix, (name, website) in demo.ORGANISATIONS.items():
            org, _ = Organisation.objects.get_or_create(
                name=name, defaults={"website_url": website, "created_by": admin_user}
            )
            org_ids[suffix] = str(org.pk)
        loc = {s: str(pk) for s, pk in Location.objects.values_list("slug", "pk")}
        sec = {s: str(pk) for s, pk in Sector.objects.values_list("slug", "pk")}
        skills = {slugify_skill(n): str(pk) for n, pk in Skill.objects.values_list("name", "pk")}
        today = date.today()
        for index, name in enumerate(demo.EXAMPLE_NAMES):
            category, content = demo.build_content(
                name,
                organisation_ids=org_ids,
                location_ids=loc,
                sector_ids=sec,
                skill_ids=skills,
                today=today,
            )
            opp = workflow.create_draft(contributor, category_code=category, content=content)
            opp.refresh_from_db()
            workflow.submit(contributor, opp.pk, expected_row_version=opp.row_version)
            opp.refresh_from_db()
            workflow.approve(
                editor if index % 2 == 0 else second,
                opp.pk,
                expected_row_version=opp.row_version,
                checklist={
                    "source_reviewed": True,
                    "duplicates_reviewed": True,
                    "content_matches_source": True,
                },
            )
            opp.refresh_from_db()
            # A Contributor-only author cannot publish: the other editor (or the approver) does.
            workflow.publish(
                second if index % 2 == 0 else editor, opp.pk, expected_row_version=opp.row_version
            )
            if index % 3 == 0:
                workflow.record_verification(
                    admin_user,
                    opp.pk,
                    version_no=1,
                    level="source_checked",
                    method="source_page_review",
                    outcome="confirmed",
                    evidence_note="Compared the listing with the issuer notice at the cited address.",
                )
        self._pipeline_examples(contributor, editor, org_ids, loc, sec, skills, today)

    def _pipeline_examples(
        self, contributor: User, editor: User, org_ids: Any, loc: Any, sec: Any, skills: Any, today: date
    ) -> None:
        """Non-public items so the staff queues and the public leak checks have something to show."""
        for name, steps in (
            ("jobs-2", "draft"),
            ("internships-2", "in_review"),
            ("scholarships-2", "approved"),
            ("tenders-2", "rejected"),
        ):
            category, content = demo.build_content(
                name,
                organisation_ids=org_ids,
                location_ids=loc,
                sector_ids=sec,
                skill_ids=skills,
                today=today,
            )
            content["title"] = f"{content['title']} (demo, {steps})"
            # Distinct addresses so these separate demo items are not flagged as hard duplicates.
            for source in content["sources"]:
                if source.get("url"):
                    source["url"] = f"{source['url'].rstrip('/')}/demo-{steps}"
            if content.get("application_url"):
                content["application_url"] = f"{content['application_url'].rstrip('/')}/demo-{steps}"
            opp = workflow.create_draft(contributor, category_code=category, content=content)
            if steps == "draft":
                continue
            opp.refresh_from_db()
            workflow.submit(contributor, opp.pk, expected_row_version=opp.row_version)
            if steps == "in_review":
                continue
            opp.refresh_from_db()
            if steps == "approved":
                workflow.approve(
                    editor,
                    opp.pk,
                    expected_row_version=opp.row_version,
                    checklist={
                        "source_reviewed": True,
                        "duplicates_reviewed": True,
                        "content_matches_source": True,
                    },
                )
            else:
                workflow.reject(
                    editor,
                    opp.pk,
                    expected_row_version=opp.row_version,
                    reason_code="source_unclear",
                    reason="The cited source does not show the closing date.",
                )
