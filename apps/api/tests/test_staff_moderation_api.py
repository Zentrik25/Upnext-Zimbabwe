"""Public-report moderation and employer review through the staff records API (D-46): the scenarios the Django
Admin screens used to be tested with. The services hold the rules; these tests pin that the API shows only what a
person may attempt and passes every decision to them."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from employers import services
from employers.models import EmployerMembership, OrganisationVerification, ProfileState
from opportunities.models import Opportunity
from reports import services as report_services
from reports.models import ListingReport, ReportStatus
from tests.factories import World, published

from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db

R = f"{S}/records"
NOTE = "Checked the source page and called the employer."


@pytest.fixture
def listing(world: World, people: dict[str, User]) -> Opportunity:
    return published(world, people["author_editor"], people["editor"])


@pytest.fixture
def report(listing: Opportunity) -> ListingReport:
    report_services.submit(
        str(listing.slug),
        {
            "reason": "payment_scam",
            "details": "They ask for a fee <script>alert(1)</script> before the interview.",
            "evidence_url": "https://example.org/proof",
            "contact_email": "reporter@example.org",
        },
        client_ident="c",
    )
    return ListingReport.objects.get()


def act(client: APIClient, report: ListingReport, name: str, **data: Any) -> Any:
    report.refresh_from_db()
    return send(
        client, "post", f"{R}/reports/{report.pk}/actions/{name}", {"row_version": report.row_version, **data}
    )


def refs(client: APIClient, query: str = "") -> list[str]:
    return [r["cells"]["reference"] for r in client.get(f"{R}/reports{query}").json()["data"]]


def test_staff_without_report_access_cannot_open_the_queue(
    report: ListingReport, people: dict[str, User]
) -> None:
    assert APIClient().get(f"{R}/reports").status_code in (401, 403)
    assert signed_in(people["seeker"]).get(f"{R}/reports").status_code == 403
    author = signed_in(people["author"])
    assert author.get(f"{R}/reports").status_code == 404
    assert author.get(f"{R}/reports/{report.pk}").status_code == 404
    assert act(author, report, "investigate").status_code == 404
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


def test_editors_and_administrators_see_the_queue(report: ListingReport, people: dict[str, User]) -> None:
    for name in ("editor", "editor2", "admin"):
        assert report.reference in refs(signed_in(people[name]))


def test_nothing_can_be_added_edited_or_deleted_outside_the_actions(
    report: ListingReport, people: dict[str, User]
) -> None:
    client = signed_in(people["admin"])
    for method in ("put", "patch", "delete"):
        assert send(client, method, f"{R}/reports/{report.pk}", {"status": "resolved"}).status_code == 405
    assert send(client, "post", f"{R}/reports", {}).status_code == 405
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


def test_queue_filters_and_search(report: ListingReport, people: dict[str, User]) -> None:
    client = signed_in(people["editor2"])
    assert report.reference in refs(client, "?queue=new")
    for queue in ("mine", "escalated", "closed"):
        assert report.reference not in refs(client, f"?queue={queue}")
    assert report.reference in refs(client, f"?q={report.reference}")
    assert report.reference not in refs(client, "?q=zzzz-no-match")
    act(client, report, "investigate")
    assert report.reference in refs(client, "?queue=mine")
    assert report.reference not in refs(client, "?queue=new")


def test_repeat_filter_and_escalated_first(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    client = signed_in(people["editor2"])
    assert report.reference not in refs(client, "?repeat=yes")
    report_services.submit(
        str(listing.slug),
        {"reason": "expired", "details": "The closing date passed last month."},
        client_ident="d",
    )
    other = ListingReport.objects.exclude(pk=report.pk).get()
    both = refs(client, "?repeat=yes")
    assert report.reference in both and other.reference in both
    act(client, other, "escalate", note=NOTE)
    assert refs(client).index(other.reference) < refs(client).index(report.reference)


def test_case_page_keeps_reporter_text_as_text_and_only_shows_https_links(
    report: ListingReport, people: dict[str, User]
) -> None:
    facts = {
        f["label"]: f["value"]
        for f in signed_in(people["editor2"]).get(f"{R}/reports/{report.pk}").json()["facts"]
    }
    assert (
        "<script>alert(1)</script>" in facts["Details (reporter's words)"]
    )  # JSON text; the page escapes it
    assert facts["Evidence link (not checked by us)"] == "https://example.org/proof"
    ListingReport.objects.filter(pk=report.pk).update(evidence_url="javascript:alert(1)")
    after = {
        f["label"]: f["value"]
        for f in signed_in(people["editor2"]).get(f"{R}/reports/{report.pk}").json()["facts"]
    }
    assert after["Evidence link (not checked by us)"] == "-"


def test_participants_may_note_and_escalate_but_not_decide(
    report: ListingReport, people: dict[str, User]
) -> None:
    mine = signed_in(people["author_editor"]).get(f"{R}/reports/{report.pk}").json()
    names = {a["name"] for a in mine["actions"]}
    assert {"note", "escalate"} <= names and not {"resolve", "dismiss", "listing"} & names
    assert "separation of duties" in mine["notice"]
    independent = {
        a["name"] for a in signed_in(people["editor2"]).get(f"{R}/reports/{report.pk}").json()["actions"]
    }
    assert {"investigate", "resolve", "dismiss", "listing"} <= independent


def test_full_moderation_path(report: ListingReport, people: dict[str, User]) -> None:
    client = signed_in(people["editor2"])
    assert act(client, report, "investigate").status_code == 200
    assert act(client, report, "note", note=NOTE).status_code == 200
    done = act(client, report, "resolve", resolution="no_action_needed", note=NOTE)
    assert done.status_code == 200 and done.json()["status"]["label"] == "Resolved"
    report.refresh_from_db()
    assert report.status == ReportStatus.RESOLVED and report.closed_by_id == people["editor2"].pk
    history = client.get(f"{R}/reports/{report.pk}").json()["sections"][-1]["rows"]
    assert any(NOTE in row["cells"][4] for row in history)
    assert AuditEvent.objects.filter(action="report.resolved", object_id=report.pk).exists()


def test_invalid_actions_are_refused_and_change_nothing(
    report: ListingReport, people: dict[str, User]
) -> None:
    client = signed_in(people["editor2"])
    short = act(client, report, "dismiss", resolution="spam", note="short")
    assert short.status_code == 400 and "note" in short.json()["error"]["fields"]
    assert act(client, report, "dismiss", resolution="not-a-reason", note=NOTE).status_code == 400
    assert act(client, report, "no-such-action").status_code == 404
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


def test_acting_on_the_listing_goes_through_the_workflow(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    response = act(
        signed_in(people["editor2"]), report, "listing", action="takedown", reason_code="fraud", reason=NOTE
    )
    assert response.status_code == 200, response.content
    listing.refresh_from_db()
    report.refresh_from_db()
    assert listing.status == "archived" and report.resolution == "listing_taken_down"
    assert AuditEvent.objects.filter(action="opportunity.takedown", object_id=listing.pk).exists()


def test_a_participant_cannot_decide_or_act_on_the_listing(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    client = signed_in(people["author_editor"])
    for name, data in (
        ("dismiss", {"resolution": "spam", "note": NOTE}),
        ("listing", {"action": "withdraw", "reason": NOTE}),
    ):
        refused = act(client, report, name, **data)
        assert refused.status_code == 403 and refused.json()["error"]["code"] == "action_unavailable"
    listing.refresh_from_db()
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN and listing.status == "published"


def test_a_stale_version_is_refused_and_a_get_changes_nothing(
    report: ListingReport, people: dict[str, User]
) -> None:
    client = signed_in(people["editor2"])
    stale = report.row_version
    act(client, report, "note", note=NOTE)
    old = send(client, "post", f"{R}/reports/{report.pk}/actions/note", {"row_version": stale, "note": NOTE})
    assert old.status_code == 409
    assert report.events.filter(action="note").count() == 1
    assert client.get(f"{R}/reports/{report.pk}/actions/investigate").status_code == 405
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


def test_only_administrators_are_offered_reopen(report: ListingReport, people: dict[str, User]) -> None:
    editor = signed_in(people["editor2"])
    act(editor, report, "dismiss", resolution="spam", note=NOTE)
    assert "reopen" not in {a["name"] for a in editor.get(f"{R}/reports/{report.pk}").json()["actions"]}
    admin = signed_in(people["admin"])
    assert "reopen" in {a["name"] for a in admin.get(f"{R}/reports/{report.pk}").json()["actions"]}
    assert act(admin, report, "reopen", note=NOTE).status_code == 200
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


# --- employer review ----------------------------------------------------------------------------------------------
CLAIM = {
    "organisation_name": "Acme Mining Zimbabwe",
    "role_title": "HR manager",
    "evidence_note": "Our official address is hr@acme.example.org and our registration is on file.",
}
PROFILE = {"about": "Acme Mining is a fictional company used in tests. It describes itself in plain text."}


@pytest.fixture
def employer(make_user: Callable[..., User]) -> User:
    return make_user(email="employer@example.org", display_name="Employer One")


def test_only_reviewers_see_the_employer_registers(people: dict[str, User], employer: User) -> None:
    services.submit_claim(employer, CLAIM)
    assert signed_in(people["editor"]).get(f"{R}/claims").status_code == 200
    assert signed_in(people["admin"]).get(f"{R}/claims").status_code == 200
    assert (
        signed_in(people["author"]).get(f"{R}/claims").status_code == 404
    )  # a contributor holds no employer.review
    assert signed_in(employer).get(f"{R}/claims").status_code == 403  # not staff
    assert APIClient().get(f"{R}/claims").status_code in (401, 403)


def test_a_claim_decision_needs_its_fields_and_creates_the_membership(
    people: dict[str, User], employer: User
) -> None:
    claim = services.submit_claim(employer, CLAIM)
    web = signed_in(people["editor"])
    detail = web.get(f"{R}/claims/{claim.pk}").json()
    facts = {f["label"]: f["value"] for f in detail["facts"]}
    assert "Evidence offered" in facts and "employer@example.org" in facts["Claimant"]
    url = f"{R}/claims/{claim.pk}/actions/decide"
    missing = send(web, "post", url, {"decision": "approve", "role": "owner"})
    assert missing.status_code in (400, 409)  # how it was verified is required
    claim.refresh_from_db()
    assert claim.status == "pending"
    done = send(
        web,
        "post",
        url,
        {"decision": "approve", "role": "owner", "method": "phone_callback", "evidence_note": "Called back."},
    )
    assert done.status_code == 200, done.content
    assert (
        OrganisationVerification.objects.count() == 1
        and EmployerMembership.objects.filter(user=employer).exists()
    )


def test_profile_review_rejection_and_revocation(people: dict[str, User], employer: User) -> None:
    claim = services.submit_claim(employer, CLAIM)
    services.decide_claim(
        people["editor"], claim.pk, approve=True, method="phone_callback", evidence_note="Called back."
    )
    claim.refresh_from_db()
    org = claim.organisation
    assert org is not None
    revision = services.submit_profile_revision(employer, org.pk, PROFILE)
    web = signed_in(people["editor2"])
    url = f"{R}/profiles/{revision.pk}/actions/decide"
    assert send(web, "post", url, {"decision": "reject", "reason": "no"}).status_code in (
        400,
        409,
    )  # a reason is required
    assert (
        send(
            web, "post", url, {"decision": "reject", "reason": "The text makes claims we cannot check."}
        ).status_code
        == 200
    )
    revision.refresh_from_db()
    assert revision.state == ProfileState.REJECTED

    verification = OrganisationVerification.objects.get(organisation=org)
    revoke = f"{R}/verifications/{verification.pk}/actions/revoke"
    attempt = send(signed_in(people["editor"]), "post", revoke, {"reason": "Registration lapsed, see file."})
    assert attempt.status_code in (400, 403)  # administrators only
    assert OrganisationVerification.objects.get(pk=verification.pk).revoked_at is None
    assert (
        send(
            signed_in(people["admin"]), "post", revoke, {"reason": "Registration lapsed, see file."}
        ).status_code
        == 200
    )
    assert not services.is_verified(org.pk)
    membership = EmployerMembership.objects.get(user=employer)
    gone = send(
        signed_in(people["editor"]),
        "post",
        f"{R}/memberships/{membership.pk}/actions/revoke",
        {"reason": "Left the company, confirmed by HR."},
    )
    assert gone.status_code == 200
    membership.refresh_from_db()
    assert membership.revoked_at is not None
