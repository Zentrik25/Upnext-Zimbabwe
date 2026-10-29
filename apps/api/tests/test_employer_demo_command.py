"""The staff-side helper used by the browser tests: demo tools only, and it still obeys the real rules."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from accounts.models import User
from employers import listings, services
from employers.models import ClaimStatus, OrganisationClaim
from opportunities.models import ListingStatus, Opportunity
from tests.factories import World

pytestmark = pytest.mark.django_db

CLAIM = {
    "organisation_name": "Demo Employer Ltd",
    "role_title": "HR manager",
    "evidence_note": "Our official address is hr@demo-employer.example.org and registration is on file.",
}


def test_refused_without_demo_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("UPNEXT_DEMO_TOOLS", raising=False)
    with pytest.raises(CommandError, match="UPNEXT_DEMO_TOOLS"):
        call_command("demo_employer_review", approve_claim="x@example.org")


def test_claim_listing_and_profile_are_decided_through_the_services(
    monkeypatch: pytest.MonkeyPatch, make_user: Callable[..., User], world: World
) -> None:
    monkeypatch.setenv("UPNEXT_DEMO_TOOLS", "1")
    make_user(email="editor@demo.upnext.example", roles=("editor",))
    make_user(email="second-editor@demo.upnext.example", roles=("editor", "contributor"))
    employer = make_user(email="boss@example.org")
    with pytest.raises(CommandError, match="No waiting claim"):
        call_command("demo_employer_review", approve_claim="boss@example.org")
    services.submit_claim(employer, CLAIM)
    call_command("demo_employer_review", approve_claim="boss@example.org")
    claim = OrganisationClaim.objects.get(user=employer)
    assert claim.status == ClaimStatus.APPROVED and claim.organisation is not None
    category, data = world.employer_content("jobs-1", organisation_id=str(claim.organisation.pk))
    data.pop("sources", None)
    opp = listings.create(employer, claim.organisation.pk, category, data)
    listings.submit(employer, opp.pk, opp.row_version)
    call_command("demo_employer_review", publish_listing=data["title"][:8])
    assert Opportunity.objects.get(pk=opp.pk).status == ListingStatus.PUBLISHED
    call_command("demo_employer_review", withdraw_listing=data["title"][:8])
    assert Opportunity.objects.get(pk=opp.pk).status == ListingStatus.WITHDRAWN
    with pytest.raises(CommandError, match="No published employer listing"):
        call_command("demo_employer_review", withdraw_listing=data["title"][:8])
    revision = services.submit_profile_revision(
        employer, claim.organisation.pk, {"about": "A fictional organisation used only in the browser tests."}
    )
    call_command("demo_employer_review", approve_profile="Demo Employer Ltd")
    revision.refresh_from_db()
    assert revision.profile.live_revision == revision
    with pytest.raises(CommandError, match="No employer listing"):
        call_command("demo_employer_review", reject_listing="nothing")
