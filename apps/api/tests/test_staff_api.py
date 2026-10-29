"""The staff console API (`/api/v1/staff/`, D-46): access control, two-step proof, the editor round trip, direct
publication to the public site, employer moderation, organisations, accounts and the audit log."""

from __future__ import annotations

from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from accounts import mfa
from accounts.models import StaffMfaDevice, StaffRoleAssignment, User
from audit.models import AuditEvent
from catalog.models import Organisation
from employers.models import EmployerListing, OrganisationVerification
from opportunities import workflow
from opportunities.models import ListingStatus, Opportunity
from tests.conftest import csrf
from tests.factories import CHECKLIST, World, new_draft, published

pytestmark = pytest.mark.django_db
BASE = "/api/v1/staff"


def session(user: User | None = None) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    if user is not None:
        client.force_login(user)
    return client


def post(client: APIClient, url: str, data: dict[str, Any] | None = None) -> Any:
    return client.post(url, data or {}, format="json", HTTP_X_CSRFTOKEN=csrf(client))


def patch(client: APIClient, url: str, data: dict[str, Any]) -> Any:
    return client.patch(url, data, format="json", HTTP_X_CSRFTOKEN=csrf(client))


GET_ENDPOINTS = [
    "/session", "/reference", "/overview", "/settings", "/opportunities", "/organisations", "/claims",
    "/reports", "/users", "/audit", "/categories/jobs/schema",
]  # fmt: skip


# --- access ---------------------------------------------------------------------------------------
@pytest.mark.parametrize("path", GET_ENDPOINTS)
def test_anonymous_visitors_get_401_everywhere(path: str) -> None:
    assert session().get(BASE + path).status_code == 401


@pytest.mark.parametrize("path", GET_ENDPOINTS)
def test_signed_in_seekers_are_refused_everywhere(people: dict[str, User], path: str) -> None:
    assert session(people["seeker"]).get(BASE + path).status_code in (401, 403)


def test_unsafe_requests_need_the_csrf_token(people: dict[str, User]) -> None:
    client = session(people["editor"])
    response = client.post(f"{BASE}/organisations", {"name": "Acme"}, format="json")
    assert response.status_code == 403 and response.json()["error"]["code"] == "csrf_failed"


def test_each_role_sees_only_the_screens_its_permissions_allow(people: dict[str, User]) -> None:
    contributor, editor, admin = (session(people[k]) for k in ("author", "editor", "admin"))
    for path in ("/users", "/audit", "/settings", "/claims", "/reports"):
        assert contributor.get(BASE + path).status_code == 403, path
    for path in ("/users", "/audit", "/settings"):
        assert editor.get(BASE + path).status_code == 403, path
        assert admin.get(BASE + path).status_code == 200, path
    for path in ("/claims", "/reports"):
        assert editor.get(BASE + path).status_code == 200, path
    perms = editor.get(BASE + "/session").json()["permissions"]
    assert "opp.publish_direct" in perms and "audit.read_all" not in perms


# --- two-step verification --------------------------------------------------------------------------
@override_settings(UPNEXT_STAFF_MFA_REQUIRED=True)
def test_nothing_but_the_proof_is_served_before_two_step_verification(people: dict[str, User]) -> None:
    editor = people["editor"]
    client = session(editor)
    state = client.get(BASE + "/session").json()["mfa"]
    assert state == {"required": True, "verified": False, "enrolled": False}
    for path in ("/overview", "/opportunities", "/reference"):
        response = client.get(BASE + path)
        assert response.status_code == 403 and response.json()["error"]["code"] == "mfa_required"
    setup = client.get(BASE + "/mfa/enrolment").json()
    assert setup["uri"].startswith("otpauth://totp/")
    device = StaffMfaDevice.objects.get(user=editor)
    code = mfa.code_at(mfa.secret_for(device), mfa.current_step())
    wrong = post(client, BASE + "/mfa/enrolment", {"code": "000000"})
    assert wrong.status_code == 400
    done = post(client, BASE + "/mfa/enrolment", {"code": code})
    assert done.status_code == 200 and len(done.json()["recovery_codes"]) == mfa.RECOVERY_CODES
    assert client.get(BASE + "/overview").status_code == 200
    assert client.get(BASE + "/mfa/enrolment").status_code == 409


