"""Staff screens for the employer portal: who sees them, and that every decision goes through the service."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from django.test import Client
from django.urls import reverse

from accounts.models import User
from audit.models import AuditEvent
from employers import services
from employers.models import ClaimStatus, EmployerMembership, OrganisationVerification, ProfileState

pytestmark = pytest.mark.django_db

CLAIM = {
    "organisation_name": "Acme Mining Zimbabwe",
    "role_title": "HR manager",
    "evidence_note": "Our official address is hr@acme.example.org and our registration is on file.",
}
PROFILE = {"about": "Acme Mining is a fictional company used in tests. It describes itself in plain text."}


def logged_in(user: User) -> Client:
    client = Client()
    client.force_login(user)
    return client


@pytest.fixture
def employer(make_user: Callable[..., User]) -> User:
    return make_user(email="employer@example.org", display_name="Employer One")


def test_only_reviewers_see_the_employer_screens(people: dict[str, User], employer: User) -> None:
    url = reverse("admin:employers_organisationclaim_changelist")
    assert logged_in(people["editor"]).get(url).status_code == 200
    assert logged_in(people["admin"]).get(url).status_code == 200
    assert logged_in(people["author"]).get(url).status_code in (
        302,
        403,
    )  # a Contributor holds no employer.review
    assert logged_in(employer).get(url).status_code == 302  # not staff: sent to the staff login
    assert Client().get(url).status_code == 302


def test_an_editor_approves_a_claim_from_the_staff_site(people: dict[str, User], employer: User) -> None:
    claim = services.submit_claim(employer, CLAIM)
    web = logged_in(people["editor"])
    page = web.get(reverse("admin:employers_organisationclaim_decide", args=[claim.pk]))
    assert (
        page.status_code == 200
        and b"Evidence offered" in page.content
        and b"employer@example.org" in page.content
    )
    missing = web.post(
        reverse("admin:employers_organisationclaim_decide", args=[claim.pk]),
        {"decision": "approve", "role": "owner"},
    )
    assert (
        missing.status_code == 200 and b"method" in missing.content
    )  # service refused: no verification recorded
    assert not EmployerMembership.objects.exists()
    done = web.post(
        reverse("admin:employers_organisationclaim_decide", args=[claim.pk]),
        {
            "decision": "approve",
            "role": "owner",
            "method": "document_review",
            "evidence_note": "Certificate on file.",
        },
    )
    assert done.status_code == 302
    claim.refresh_from_db()
    assert claim.status == ClaimStatus.APPROVED and OrganisationVerification.objects.count() == 1
    again = web.get(reverse("admin:employers_organisationclaim_decide", args=[claim.pk]))
    assert again.status_code == 404  # decided claims cannot be decided again


def test_a_reviewer_cannot_use_the_screen_to_decide_their_own_claim(people: dict[str, User]) -> None:
    claim = services.submit_claim(people["editor"], CLAIM)
    response = logged_in(people["editor"]).post(
        reverse("admin:employers_organisationclaim_decide", args=[claim.pk]),
        {
            "decision": "approve",
            "role": "owner",
            "method": "other",
            "evidence_note": "Self approval attempt.",
        },
    )
    assert response.status_code == 200 and b"cannot decide your own claim" in response.content
    claim.refresh_from_db()
    assert claim.status == ClaimStatus.PENDING
    assert AuditEvent.objects.filter(action="employer.claim.decide.denied").exists()


def test_profile_review_rejection_and_revocation_screens(people: dict[str, User], employer: User) -> None:
    claim = services.submit_claim(employer, CLAIM)
    services.decide_claim(
        people["editor"], claim.pk, approve=True, method="phone_callback", evidence_note="Called back."
    )
    claim.refresh_from_db()
    org = claim.organisation
    assert org is not None
    revision = services.submit_profile_revision(employer, org.pk, PROFILE)
    web = logged_in(people["editor2"])
    url = reverse("admin:employers_profilerevision_decide", args=[revision.pk])
    assert web.post(url, {"decision": "reject", "reason": "no"}).status_code == 200  # a reason is required
    assert (
        web.post(url, {"decision": "reject", "reason": "The text makes claims we cannot check."}).status_code
        == 302
    )
    revision.refresh_from_db()
    assert revision.state == ProfileState.REJECTED

    verification = OrganisationVerification.objects.get(organisation=org)
    revoke_url = reverse("admin:employers_organisationverification_revoke", args=[verification.pk])
    editor_attempt: Any = logged_in(people["editor"]).post(
        revoke_url, {"reason": "Registration lapsed, see file."}
    )
    assert (
        editor_attempt.status_code == 200 and b"permission_denied" in editor_attempt.content
    )  # administrators only
    assert OrganisationVerification.objects.get(pk=verification.pk).revoked_at is None
    admin_done = logged_in(people["admin"]).post(revoke_url, {"reason": "Registration lapsed, see file."})
    assert admin_done.status_code == 302
    assert not services.is_verified(org.pk)

    membership = EmployerMembership.objects.get(user=employer)
    member_url = reverse("admin:employers_employermembership_revoke", args=[membership.pk])
    assert (
        logged_in(people["editor"])
        .post(member_url, {"reason": "Left the company, confirmed by HR."})
        .status_code
        == 302
    )
    membership.refresh_from_db()
    assert membership.revoked_at is not None
