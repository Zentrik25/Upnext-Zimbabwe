"""Editorial workflow through the staff API (D-46): who may see and edit what, that every action goes through the
publishing service, stale versions, audit with the acting role, and bounded queries. These are the scenarios the
Django Admin screens used to be tested with."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import StaffRoleAssignment, User
from audit.models import AuditEvent
from opportunities import workflow
from opportunities.models import ListingStatus, Opportunity, OpportunityVersion
from tests.factories import CHECKLIST, World, approved, new_draft, published, submitted, varied

from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db

O = f"{S}/opportunities"  # noqa: E741
APPROVE = {"source_reviewed": True, "duplicates_reviewed": True, "content_matches_source": True}


def act(client: APIClient, opp: Opportunity, name: str, **data: Any) -> Any:
    opp.refresh_from_db()
    return send(client, "post", f"{O}/{opp.pk}/actions/{name}", {"row_version": opp.row_version, **data})


def test_only_staff_reach_the_staff_api(people: dict[str, User]) -> None:
    assert APIClient().get(f"{S}/dashboard").status_code in (401, 403)
    assert signed_in(people["seeker"]).get(f"{S}/dashboard").status_code == 403
    assert signed_in(people["author"]).get(f"{S}/dashboard").status_code == 200


def test_state_cannot_be_written_through_the_list_or_detail(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    client = signed_in(people["author"])
    for method in ("put", "patch", "delete"):
        assert send(client, method, f"{O}/{opp.pk}", {"status": "published"}).status_code in (404, 405)
    assert send(client, "put", O, {"status": "published"}).status_code == 405
    opp.refresh_from_db()
    assert opp.status == ListingStatus.DRAFT


def test_each_role_sees_only_what_the_matrix_allows(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author"], "jobs-1", **varied(world, "jobs-1", "mine-visible"))
    new_draft(
        world, people["author_editor"], "internships-1", **varied(world, "internships-1", "theirs-draft")
    )
    submitted(
        world, people["author_editor"], "scholarships-1", **varied(world, "scholarships-1", "theirs-review")
    )
    published(world, people["author_editor"], people["editor"], example="grants-1")

    def titles(who: str) -> str:
        return " | ".join(r["title"] for r in signed_in(people[who]).get(O).json()["data"])

    contributor = titles("author")
    assert (
        "mine-visible" in contributor
        and "theirs-draft" not in contributor
        and "theirs-review" not in contributor
    )
    editor = titles("editor")
    assert "theirs-review" in editor and "Community Enterprise Growth Grant" in editor
    assert "mine-visible" not in editor and "theirs-draft" not in editor  # other people's drafts stay private
    admin = titles("admin")
    assert "mine-visible" in admin and "theirs-draft" in admin and "theirs-review" in admin


def test_status_words_filters_and_search_work(world: World, people: dict[str, User]) -> None:
    live = published(world, people["author"], people["editor"], example="jobs-1")
    submitted(world, people["author"], "tenders-1")
    approved(world, people["author"], people["editor"], "internships-1")
    admin = signed_in(people["admin"])
    labels = {r["status_label"] for r in admin.get(O).json()["data"]}
    assert {"Published", "In review", "Approved - ready to publish"} <= labels
    assert {r["verification_label"] for r in admin.get(O).json()["data"]} >= {"Not verified"}

    def titles(query: str) -> list[str]:
        return [r["title"] for r in admin.get(f"{O}?{query}").json()["data"]]

    assert "Solar Water Heating" in " ".join(titles("status=in_review"))
    assert "Graduate Electrical Engineer" not in " ".join(titles("status=in_review"))
    assert "ICT Industrial Attachment" in " ".join(titles("queue=ready"))
    assert "Solar Water Heating" in " ".join(titles("q=solar"))
    assert "Solar Water Heating" not in " ".join(titles("q=electrical"))
    assert "Graduate Electrical Engineer" in " ".join(titles(f"category={live.category.code}"))
    assert "Solar Water Heating" in " ".join(titles_for(people["editor"], "queue=review"))
    assert "Solar Water Heating" not in " ".join(titles_for(people["author"], "queue=ready"))


def titles_for(user: User, query: str) -> list[str]:
    return [r["title"] for r in signed_in(user).get(f"{O}?{query}").json()["data"]]


def test_contributor_starts_a_draft_and_the_category_is_fixed(world: World, people: dict[str, User]) -> None:
    org = str(next(iter(world.organisations.values())))
    made = send(
        signed_in(people["author"]),
        "post",
        O,
        {"category": "tenders", "organisation_id": org, "title": "New tender"},
    )
    assert made.status_code == 201, made.content
    opp = Opportunity.objects.latest("created_at")
    assert opp.category.code == "tenders" and opp.status == ListingStatus.DRAFT
    assert opp.created_by_id == people["author"].pk
    editor = send(
        signed_in(people["editor"]),
        "post",
        O,
        {"category": "tenders", "organisation_id": org, "title": "Nope"},
    )
    assert editor.status_code == 403
    again = send(
        signed_in(people["author"]), "post", O, {"category": "nonsense", "organisation_id": org, "title": "X"}
    )
    assert again.status_code == 400


def test_author_edits_a_draft_and_submits_it(world: World, people: dict[str, User]) -> None:
    opp = new_draft(
        world, people["author"], "jobs-1", title="Placeholder title for edit", locations=[], sources=[]
    )
    client = signed_in(people["author"])
    detail = client.get(f"{O}/{opp.pk}").json()
    assert detail["can_edit"] is True
    refused = send(
        client,
        "patch",
        f"{O}/{opp.pk}/draft",
        {
            "row_version": detail["row_version"],
            "content": {"application_url": "http://insecure.example.org/apply"},
        },
    )
    assert refused.status_code == 400 and "application_url" in refused.json()["error"]["fields"]
    opp.refresh_from_db()
    assert opp.pending_version is not None
    assert opp.pending_version.application_url != "http://insecure.example.org/apply"
    harare = next(loc for loc in client.get("/api/v1/locations").json()["data"] if loc["slug"] == "harare")
    ok = send(
        client,
        "patch",
        f"{O}/{opp.pk}/draft",
        {
            "row_version": detail["row_version"],
            "content": {
                "title": "Graduate Electrical Engineer",
                "locations": [{"location_id": harare["id"], "is_primary": True}],
                "sources": [
                    {
                        "kind": "issuer_website",
                        "name": "Example Power Services careers page",
                        "url": "https://careers.example.org/vacancies/gee",
                        "citation": None,
                        "observed_on": "2026-10-29",
                        "is_primary": True,
                    }
                ],
                "deadline_at": "2027-03-01T23:59:59+02:00",
                "deadline_timezone": "Africa/Harare",
                "deadline_is_date_only": True,
            },
        },
    )
    assert ok.status_code == 200, ok.content
    opp.refresh_from_db()
    version = opp.pending_version
    assert version is not None
    assert version.title == "Graduate Electrical Engineer" and version.sources.count() == 1
    assert version.locations.count() == 1 and version.deadline_timezone == "Africa/Harare"
    done = act(client, opp, "submit")
    assert done.status_code == 200 and done.json()["status"] == "in_review"
    frozen = send(
        client,
        "patch",
        f"{O}/{opp.pk}/draft",
        {"row_version": done.json()["row_version"], "content": {"title": "X"}},
    )
    assert frozen.status_code in (403, 409)  # frozen: a change needs a new revision
    opp.refresh_from_db()
    assert opp.pending_version is not None and opp.pending_version.title == "Graduate Electrical Engineer"


def test_other_people_cannot_edit_someone_elses_draft(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    body = {"row_version": opp.row_version, "content": {"title": "Hacked"}}
    for who in ("author_editor", "editor"):
        assert send(signed_in(people[who]), "patch", f"{O}/{opp.pk}/draft", body).status_code == 404
    assert (
        send(signed_in(people["admin"]), "patch", f"{O}/{opp.pk}/draft", body).status_code == 403
    )  # read-only support
    opp.refresh_from_db()
    assert opp.pending_version is not None and opp.pending_version.title != "Hacked"


def test_editor_approves_and_publishes(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    editor = signed_in(people["editor"])
    names = {a["name"] for a in editor.get(f"{O}/{opp.pk}").json()["actions"]}
    assert {"approve", "reject"} <= names
    incomplete = act(editor, opp, "approve", source_reviewed=True)
    assert incomplete.status_code == 400  # the checklist is incomplete; nothing is approved
    opp.refresh_from_db()
    assert opp.status == ListingStatus.IN_REVIEW
    assert act(editor, opp, "approve", **APPROVE).status_code == 200
    opp.refresh_from_db()
    assert opp.status == ListingStatus.APPROVED
    assert act(editor, opp, "publish").status_code == 200
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED and opp.slug


def test_author_with_editor_authority_is_not_offered_and_cannot_force_approval(
    world: World, people: dict[str, User]
) -> None:
    author = people["author_editor"]
    opp = submitted(world, author)
    client = signed_in(author)
    assert "approve" not in {a["name"] for a in client.get(f"{O}/{opp.pk}").json()["actions"]}
    forced = act(client, opp, "approve", **APPROVE)
    assert forced.status_code == 403 and forced.json()["error"]["code"] == "action_unavailable"
    opp.refresh_from_db()
    assert opp.status == ListingStatus.IN_REVIEW
    # the same person may publish after someone else approved the exact revision
    workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    assert "publish" in {a["name"] for a in client.get(f"{O}/{opp.pk}").json()["actions"]}
    assert act(client, opp, "publish").status_code == 200
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED


def test_stale_action_requests_are_refused(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    stale = send(
        signed_in(people["editor"]),
        "post",
        f"{O}/{opp.pk}/actions/reject",
        {"row_version": opp.row_version - 1, "reason_code": "x", "reason": "The source is unclear to me."},
    )
    assert stale.status_code == 409
    opp.refresh_from_db()
    assert opp.status == ListingStatus.IN_REVIEW


def test_reject_verify_and_takedown(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    editor = signed_in(people["editor"])
    assert act(editor, opp, "reject", reason_code="source", reason="short").status_code == 400
    ok = act(editor, opp, "reject", reason_code="source", reason="The cited source does not show a deadline.")
    assert ok.status_code == 200
    opp.refresh_from_db()
    assert opp.status == ListingStatus.REJECTED
    live = published(world, people["author"], people["editor"], example="jobs-2")
    check = {
        "version_no": 1,
        "level": "issuer_verified",
        "method": "source_page_review",
        "outcome": "confirmed",
        "evidence_note": "Compared the page with the issuer notice.",
    }
    refused = act(editor, live, "verify", **check)
    assert refused.status_code in (400, 409)  # a page review is not issuer verification
    live.refresh_from_db()
    assert live.verification_level == "not_verified"
    assert act(editor, live, "verify", **{**check, "level": "source_checked"}).status_code == 200
    live.refresh_from_db()
    assert live.verification_level == "source_checked"
    assert (
        act(
            editor, live, "takedown", reason_code="error", reason="Published in error by mistake."
        ).status_code
        == 200
    )
    live.refresh_from_db()
    assert live.status == ListingStatus.ARCHIVED and live.archive_reason == "takedown"


def test_unknown_actions_and_missing_listings_are_404(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    editor = signed_in(people["editor"])
    assert send(editor, "post", f"{O}/{opp.pk}/actions/nonsense", {}).status_code == 404
    assert editor.get(f"{O}/00000000-0000-4000-8000-000000000000").status_code == 404
    assert APIClient().post(f"{O}/{opp.pk}/actions/approve", {}, format="json").status_code in (401, 403)


def test_every_action_is_audited_with_the_acting_role(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    act(signed_in(people["admin"]), opp, "approve", **APPROVE)
    event = AuditEvent.objects.get(object_id=opp.pk, action="opportunity.approve")
    assert event.changes and event.changes["capacity"] == "administrator"
    assert event.actor_ref == people["admin"].pk


def test_frozen_revisions_are_readable_by_every_role_that_may_see_them(
    world: World, people: dict[str, User]
) -> None:
    opp = submitted(world, people["author"])
    for who in ("author", "editor", "admin"):
        body = signed_in(people[who]).get(f"{O}/{opp.pk}")
        assert body.status_code == 200, who
        pending = body.json()["pending"]
        assert pending["hidden"] is False and pending["content"]["deadline_timezone"] == "Africa/Harare"
    live = published(world, people["author"], people["editor"], example="jobs-2")
    detail = signed_in(people["editor"]).get(f"{O}/{live.pk}").json()
    assert (detail["live"]["content"]["title"] and detail["closing"] is None) or detail["closing"]


def test_listing_queue_does_not_query_per_row(world: World, people: dict[str, User]) -> None:
    published(world, people["author_editor"], people["editor"], example="grants-1")
    client = signed_in(people["admin"])

    def count() -> int:
        with CaptureQueriesContext(connection) as ctx:
            assert client.get(O).status_code == 200
        return len(ctx.captured_queries)

    count()  # warm per-process caches
    one = count()
    for example in ("jobs-1", "internships-1", "scholarships-1"):
        published(world, people["author_editor"], people["editor"], example=example)
    assert count() == one


def test_manage_staff_role_is_audited_and_requires_an_administrator(people: dict[str, User]) -> None:
    args = [
        "--email",
        people["seeker"].email,
        "--role",
        "contributor",
        "--reason",
        "Joins the editorial team.",
        "--by",
    ]
    with pytest.raises(CommandError):
        call_command("manage_staff_role", "grant", *args, people["editor"].email)
    call_command("manage_staff_role", "grant", *args, people["admin"].email)
    assert "contributor" in User.objects.get(pk=people["seeker"].pk).active_roles()
    with pytest.raises(CommandError):
        call_command("manage_staff_role", "grant", *args, people["admin"].email)  # already held
    call_command("manage_staff_role", "revoke", *args, people["admin"].email)
    row = StaffRoleAssignment.objects.filter(user=people["seeker"], role="contributor").latest("granted_at")
    assert row.revoked_at is not None and row.revoked_by_id == people["admin"].pk
    actions = list(AuditEvent.objects.filter(object_id=people["seeker"].pk).values_list("action", flat=True))
    assert actions == ["role.grant", "role.revoke"]
    with pytest.raises(CommandError):
        call_command(
            "manage_staff_role", "grant", "--email", "nobody@example.org", "--role", "editor",
            "--reason", "A valid reason here.", "--by", people["admin"].email,
        )  # fmt: skip
    with pytest.raises(CommandError):
        call_command("manage_staff_role", "revoke", *args, people["admin"].email)  # not held any more


def test_seed_demo_loads_every_category_and_respects_the_rules(
    people: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("UPNEXT_DEMO_TOOLS", "1")  # seeding needs demo tools (production never allows them)
    call_command("seed_demo", "--force")
    live = Opportunity.objects.filter(status=ListingStatus.PUBLISHED)
    assert set(live.values_list("category__code", flat=True)) == {
        "jobs", "internships", "graduate-programmes", "scholarships", "tenders", "grants"
    }  # fmt: skip
    assert live.count() == 12
    for opp in live:
        assert opp.live_version is not None
        assert opp.live_version.approved_by_id != opp.live_version.author_id
    assert Opportunity.objects.exclude(status=ListingStatus.PUBLISHED).count() == 4
    call_command("seed_demo", "--force")  # idempotent
    assert Opportunity.objects.count() == 16
    assert OpportunityVersion.objects.filter(state="published").count() == 12