@override_settings(UPNEXT_STAFF_MFA_REQUIRED=True)
def test_a_later_sign_in_needs_a_valid_code_and_repeated_failures_lock_out(people: dict[str, User]) -> None:
    editor = people["editor"]
    first = session(editor)
    first.get(BASE + "/mfa/enrolment")
    device = StaffMfaDevice.objects.get(user=editor)
    post(first, BASE + "/mfa/enrolment", {"code": mfa.code_at(mfa.secret_for(device), mfa.current_step())})
    second = session(editor)
    assert second.get(BASE + "/overview").status_code == 403
    for _ in range(mfa.MAX_FAILURES):
        assert post(second, BASE + "/mfa/verify", {"code": "000000"}).status_code == 400
    blocked = post(second, BASE + "/mfa/verify", {"code": "000000"})
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "mfa_blocked"
    assert second.get(BASE + "/overview").status_code == 403


# --- the editor round trip and direct publication ------------------------------------------------------
def content_for(world: World, **overrides: Any) -> dict[str, Any]:
    _, content = world.content("jobs-1", **overrides)
    return content


def test_an_editor_creates_edits_and_publishes_a_job_that_the_public_site_then_lists(
    world: World, people: dict[str, User]
) -> None:
    editor = session(people["editor"])
    created = post(editor, f"{BASE}/opportunities/new", {"category": "jobs", "content": content_for(world)})
    assert created.status_code == 201, created.content
    detail = created.json()
    assert (
        detail["status"] == "draft" and "publish_direct" in detail["actions"] and "edit" in detail["actions"]
    )
    saved = patch(
        editor,
        f"{BASE}/opportunities/{detail['id']}",
        {"row_version": detail["row_version"], "content": {"title": "Senior Accountant"}},
    )
    assert saved.status_code == 200 and saved.json()["content"]["title"] == "Senior Accountant"
    stale = patch(
        editor, f"{BASE}/opportunities/{detail['id']}", {"row_version": 0, "content": {"title": "x"}}
    )
    assert stale.status_code == 409
    incomplete = post(
        editor,
        f"{BASE}/opportunities/{detail['id']}/publish_direct",
        {"row_version": saved.json()["row_version"], "checklist": {"source_reviewed": True}},
    )
    assert incomplete.status_code == 400
    live = post(
        editor,
        f"{BASE}/opportunities/{detail['id']}/publish_direct",
        {"row_version": saved.json()["row_version"], "checklist": CHECKLIST},
    )
    assert live.status_code == 200, live.content
    body = live.json()
    assert body["status"] == "published" and body["version"]["direct_publication"] is True
    assert body["version"]["author"]["id"] == body["version"]["approved_by"]["id"]
    assert body["public_path"].startswith("/opportunities/")
    public = APIClient().get("/api/v1/opportunities", {"q": "Senior Accountant"})
    assert public.status_code == 200
    assert any(item["title"] == "Senior Accountant" for item in public.json()["data"])
    assert AuditEvent.objects.filter(action="opportunity.publish_direct", object_id=detail["id"]).exists()


def test_a_contributor_can_write_drafts_but_cannot_publish_directly(
    world: World, people: dict[str, User]
) -> None:
    client = session(people["author"])
    created = post(client, f"{BASE}/opportunities/new", {"category": "jobs", "content": content_for(world)})
    assert created.status_code == 201
    assert "publish_direct" not in created.json()["actions"]
    denied = post(
        client,
        f"{BASE}/opportunities/{created.json()['id']}/publish_direct",
        {"row_version": created.json()["row_version"], "checklist": CHECKLIST},
    )
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "permission_denied"
    assert Opportunity.objects.get(pk=created.json()["id"]).status == ListingStatus.DRAFT


