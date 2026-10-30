"""The staff API (`/api/v1/staff/`, D-46): same visibility, permissions and separation of duties as the Django
Admin because it uses the same helpers and the same workflow service; no state change without the second step."""

from __future__ import annotations

from typing import Any

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from accounts import mfa
from accounts.models import User
from opportunities.models import Opportunity
from tests.factories import World, new_draft, published, submitted, varied

from .conftest import PASSWORD, csrf, post_json

pytestmark = pytest.mark.django_db

S = "/api/v1/staff"


def signed_in(user: User) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    assert (
        post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}).status_code
        == 200
    )
    return client


def send(client: APIClient, method: str, url: str, data: Any = None) -> Any:
    kwargs: dict[str, Any] = {"HTTP_X_CSRFTOKEN": csrf(client)}
    if data is not None:
        kwargs["format"] = "json"
        return getattr(client, method)(url, data, **kwargs)
    return getattr(client, method)(url, **kwargs)


def titles(response: Any) -> list[str]:
    return [row["title"] for row in response.json()["data"]]


def test_anonymous_seekers_and_unverified_staff_are_refused(
    client: Any, world: World, people: dict[str, User]
) -> None:
    assert APIClient().get(f"{S}/dashboard").status_code in (401, 403)
    seeker = signed_in(people["seeker"])
    assert seeker.get(f"{S}/dashboard").status_code == 403
    assert seeker.get(f"{S}/session").status_code == 403
    with override_settings(UPNEXT_STAFF_MFA_REQUIRED=True):
        editor = signed_in(people["editor"])
        denied = editor.get(f"{S}/opportunities")
        assert denied.status_code == 403 and denied.json()["error"]["code"] == "two_step_required"
        session = editor.get(f"{S}/session").json()
        assert session["two_step"] == {"required": True, "verified": False, "enrolled": False}
        assert "attention" not in session and "permissions" not in session  # nothing before the second step


def test_two_step_enrolment_and_verification_unlock_the_api(people: dict[str, User]) -> None:
    with override_settings(UPNEXT_STAFF_MFA_REQUIRED=True):
        editor = signed_in(people["editor"])
        setup = editor.get(f"{S}/two-step").json()
        assert setup["enrolling"] is True and setup["secret"]
        assert send(editor, "post", f"{S}/two-step", {"code": "000000"}).status_code == 400
        code = mfa.code_at(mfa.secret_for(mfa.device_of(people["editor"])), mfa.current_step())  # type: ignore[arg-type]
        done = send(editor, "post", f"{S}/two-step", {"code": code})
        assert done.status_code == 200 and len(done.json()["recovery_codes"]) == 8
        assert editor.get(f"{S}/opportunities").status_code == 200


