"""Employer portal HTTP API (Phase 6A, D-35): authentication, CSRF, object-level access, the whole journey and
the public company profile and counters."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from employers import services
from employers.models import MemberRole
from opportunities import workflow
from opportunities.models import Opportunity
from tests.factories import CHECKLIST, World

from .conftest import PASSWORD, csrf, post_json

pytestmark = pytest.mark.django_db

CLAIM = {
    "organisation_name": "Acme Mining Zimbabwe",
    "website_url": "https://acme.example.org",
    "role_title": "HR manager",
    "evidence_note": "Our official address is hr@acme.example.org and our registration is on file.",
}
PROFILE = {
    "tagline": "Digging responsibly",
    "about": "Acme Mining is a fictional company used in tests. It describes itself in plain text only.",
    "size_band": "51-200",
    "founded_year": 1999,
    "location_text": "Bulawayo",
}
J = "/api/v1/employer"


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
    return (
        getattr(client, method)(url, data, **kwargs)
        if data is not None
        else getattr(client, method)(url, **kwargs)
    )


def approve(editor: User, claim_id: str, **over: Any) -> None:
    services.decide_claim(
        editor,
        uuid.UUID(claim_id),
        approve=True,
        method="document_review",
        evidence_note="Certificate seen and filed.",
        **over,
    )


@pytest.fixture
def employer(make_user: Callable[..., User]) -> User:
    return make_user(email="employer@example.org", display_name="Employer One")


def test_every_employer_endpoint_needs_a_session_and_csrf_for_writes(
    client: APIClient, employer: User
) -> None:
    anon = [
        ("get", f"{J}/overview"),
        ("get", f"{J}/organisations/search?q=ac"),
        ("post", f"{J}/claims"),
        ("get", f"{J}/organisations/{uuid.uuid4()}/listings"),
        ("get", f"{J}/listings/{uuid.uuid4()}"),
        ("get", f"{J}/organisations/{uuid.uuid4()}/analytics"),
    ]
    for method, url in anon:
        response = getattr(client, method)(url)
        assert response.status_code in (401, 403), (method, url, response.status_code)
    signed = signed_in(employer)
    no_csrf = signed.post(f"{J}/claims", CLAIM, format="json")
    assert no_csrf.status_code == 403 and no_csrf.json()["error"]["code"] == "csrf_failed"


def test_the_whole_journey_register_claim_verify_post_review_publish_and_count(
    client: APIClient, employer: User, people: dict[str, User], world: World
) -> None:
    web = signed_in(employer)
    overview = web.get(f"{J}/overview").json()
    assert overview["account_ready"] is True and overview["organisations"] == [] and overview["claims"] == []

    created = send(web, "post", f"{J}/claims", CLAIM)
    assert created.status_code == 201 and created.json()["status"] == "pending"
    claim_id = created.json()["id"]
    assert web.get(f"{J}/overview").json()["claims"][0]["status"] == "pending"

    # while the claim waits the account can post nothing
    nothing = send(
        web, "post", f"{J}/organisations/{uuid.uuid4()}/listings", {"category": "jobs", "content": {}}
    )
    assert nothing.status_code == 404

    approve(people["editor"], claim_id)
    org_id = web.get(f"{J}/overview").json()["organisations"][0]["id"]
    org = web.get(f"{J}/overview").json()["organisations"][0]
    assert org["verified"] is True and org["role"] == "owner" and org["listing_count"] == 0

    # post a job
    _, content = world.content("jobs-1")
    for key in ("sources", "organisation_id"):
        content.pop(key, None)
    made = send(web, "post", f"{J}/organisations/{org_id}/listings", {"category": "jobs", "content": content})
    assert made.status_code == 201, made.json()
    listing = made.json()
    assert listing["status"] == "draft" and listing["next_actions"] == ["edit", "submit", "discard"]
    assert listing["organisation"]["id"] == org_id
    opp_id = listing["id"]

    saved = send(
        web,
        "patch",
        f"{J}/listings/{opp_id}",
        {"row_version": listing["row_version"], "content": {"title": "Senior Mining Engineer"}},
    )
    assert saved.status_code == 200 and saved.json()["content"]["title"] == "Senior Mining Engineer"
    stale = send(
        web,
        "patch",
        f"{J}/listings/{opp_id}",
        {"row_version": 0, "content": {"title": "Another title again"}},
    )
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "state_conflict"
    bad = send(
        web,
        "patch",
        f"{J}/listings/{opp_id}",
        {"row_version": saved.json()["row_version"], "content": {"nonsense": 1}},
    )
    assert bad.status_code == 400 and "nonsense" in bad.json()["error"]["fields"]

    submitted = send(
        web, "post", f"{J}/listings/{opp_id}/submit", {"row_version": saved.json()["row_version"]}
    )
    assert submitted.status_code == 200, submitted.json()
    assert submitted.json()["status"] == "in_review" and submitted.json()["next_actions"] == []
    # not public, no counters, no profile yet
    assert client.get("/api/v1/opportunities?q=Mining").json()["data"] == []

    # staff review it under the unchanged rules
    opp = Opportunity.objects.get(pk=opp_id)
    workflow.approve(people["editor2"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor2"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.slug

    # public detail now links to a company profile only after one is approved
    assert client.get(f"/api/v1/opportunities/{opp.slug}").json()["organisation"]["profile_slug"] is None
    prof = send(web, "post", f"{J}/organisations/{org_id}/profile", PROFILE)
    assert prof.status_code == 201 and prof.json()["state"] == "pending"
    assert (
        client.get("/api/v1/employers/acme-mining-zimbabwe").status_code == 404
    )  # not public until approved
    state = web.get(f"{J}/organisations/{org_id}/profile").json()
    assert (
        state["live"] is None
        and state["pending"]["tagline"] == "Digging responsibly"
        and state["can_edit"] is True
    )
    services.decide_profile_revision(people["editor"], uuid.UUID(prof.json()["id"]), approve=True)
    slug = web.get(f"{J}/organisations/{org_id}/profile").json()["slug"]
    public = client.get(f"/api/v1/employers/{slug}")
    assert public.status_code == 200 and public.json()["tagline"] == "Digging responsibly"
    assert public.json()["open_listings"] == 1 and "evidence" not in str(public.json())
    assert client.get(f"/api/v1/opportunities/{opp.slug}").json()["organisation"]["profile_slug"] == slug

    # counters: anonymous, aggregate, no body stored
    for kind in ("view", "view", "apply"):
        assert (
            send(client, "post", f"/api/v1/opportunities/{opp.slug}/events", {"type": kind}).status_code
            == 204
        )
    stats = web.get(f"{J}/organisations/{org_id}/analytics").json()
    (row,) = stats["data"]
    assert row["last_7_days"] == {"views": 2, "apply_clicks": 1} and row["saves"] == 0
    assert "approximate" in stats["note"]
    # the dashboard lists it as published with an amend action
    listed = web.get(f"{J}/organisations/{org_id}/listings").json()["data"]
    assert listed[0]["status"] == "published" and listed[0]["next_actions"] == ["amend", "close"]


def test_other_peoples_ids_answer_404_and_never_reveal_existence(
    employer: User, people: dict[str, User], make_user: Callable[..., User], world: World
) -> None:
    mine = signed_in(employer)
    claim = send(mine, "post", f"{J}/claims", CLAIM).json()
    approve(people["editor"], claim["id"])
    org_id = mine.get(f"{J}/overview").json()["organisations"][0]["id"]
    _, content = world.content("jobs-1")
    content.pop("sources", None)
    listing = send(
        mine, "post", f"{J}/organisations/{org_id}/listings", {"category": "jobs", "content": content}
    ).json()

    rival = make_user(email="rival@example.org")
    theirs = signed_in(rival)
    rival_claim = send(theirs, "post", f"{J}/claims", {**CLAIM, "organisation_name": "Rival Company"}).json()
    approve(people["editor2"], rival_claim["id"])
    for method, url, body in (
        ("get", f"{J}/organisations/{org_id}/listings", None),
        ("post", f"{J}/organisations/{org_id}/listings", {"category": "jobs", "content": content}),
        ("get", f"{J}/organisations/{org_id}/profile", None),
        ("post", f"{J}/organisations/{org_id}/profile", PROFILE),
        ("get", f"{J}/organisations/{org_id}/analytics", None),
        ("get", f"{J}/listings/{listing['id']}", None),
        (
            "patch",
            f"{J}/listings/{listing['id']}",
            {"row_version": 1, "content": {"title": "Hijack the listing"}},
        ),
        ("post", f"{J}/listings/{listing['id']}/submit", {"row_version": listing["row_version"]}),
        ("post", f"{J}/listings/{listing['id']}/discard", {"row_version": listing["row_version"]}),
        ("delete", f"{J}/claims/{claim['id']}", None),
    ):
        response = send(theirs, method, url, body)
        assert response.status_code == 404, (method, url, response.status_code)
    # the owner is unaffected
    assert mine.get(f"{J}/listings/{listing['id']}").status_code == 200


def test_employers_cannot_reach_the_staff_site_or_review_actions(
    employer: User, people: dict[str, User], world: World
) -> None:
    web = signed_in(employer)
    claim = send(web, "post", f"{J}/claims", CLAIM).json()
    approve(people["editor"], claim["id"])
    assert web.get("/django-admin/", follow=False).status_code in (301, 302, 403)
    assert send(web, "post", "/django-admin/employers/organisationclaim/", {}).status_code in (
        302,
        403,
        404,
        405,
    )
    me = web.get("/api/v1/me").json()
    assert me["roles"] == []


def test_claim_endpoint_validation_and_search(client: APIClient, employer: User, world: World) -> None:
    web = signed_in(employer)
    bad = send(web, "post", f"{J}/claims", {"organisation_name": "A", "bogus": 1})
    assert bad.status_code == 400
    assert {"organisation_name", "role_title", "evidence_note", "bogus"} <= set(bad.json()["error"]["fields"])
    assert send(web, "post", f"{J}/claims", ["not", "an", "object"]).status_code == 400
    found = web.get(f"{J}/organisations/search?q=example pow").json()["data"]
    assert [o["name"] for o in found] == ["Example Power Services"]
    assert web.get(f"{J}/organisations/search?q=e").status_code == 400
    ok = send(web, "post", f"{J}/claims", CLAIM)
    withdrawn = send(web, "delete", f"{J}/claims/{ok.json()['id']}")
    assert withdrawn.status_code == 204
    assert send(web, "delete", f"{J}/claims/{ok.json()['id']}").status_code == 409


def test_an_unverified_or_revoked_employer_cannot_post_through_the_api(
    employer: User, people: dict[str, User], world: World
) -> None:
    web = signed_in(employer)
    claim = send(web, "post", f"{J}/claims", CLAIM).json()
    approve(people["editor"], claim["id"], role=MemberRole.RECRUITER)
    org_id = web.get(f"{J}/overview").json()["organisations"][0]["id"]
    _, content = world.content("jobs-1")
    content.pop("sources", None)
    listing = send(
        web, "post", f"{J}/organisations/{org_id}/listings", {"category": "jobs", "content": content}
    ).json()
    # recruiters cannot change the company profile
    assert send(web, "post", f"{J}/organisations/{org_id}/profile", PROFILE).status_code == 403
    services.revoke_verification(people["admin"], uuid.UUID(org_id), reason="Registration lapsed, see file.")
    denied = send(
        web, "post", f"{J}/listings/{listing['id']}/submit", {"row_version": listing["row_version"]}
    )
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "organisation_not_verified"
    public = APIClient().get("/api/v1/employers/anything")
    assert public.status_code == 404


def test_the_event_beacon_is_anonymous_small_and_strict(client: APIClient) -> None:
    url = "/api/v1/opportunities/no-such-listing-1/events"
    assert client.post(url, {"type": "view"}, format="json").status_code == 204  # unknown listing: ignored
    assert client.post(url, {"type": "scroll"}, format="json").status_code == 400
    assert client.post(url, "not json", content_type="application/json").status_code == 400
    assert client.post(url, {"type": "view", "x": "y" * 600}, format="json").status_code == 413