def test_employer_submissions_still_need_another_persons_approval(
    world: World, people: dict[str, User]
) -> None:
    editor = people["editor"]
    opp = new_draft(world, editor)
    version = opp.pending_version
    assert version is not None
    EmployerListing.objects.create(opportunity=opp, organisation=version.organisation, created_by=editor)
    client = session(editor)
    denied = post(
        client,
        f"{BASE}/opportunities/{opp.pk}/publish_direct",
        {"row_version": opp.row_version, "checklist": CHECKLIST},
    )
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "separation_of_duties"
    # the ordinary path works with a second person
    workflow.submit(editor, opp.pk, expected_row_version=Opportunity.objects.get(pk=opp.pk).row_version)
    other = session(people["editor2"])
    queue = other.get(f"{BASE}/opportunities", {"view": "employer"}).json()
    assert [row["id"] for row in queue["data"]] == [str(opp.pk)] and queue["data"][0][
        "employer_owned"
    ] is True
    row_version = queue["data"][0]["row_version"]
    assert "approve" in queue["data"][0]["actions"]
    own_view = session(editor).get(f"{BASE}/opportunities", {"view": "employer"}).json()
    assert "approve" not in own_view["data"][0]["actions"]  # nobody approves their own submission
    approved = post(
        other, f"{BASE}/opportunities/{opp.pk}/approve", {"row_version": row_version, "checklist": CHECKLIST}
    )
    assert approved.status_code == 200 and approved.json()["status"] == "approved"
    self_publish = post(
        session(editor),
        f"{BASE}/opportunities/{opp.pk}/publish",
        {"row_version": approved.json()["row_version"]},
    )
    assert self_publish.status_code == 200  # approved by someone else, so the author may publish (D-22)


