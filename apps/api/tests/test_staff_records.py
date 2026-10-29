"""The staff records API (`/api/v1/staff/records/`, D-46): the registers and queues that used to be Django Admin
pages. Reading follows each register's permission; every action calls the service that owns the rule."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from employers import services
from employers.models import ClaimStatus, OrganisationClaim
from notifications.models import EmailKind, EmailOutbox, OutboxStatus
from opportunities.models import Opportunity
from reports import services as report_services
from reports.models import ListingReport
from tests.factories import World, published

from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db

R = f"{S}/records"
CLAIM = {
    "organisation_name": "Acme Mining Zimbabwe",
    "website_url": "https://acme.example.org",
    "role_title": "HR manager",
    "evidence_note": "Our official address is hr@acme.example.org and our registration is on file.",
}


def keys(client: APIClient) -> set[str]:
    return {r["key"] for r in client.get(R).json()["data"]}


def test_each_role_reads_only_the_registers_its_permissions_allow(people: dict[str, User]) -> None:
    assert keys(signed_in(people["author"])) == set()
    assert keys(signed_in(people["editor"])) == {
        "claims",
        "profiles",
        "verifications",
        "memberships",
        "reports",
    }
    assert keys(signed_in(people["admin"])) == {
        "claims",
        "profiles",
        "verifications",
        "memberships",
        "reports",
        "outbox",
        "delivery",
        "users",
        "roles",
        "audit",
    }
    contributor = signed_in(people["author"])
    for kind in ("claims", "reports", "outbox", "users", "audit"):
        assert contributor.get(f"{R}/{kind}").status_code == 404, kind
    editor = signed_in(people["editor"])
    assert editor.get(f"{R}/audit").status_code == 404 and editor.get(f"{R}/users").status_code == 404


def test_claims_are_listed_and_a_different_reviewer_can_decide_them(people: dict[str, User]) -> None:
    claimant = people["author"]
    claim = services.submit_claim(claimant, CLAIM)
    editor = signed_in(people["editor"])
    listing = editor.get(f"{R}/claims?status=pending").json()
    assert [r["cells"]["organisation"] for r in listing["data"]] == ["Acme Mining Zimbabwe"]
    assert listing["columns"][0]["label"] == "Organisation"
    detail = editor.get(f"{R}/claims/{claim.pk}").json()
    assert [a["name"] for a in detail["actions"]] == ["decide"]
    fields = {f["name"]: f for f in detail["actions"][0]["fields"]}
    assert fields["organisation"]["kind"] == "reference" and fields["decision"]["kind"] == "choice"
    bad = send(editor, "post", f"{R}/claims/{claim.pk}/actions/decide", {"decision": "reject"})
    assert bad.status_code == 400  # a rejection needs a reason
    done = send(
        editor,
        "post",
        f"{R}/claims/{claim.pk}/actions/decide",
        {
            "decision": "approve",
            "role": "owner",
            "method": "document_review",
            "evidence_note": "Saw the registration.",
        },
    )
    assert done.status_code == 200, done.content
    assert OrganisationClaim.objects.get(pk=claim.pk).status == ClaimStatus.APPROVED
    again = send(editor, "post", f"{R}/claims/{claim.pk}/actions/decide", {"decision": "approve"})
    assert again.status_code == 403 and again.json()["error"]["code"] == "action_unavailable"


def test_a_reviewer_cannot_decide_their_own_claim(people: dict[str, User]) -> None:
    claim = services.submit_claim(people["editor"], CLAIM)
    editor = signed_in(people["editor"])
    refused = send(
        editor,
        "post",
        f"{R}/claims/{claim.pk}/actions/decide",
        {
            "decision": "approve",
            "role": "owner",
            "method": "other",
            "evidence_note": "Self approval attempt.",
        },
    )
    assert refused.status_code == 403
    assert OrganisationClaim.objects.get(pk=claim.pk).status == ClaimStatus.PENDING
    assert AuditEvent.objects.filter(action="employer.claim.decide.denied").exists()


@pytest.fixture
def report(world: World, people: dict[str, User]) -> ListingReport:
    listing: Opportunity = published(world, people["author_editor"], people["editor"])
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


def test_report_case_page_shows_facts_history_and_only_permitted_actions(
    report: ListingReport, people: dict[str, User]
) -> None:
    editor = signed_in(people["editor"])
    row = editor.get(f"{R}/reports?queue=new").json()["data"][0]
    assert row["cells"]["reference"] == report.reference
    detail = editor.get(f"{R}/reports/{report.pk}").json()
    facts = {f["label"]: f["value"] for f in detail["facts"]}
    assert "<script>" in facts["Details (reporter's words)"]  # plain text, never markup
    assert facts["Reporter contact"].startswith("reporter@example.org")
    assert detail["row_version"] == report.row_version
    names = {a["name"] for a in detail["actions"]}
    assert {"investigate", "note", "escalate", "resolve", "dismiss", "listing"} <= names
    assert detail["sections"][-1]["title"] == "History"
    author = signed_in(people["author_editor"]).get(f"{R}/reports/{report.pk}").json()
    assert author["notice"] and "separation of duties" in author["notice"]
    assert not {"resolve", "dismiss", "listing"} & {a["name"] for a in author["actions"]}


def test_report_actions_check_the_row_version_and_the_service_rules(
    report: ListingReport, people: dict[str, User]
) -> None:
    editor = signed_in(people["editor"])
    url = f"{R}/reports/{report.pk}/actions"
    stale = send(editor, "post", f"{url}/investigate", {"row_version": report.row_version + 5})
    assert stale.status_code == 409
    took = send(editor, "post", f"{url}/investigate", {"row_version": report.row_version})
    assert took.status_code == 200 and took.json()["status"]["label"] == "Investigating"
    row_version = took.json()["row_version"]
    short = send(editor, "post", f"{url}/note", {"row_version": row_version, "note": "short"})
    assert short.status_code == 400
    ok = send(
        editor,
        "post",
        f"{url}/note",
        {"row_version": row_version, "note": "Checked the source page and called."},
    )
    assert ok.status_code == 200
    dismiss = send(
        editor,
        "post",
        f"{url}/dismiss",
        {
            "row_version": ok.json()["row_version"],
            "resolution": "not_substantiated",
            "note": "Nothing found at the source.",
        },
    )
    assert dismiss.status_code == 200 and dismiss.json()["status"]["label"] == "Dismissed"
    mine = signed_in(people["author_editor"])
    blocked = send(
        mine, "post", f"{url}/resolve", {"row_version": 1, "resolution": "no_action_needed", "note": "x" * 12}
    )
    assert blocked.status_code == 403  # the listing's author may not decide a report about it


def test_users_roles_and_audit_are_administrator_only_and_keep_addresses_out_of_lists(
    people: dict[str, User],
) -> None:
    admin = signed_in(people["admin"])
    users = admin.get(f"{R}/users").json()
    assert users["data"] and all("@" not in str(v) for r in users["data"] for v in r["cells"].values())
    detail = admin.get(f"{R}/users/{people['editor'].pk}").json()
    assert {f["label"]: f["value"] for f in detail["facts"]}["Roles"] == "editor"
    assert admin.get(f"{R}/roles?role=editor").json()["data"]
    events = admin.get(f"{R}/audit?severity=info").json()
    assert events["columns"][0]["key"] == "occurred_at"
    first = AuditEvent.objects.order_by("-id").first()
    assert first is not None
    found = admin.get(f"{R}/audit?q={first.request_id}").json()
    assert found["page"]["total"] >= 0
    assert admin.get(f"{R}/audit/{first.pk}").status_code == 200
    assert admin.get(f"{R}/users/not-a-uuid").status_code == 404


def test_outbox_masks_addresses_and_failed_messages_can_be_retried(people: dict[str, User]) -> None:
    row = EmailOutbox.objects.create(
        kind=EmailKind.PASSWORD_RESET,
        to_address="someone@example.org",
        template_key="t",
        idempotency_key="k-1",
        status=OutboxStatus.FAILED,
        last_error="boom",
    )
    admin = signed_in(people["admin"])
    listing = admin.get(f"{R}/outbox").json()
    assert listing["data"][0]["cells"]["address"] == "s***@e***"
    assert signed_in(people["editor"]).get(f"{R}/outbox").status_code == 404
    retried = send(admin, "post", f"{R}/outbox/{row.pk}/actions/retry", {})
    assert retried.status_code == 200, retried.content
    row.refresh_from_db()
    assert row.status != OutboxStatus.FAILED
    assert AuditEvent.objects.filter(action="outbox.retry", object_id=row.pk).exists()
    assert send(admin, "post", f"{R}/outbox/{row.pk}/actions/retry", {}).status_code == 403
    assert signed_in(people["author"]).get(f"{R}/outbox/{row.pk}").status_code == 404


def test_records_need_the_second_step_and_csrf(people: dict[str, User]) -> None:
    assert APIClient().get(f"{R}/claims").status_code in (401, 403)
    editor = signed_in(people["editor"])
    claim = services.submit_claim(people["author"], CLAIM)
    assert (
        editor.post(
            f"{R}/claims/{claim.pk}/actions/decide", {"decision": "reject"}, format="json"
        ).status_code
        == 403
    )