def test_unsafe_requests_need_csrf(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"], "tenders-1")
    editor = signed_in(people["editor"])
    assert editor.post(f"{S}/opportunities/{opp.pk}/actions/reject", {}, format="json").status_code == 403


def test_list_is_scoped_filtered_searched_and_paged(world: World, people: dict[str, User]) -> None:
    published(world, people["author"], people["editor"], example="jobs-1")
    submitted(world, people["author"], "tenders-1")
    new_draft(world, people["author"], "grants-1", **varied(world, "grants-1", "mydraft"))
    editor = signed_in(people["editor"])
    everything = editor.get(f"{S}/opportunities").json()
    assert everything["counts"]["all"] == 2  # the draft stays private to its author
    assert titles(editor.get(f"{S}/opportunities?queue=review")) == ["Supply of Solar Water Heating Units"]
    assert titles(editor.get(f"{S}/opportunities?status=published"))
    assert titles(editor.get(f"{S}/opportunities?q=solar")) == ["Supply of Solar Water Heating Units"]
    assert editor.get(f"{S}/opportunities?q=mydraft").json()["data"] == []
    mine = signed_in(people["author"]).get(f"{S}/opportunities?queue=mine").json()
    assert [r["title"].endswith("mydraft") for r in mine["data"]] == [True]
    paged = editor.get(f"{S}/opportunities?page_size=1").json()
    assert paged["page"]["total"] == 2 and paged["page"]["pages"] == 2 and len(paged["data"]) == 1


def test_detail_hides_other_peoples_drafts_and_offers_only_permitted_actions(
    world: World, people: dict[str, User]
) -> None:
    opp = submitted(world, people["author"], "tenders-1")
    detail = signed_in(people["editor"]).get(f"{S}/opportunities/{opp.pk}").json()
    names = {a["name"] for a in detail["actions"]}
    assert {"approve", "reject"} <= names
    approve = next(a for a in detail["actions"] if a["name"] == "approve")
    assert {f["name"] for f in approve["fields"]} >= {"source_reviewed", "duplicates_reviewed"}
    assert detail["pending"]["content"]["title"] and detail["history"]
    own = signed_in(people["author"]).get(f"{S}/opportunities/{opp.pk}").json()
    assert not {"approve", "reject"} & {a["name"] for a in own["actions"]}
    draft = new_draft(world, people["author_editor"], "grants-1", **varied(world, "grants-1", "secret"))
    assert signed_in(people["editor"]).get(f"{S}/opportunities/{draft.pk}").status_code == 404
    shown = signed_in(people["admin"]).get(f"{S}/opportunities/{draft.pk}").json()
    assert shown["pending"]["hidden"] is False


def test_actions_run_through_the_service_and_enforce_separation_of_duties(
    world: World, people: dict[str, User]
) -> None:
    opp = submitted(world, people["author_editor"], "tenders-1")  # authored and submitted by an editor
    me = signed_in(people["author_editor"])
    detail = me.get(f"{S}/opportunities/{opp.pk}").json()
    refused = send(
        me,
        "post",
        f"{S}/opportunities/{opp.pk}/actions/approve",
        {
            "row_version": detail["row_version"],
            "source_reviewed": True,
            "duplicates_reviewed": True,
            "content_matches_source": True,
        },
    )
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "action_unavailable"
    other = signed_in(people["editor"])
    stale = send(other, "post", f"{S}/opportunities/{opp.pk}/actions/approve", {"row_version": 999})
    assert stale.status_code == 400  # the checklist is required
    body = {
        "row_version": detail["row_version"],
        "source_reviewed": True,
        "duplicates_reviewed": True,
        "content_matches_source": True,
    }
    assert (
        send(
            other, "post", f"{S}/opportunities/{opp.pk}/actions/approve", {**body, "row_version": 999}
        ).status_code
        == 409
    )
    ok = send(other, "post", f"{S}/opportunities/{opp.pk}/actions/approve", body)
    assert ok.status_code == 200 and ok.json()["status"] == "approved"
    # a different editor may publish the exact revision that was approved
    assert (
        send(
            signed_in(people["editor2"]),
            "post",
            f"{S}/opportunities/{opp.pk}/actions/publish",
            {"row_version": ok.json()["row_version"]},
        ).status_code
        == 200
    )
    assert Opportunity.objects.get(pk=opp.pk).status == "published"
    assert send(other, "post", f"{S}/opportunities/{opp.pk}/actions/nonsense", {}).status_code == 404


def test_create_and_save_draft_use_the_publishing_service(world: World, people: dict[str, User]) -> None:
    author = signed_in(people["author"])
    cats = author.get(f"{S}/categories").json()["data"]
    jobs = next(c for c in cats if c["code"] == "jobs")
    assert any(f["name"] == "vacancies" for f in jobs["detail_fields"])
    org = author.get(f"{S}/organisations").json()["data"][0]
    created = send(
        author,
        "post",
        f"{S}/opportunities",
        {"category": "jobs", "organisation_id": org["id"], "title": "Test Officer"},
    )
    assert created.status_code == 201, created.content
    body = created.json()
    assert body["can_edit"] is True and body["pending"]["content"]["title"] == "Test Officer"
    saved = send(
        author,
        "patch",
        f"{S}/opportunities/{body['id']}/draft",
        {"row_version": body["row_version"], "content": {"summary": "A short summary of the role."}},
    )
    assert saved.status_code == 200 and saved.json()["pending"]["content"]["summary"].startswith("A short")
    stale = send(
        author,
        "patch",
        f"{S}/opportunities/{body['id']}/draft",
        {"row_version": 0, "content": {"summary": "x" * 12}},
    )
    assert stale.status_code == 409
    editor = signed_in(people["editor"])
    assert (
        send(
            editor,
            "post",
            f"{S}/opportunities",
            {"category": "jobs", "organisation_id": org["id"], "title": "Nope"},
        ).status_code
        == 403
    )


def test_dashboard_search_and_activity(world: World, people: dict[str, User]) -> None:
    submitted(world, people["author"], "tenders-1")
    editor = signed_in(people["editor"])
    dash = editor.get(f"{S}/dashboard").json()
    assert {k["key"] for k in dash["kpis"]} == {"total", "published", "closing", "drafts", "expired"}
    assert next(a for a in dash["attention"] if a["key"] == "review")["count"] == 1
    assert dash["activity"][0]["href"].startswith("/workspace/opportunities/")
    assert editor.get(f"{S}/search?q=s").json()["groups"] == []
    groups = editor.get(f"{S}/search?q=solar").json()["groups"]
    assert groups[0]["items"][0]["href"].startswith("/workspace/opportunities/")
    assert editor.get(f"{S}/activity").json()["data"][0]["what"] == "Submitted for review"
    session = editor.get(f"{S}/session").json()
    assert session["user"]["role"] == "editor" and "opp.review.approve" in session["permissions"]


def test_an_administrator_reading_someone_elses_draft_is_audited(
    world: World, people: dict[str, User]
) -> None:
    from audit.models import AuditEvent

    draft = new_draft(world, people["author"], "grants-1", **varied(world, "grants-1", "audited"))
    signed_in(people["author"]).get(f"{S}/opportunities/{draft.pk}")  # the author's own view is not an event
    assert not AuditEvent.objects.filter(action="opportunity.view_draft").exists()
    assert signed_in(people["admin"]).get(f"{S}/opportunities/{draft.pk}").status_code == 200
    event = AuditEvent.objects.get(action="opportunity.view_draft")
    assert event.actor_ref == people["admin"].pk and event.object_id == draft.pk


def test_content_health_is_for_editors_and_administrators(people: dict[str, User]) -> None:
    assert signed_in(people["author"]).get(f"{S}/content-health").status_code == 403
    body = signed_in(people["editor"]).get(f"{S}/content-health").json()
    assert body["target"]["listings"]["goal"] >= 1 and body["sod_violations"] == []
    assert isinstance(body["live_per_category"], list)


def test_search_never_reveals_another_persons_draft(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author"], "grants-1", **varied(world, "grants-1", "zebra-secret"))

    def hits(who: str) -> list[Any]:
        return list(signed_in(people[who]).get(f"{S}/search?q=zebra-secret").json()["groups"])

    assert hits("editor") == [] and hits("author_editor") == []
    assert hits("author") != [] and hits("admin") != []


def test_the_activity_log_is_scoped_to_visible_listings(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author_editor"], "grants-1", **varied(world, "grants-1", "hidden-draft"))
    editor = signed_in(people["editor"]).get(f"{S}/activity").json()["data"]
    assert "hidden-draft" not in " ".join(r["listing"] for r in editor)
    admin = signed_in(people["admin"]).get(f"{S}/activity").json()["data"]
    assert "hidden-draft" in " ".join(r["listing"] for r in admin)
    assert signed_in(people["author_editor"]).get(f"{S}/activity").status_code == 200