def test_lifecycle_actions_need_the_right_permission(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    contributor = post(
        session(people["author"]), f"{BASE}/opportunities/{opp.pk}/withdraw",
        {"row_version": opp.row_version, "reason": "Closed by the employer."},
    )  # fmt: skip
    assert contributor.status_code == 403
    done = post(
        session(people["editor"]), f"{BASE}/opportunities/{opp.pk}/withdraw",
        {"row_version": opp.row_version, "reason": "Closed by the employer."},
    )  # fmt: skip
    assert done.status_code == 200 and done.json()["status"] == "withdrawn"


# --- the opportunities table ---------------------------------------------------------------------------
def test_the_table_lists_real_rows_with_search_filters_sorting_and_pages(
    world: World, people: dict[str, User]
) -> None:
    editor = people["editor"]
    titles = ["Alpha Engineer", "Bravo Analyst", "Charlie Teacher"]
    for title in titles:
        new_draft(world, editor, title=title)
    published(world, people["author"], people["editor2"], title="Delta Nurse")
    client = session(people["admin"])
    everything = client.get(f"{BASE}/opportunities", {"sort": "title", "dir": "asc"}).json()
    assert [r["title"] for r in everything["data"]] == sorted([*titles, "Delta Nurse"])
    assert everything["page"]["total"] == 4
    row = everything["data"][0]
    assert set(row) >= {
        "title",
        "organisation",
        "category",
        "location",
        "status",
        "closing",
        "author",
        "actions",
    }
    assert row["organisation"]["verified"] is False and row["author"]["name"]
    assert [r["title"] for r in client.get(f"{BASE}/opportunities", {"q": "bravo"}).json()["data"]] == [
        "Bravo Analyst"
    ]
    drafts = client.get(f"{BASE}/opportunities", {"view": "drafts"}).json()
    assert drafts["page"]["total"] == 3
    assert client.get(f"{BASE}/opportunities", {"view": "published"}).json()["page"]["total"] == 1
    paged = client.get(
        f"{BASE}/opportunities", {"page_size": "2", "page": "2", "sort": "title", "dir": "asc"}
    ).json()
    assert paged["page"] == {"number": 2, "size": 2, "total": 4, "pages": 2}
    assert client.get(f"{BASE}/opportunities", {"sort": "nope"}).status_code == 400
    assert client.get(f"{BASE}/opportunities", {"view": "nope"}).status_code == 400
    assert client.get(f"{BASE}/opportunities", {"category": "tenders"}).json()["page"]["total"] == 0


def test_editors_do_not_see_other_peoples_unsubmitted_drafts(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author"], title="Private draft")
    assert session(people["editor"]).get(f"{BASE}/opportunities").json()["page"]["total"] == 0
    assert session(people["author"]).get(f"{BASE}/opportunities").json()["page"]["total"] == 1
    opp = Opportunity.objects.get()
    assert session(people["editor"]).get(f"{BASE}/opportunities/{opp.pk}").status_code == 404
    admin_view = session(people["admin"]).get(f"{BASE}/opportunities/{opp.pk}")
    assert admin_view.status_code == 200
    assert AuditEvent.objects.filter(action="opportunity.view_draft", object_id=opp.pk).exists()


def test_overview_counts_come_from_live_rows(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["editor"])
    published(world, people["author"], people["editor2"])
    counts = session(people["editor"]).get(BASE + "/overview").json()["counts"]
    assert counts["my_drafts"] == 1 and counts["published"] == 1
    assert counts["open_reports"] == 0 and counts["pending_claims"] == 0
    assert session(people["author"]).get(BASE + "/overview").json()["counts"]["open_reports"] is None


def test_category_schema_and_reference_data(people: dict[str, User], world: World) -> None:
    client = session(people["editor"])
    schema = client.get(BASE + "/categories/jobs/schema").json()
    assert "minimum_qualification" in schema["properties"]
    assert schema["applicable"]["salary"] is True and schema["applicable"]["funding"] is False
    assert schema["applicable"]["employment_types"] == ["contract", "part_time", "permanent", "temporary"]
    tenders = client.get(BASE + "/categories/tenders/schema").json()["applicable"]
    assert tenders["deadline_required"] is True and tenders["employment_types"] is None
    assert client.get(BASE + "/categories/nope/schema").status_code == 404
    reference = client.get(BASE + "/reference").json()
    assert {c["code"] for c in reference["categories"]} >= {"jobs", "tenders"}
    assert reference["currencies"] == ["USD", "ZWG"]


# --- organisations -------------------------------------------------------------------------------------
def test_manually_entered_organisations_are_never_marked_verified(people: dict[str, User]) -> None:
    client = session(people["author"])
    created = post(
        client,
        BASE + "/organisations",
        {"name": "  Acme   Trading ", "website_url": "https://acme.example.co.zw"},
    )
    assert created.status_code == 201
    row = created.json()
    assert row["name"] == "Acme Trading" and row["verified"] is False and row["origin"] == "entered_by_staff"
    duplicate = post(client, BASE + "/organisations", {"name": "acme trading"})
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "duplicate_organisation"
    assert post(client, BASE + "/organisations", {"name": "x"}).status_code == 400
    assert (
        post(
            client, BASE + "/organisations", {"name": "Bad Url Ltd", "website_url": "http://localhost"}
        ).status_code
        == 400
    )
    # claiming verified status through the API is impossible: unknown fields are ignored
    sneaky = post(client, BASE + "/organisations", {"name": "Sneaky Ltd", "verified": True})
    assert sneaky.status_code == 201 and sneaky.json()["verified"] is False
    assert not OrganisationVerification.objects.exists()


def test_only_editors_edit_organisations_and_a_verified_one_is_labelled(
    world: World, people: dict[str, User]
) -> None:
    org = Organisation.objects.get(pk=next(iter(world.organisations.values())))
    OrganisationVerification.objects.create(
        organisation=org,
        method="document_review",
        evidence_note="Registry extract seen.",
        verified_by=people["admin"],
    )
    listing = session(people["author"]).get(BASE + "/organisations", {"origin": "verified_employer"}).json()
    assert [r["id"] for r in listing["data"]] == [str(org.pk)] and listing["data"][0]["verified"] is True
    assert (
        patch(
            session(people["author"]),
            f"{BASE}/organisations/{org.pk}",
            {"row_version": org.row_version, "name": "New Name"},
        ).status_code
        == 403
    )
    renamed = patch(
        session(people["editor"]),
        f"{BASE}/organisations/{org.pk}",
        {"row_version": org.row_version, "name": "Renamed Ltd"},
    )
    assert renamed.status_code == 200 and renamed.json()["name"] == "Renamed Ltd"
    stale = patch(
        session(people["editor"]),
        f"{BASE}/organisations/{org.pk}",
        {"row_version": org.row_version, "name": "Again"},
    )
    assert stale.status_code == 409
    assert AuditEvent.objects.filter(action="organisation.update", object_id=org.pk).exists()


# --- staff accounts and the audit log -------------------------------------------------------------------
def test_administrators_manage_contributor_and_editor_roles_with_a_reason(people: dict[str, User]) -> None:
    admin = session(people["admin"])
    target = people["seeker"]
    url = f"{BASE}/users/{target.pk}"
    assert post(admin, f"{url}/grant", {"role": "editor", "reason": "short"}).status_code == 400
    assert (
        post(
            admin, f"{url}/grant", {"role": "administrator", "reason": "Needs full access to approve."}
        ).status_code
        == 400
    )
    granted = post(admin, f"{url}/grant", {"role": "editor", "reason": "Joins the editorial desk."})
    assert granted.status_code == 200 and granted.json()["roles"] == ["editor"]
    assert (
        post(admin, f"{url}/grant", {"role": "editor", "reason": "Joins the editorial desk."}).status_code
        == 409
    )
    assert any(u["id"] == str(target.pk) for u in admin.get(BASE + "/users").json()["data"])
    revoked = post(admin, f"{url}/revoke", {"role": "editor", "reason": "Left the editorial desk."})
    assert revoked.status_code == 200 and revoked.json()["roles"] == []
    assert StaffRoleAssignment.objects.filter(user=target, revoked_at__isnull=False).count() == 1
    own = post(
        admin,
        f"{BASE}/users/{people['admin'].pk}/revoke",
        {"role": "administrator", "reason": "Trying on myself."},
    )
    assert own.status_code == 403
    assert (
        post(
            session(people["editor"]), f"{url}/grant", {"role": "editor", "reason": "Not an administrator."}
        ).status_code
        == 403
    )
    actions = set(AuditEvent.objects.filter(object_id=target.pk).values_list("action", flat=True))
    assert {"role.grant", "role.revoke"} <= actions


def test_the_audit_log_is_administrator_only_and_filterable(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["editor"])
    admin = session(people["admin"])
    rows = admin.get(BASE + "/audit", {"object": str(opp.pk)}).json()["data"]
    assert rows and all(r["object_id"] == str(opp.pk) for r in rows)
    assert rows[0]["actor"] == people["editor"].display_name
    assert admin.get(BASE + "/audit", {"action": "opportunity.create"}).json()["page"]["total"] >= 1
    assert session(people["editor"]).get(BASE + "/audit").status_code == 403


def test_settings_show_only_non_secret_posture(people: dict[str, User]) -> None:
    body = session(people["admin"]).get(BASE + "/settings").json()
    assert body["security"]["staff_idle_minutes"] > 0
    assert "secret" not in str(body).lower() and "password" not in str(body).lower()


def test_reports_queue_is_visible_to_editors(people: dict[str, User]) -> None:
    body = session(people["editor"]).get(BASE + "/reports").json()
    assert body["data"] == [] and body["page"]["total"] == 0


def test_preview_uses_the_public_markdown_renderer_and_refuses_raw_html(people: dict[str, User]) -> None:
    client = session(people["editor"])
    ok = post(
        client,
        BASE + "/preview",
        {"description_md": "### Duties\n\n- **Lead** the team", "requirements_md": None},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert (
        "<h3>Duties</h3>" in body["description_html"] and "<strong>Lead</strong>" in body["description_html"]
    )
    assert body["requirements_html"] is None
    bad = post(client, BASE + "/preview", {"description_md": "<script>alert(1)</script>"})
    assert bad.status_code == 400
    assert post(session(people["seeker"]), BASE + "/preview", {"description_md": "x"}).status_code in (
        401,
        403,
    )
