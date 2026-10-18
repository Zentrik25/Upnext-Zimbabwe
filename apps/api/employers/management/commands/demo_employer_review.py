"""Play the staff side of the employer journey for browser tests (throwaway stacks only).

Every action runs through the real services as one of the fictional demo staff, so the same
separation-of-duties rules apply (the demo editor decides claims and profiles; the second editor
approves and publishes listings).
Refused unless `UPNEXT_DEMO_TOOLS=1`, which production refuses at start-up.
"""

from __future__ import annotations

import os
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from accounts.models import User
from employers import services
from employers.models import OrganisationClaim, ProfileRevision
from opportunities import workflow
from opportunities.models import Opportunity

EDITOR = "editor@demo.upnext.example"
SECOND_EDITOR = "second-editor@demo.upnext.example"
CHECKLIST = {"source_reviewed": True, "duplicates_reviewed": True, "content_matches_source": True}


def _staff(email: str) -> User:
    user = User.objects.filter(email=email).first()
    if user is None:
        raise CommandError(f"{email} does not exist; run seed_demo first.")
    return user


class Command(BaseCommand):
    help = "Decide a waiting claim, approve a profile revision, or approve and publish an employer listing."

    def add_arguments(self, parser: CommandParser) -> None:
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--approve-claim", metavar="EMAIL", help="the claimant's e-mail address")
        group.add_argument("--approve-profile", metavar="ORGANISATION_NAME")
        group.add_argument("--publish-listing", metavar="TITLE_FRAGMENT")
        group.add_argument("--reject-listing", metavar="TITLE_FRAGMENT")
        group.add_argument("--withdraw-listing", metavar="TITLE_FRAGMENT", help="clean up after a test run")

    def handle(self, *args: Any, **options: Any) -> None:
        if os.environ.get("UPNEXT_DEMO_TOOLS") != "1":
            raise CommandError("Set UPNEXT_DEMO_TOOLS=1 (throwaway demo stacks only).")
        if options["approve_claim"]:
            claim = OrganisationClaim.objects.filter(
                user__email=options["approve_claim"], status="pending"
            ).first()
            if claim is None:
                raise CommandError("No waiting claim for that address.")
            services.decide_claim(
                _staff(EDITOR),
                claim.pk,
                approve=True,
                method="document_review",
                evidence_note="Demo: fictional evidence checked by the demo editor.",
            )
        elif options["approve_profile"]:
            revision = ProfileRevision.objects.filter(
                profile__organisation__name=options["approve_profile"], state="pending"
            ).first()
            if revision is None:
                raise CommandError("No waiting profile revision for that organisation.")
            services.decide_profile_revision(_staff(EDITOR), revision.pk, approve=True)
        elif options["withdraw_listing"]:
            published = Opportunity.objects.filter(
                employer_binding__isnull=False,
                live_version__title__icontains=options["withdraw_listing"],
                status="published",
            ).first()
            if published is None:
                raise CommandError("No published employer listing matches.")
            workflow.withdraw(
                _staff(SECOND_EDITOR),
                published.pk,
                expected_row_version=published.row_version,
                reason="Demo: clean-up after the browser test.",
            )
        else:
            fragment = options["publish_listing"] or options["reject_listing"]
            opportunity = (
                Opportunity.objects.filter(
                    employer_binding__isnull=False,
                    pending_version__title__icontains=fragment,
                    status="in_review",
                )
                .order_by("-updated_at")
                .first()
            )
            if opportunity is None:
                raise CommandError("No employer listing in review matches.")
            editor = _staff(SECOND_EDITOR)
            if options["reject_listing"]:
                workflow.reject(
                    editor,
                    opportunity.pk,
                    expected_row_version=opportunity.row_version,
                    reason_code="other",
                    reason="Demo: the closing date needs to be clearer.",
                )
            else:
                workflow.approve(
                    editor, opportunity.pk, expected_row_version=opportunity.row_version, checklist=CHECKLIST
                )
                opportunity.refresh_from_db()
                workflow.publish(editor, opportunity.pk, expected_row_version=opportunity.row_version)
        self.stdout.write("done")
