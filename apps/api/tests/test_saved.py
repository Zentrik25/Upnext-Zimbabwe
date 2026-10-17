"""Saved opportunities (P3-06) and session lifetime limits."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from opportunities import saved, workflow
from opportunities.models import Opportunity, SavedOpportunity
from tests.factories import World, new_draft, published, varied

from .conftest import PASSWORD, csrf, post_json

pytestmark = pytest.mark.django_db


def signed_in(make_user: Callable[..., User], **kwargs: object) -> tuple[APIClient, User]:
    user = make_user(**kwargs)
    client = APIClient(enforce_csrf_checks=True)
    assert (
        post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}).status_code
        == 200
    )
    return client, user


def put(client: APIClient, opportunity: Opportunity | uuid.UUID) -> object:
    ident = opportunity.pk if isinstance(opportunity, Opportunity) else opportunity
    return client.put(f"/api/v1/me/saved/{ident}", HTTP_X_CSRFTOKEN=csrf(client))


def delete(client: APIClient, opportunity: Opportunity) -> object:
    return client.delete(f"/api/v1/me/saved/{opportunity.pk}", HTTP_X_CSRFTOKEN=csrf(client))


def live(world: World, people: dict[str, User], example: str, tag: str) -> Opportunity:
    return published(
        world, people["author"], people["editor"], example=example, **varied(world, example, tag)
    )


def test_saving_is_idempotent_and_listed_with_the_listing(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    job = live(world, people, "jobs-1", "a")
    client, user = signed_in(make_user)
    first, again = put(client, job), put(client, job)
    assert (first.status_code, again.status_code) == (201, 200)  # type: ignore[attr-defined]
    assert first.json()["availability"] == "open" and first.json()["opportunity"]["slug"] == job.slug  # type: ignore[attr-defined]
    assert SavedOpportunity.objects.filter(user=user).count() == 1
    listed = client.get("/api/v1/me/saved").json()
    assert [i["opportunity_id"] for i in listed["data"]] == [str(job.pk)]
    assert listed["page"]["total"] == 1
    assert delete(client, job).status_code == 204 and delete(client, job).status_code == 204  # type: ignore[attr-defined]
    assert client.get("/api/v1/me/saved").json()["data"] == []


def test_only_public_listings_can_be_saved(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    client, _ = signed_in(make_user)
    draft = new_draft(world, people["author"], "jobs-1", **varied(world, "jobs-1", "d"))
    assert put(client, draft).status_code == 404  # type: ignore[attr-defined]
    assert put(client, uuid.uuid4()).status_code == 404  # type: ignore[attr-defined]
    job = live(world, people, "jobs-1", "e")
    job.refresh_from_db()
    workflow.withdraw(
        people["editor"], job.pk, expected_row_version=job.row_version, reason="issuer withdrew"
    )
    assert put(client, job).status_code == 409  # type: ignore[attr-defined]
    assert put(client, job).json()["error"]["code"] == "listing_not_saveable"  # type: ignore[attr-defined]


def test_saved_items_report_availability_as_the_listing_changes(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    client, _ = signed_in(make_user)
    one = live(world, people, "jobs-1", "f")
    two = live(world, people, "grants-1", "g")
    put(client, one)
    put(client, two)
    one.refresh_from_db()
    workflow.withdraw(
        people["editor"], one.pk, expected_row_version=one.row_version, reason="issuer withdrew"
    )
    two.refresh_from_db()
    workflow.takedown(
        people["editor"],
        two.pk,
        expected_row_version=two.row_version,
        reason_code="error",
        reason="Listed in error; removed.",
    )
    by_id = {i["opportunity_id"]: i for i in client.get("/api/v1/me/saved").json()["data"]}
    assert by_id[str(one.pk)]["availability"] == "withdrawn" and by_id[str(one.pk)]["opportunity"]["slug"]
    assert by_id[str(two.pk)]["availability"] == "unavailable" and by_id[str(two.pk)]["opportunity"] is None
    assert "description" not in str(by_id[str(two.pk)])


def test_saved_lists_are_private_and_filterable_and_paged(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    mine, _ = signed_in(make_user)
    theirs, _ = signed_in(make_user)
    jobs = [live(world, people, "jobs-1", f"j{i}") for i in range(3)]
    grant = live(world, people, "grants-1", "gr")
    for item in [*jobs, grant]:
        put(mine, item)
    put(theirs, jobs[0])
    assert len(theirs.get("/api/v1/me/saved").json()["data"]) == 1
    only = mine.get("/api/v1/me/saved?category=grants").json()["data"]
    assert [i["opportunity_id"] for i in only] == [str(grant.pk)]
    page1 = mine.get("/api/v1/me/saved?limit=2").json()
    assert len(page1["data"]) == 2 and page1["page"]["has_more"]
    page2 = mine.get(f"/api/v1/me/saved?limit=2&cursor={page1['page']['next_cursor']}").json()
    ids = [i["opportunity_id"] for i in page1["data"] + page2["data"]]
    assert len(ids) == len(set(ids)) == 4 and page2["page"]["total"] is None
    assert mine.get("/api/v1/me/saved?limit=2&cursor=tampered").status_code == 400
    assert (
        mine.get(f"/api/v1/me/saved?category=jobs&cursor={page1['page']['next_cursor']}").status_code == 400
    )
    # another user's deletion does not touch mine
    theirs.delete(f"/api/v1/me/saved/{jobs[0].pk}", HTTP_X_CSRFTOKEN=csrf(theirs))
    assert len(mine.get("/api/v1/me/saved").json()["data"]) == 4


def test_ids_mode_returns_states_only_and_validates(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    client, _ = signed_in(make_user)
    a, b = live(world, people, "jobs-1", "h"), live(world, people, "grants-1", "i")
    put(client, a)
    states = client.get(f"/api/v1/me/saved?ids={a.pk},{b.pk}").json()["data"]
    assert [s["opportunity_id"] for s in states] == [str(a.pk)] and states[0]["opportunity"] is None
    assert client.get("/api/v1/me/saved?ids=nope").status_code == 400
    assert (
        client.get("/api/v1/me/saved?ids=" + ",".join(str(uuid.uuid4()) for _ in range(51))).status_code
        == 400
    )
    assert client.get("/api/v1/me/saved?bogus=1").status_code == 400
    assert client.get("/api/v1/me/saved?limit=0").status_code == 400
    assert client.get("/api/v1/me/saved?category=nope").status_code == 400


def test_save_limit(
    world: World, people: dict[str, User], make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(saved, "MAX_SAVED", 1)
    client, _ = signed_in(make_user)
    a, b = live(world, people, "jobs-1", "k"), live(world, people, "grants-1", "l")
    assert put(client, a).status_code == 201  # type: ignore[attr-defined]
    over = put(client, b)
    assert over.status_code == 409 and over.json()["error"]["code"] == "saved_limit_reached"  # type: ignore[attr-defined]
    assert put(client, a).status_code == 200  # type: ignore[attr-defined]  # already saved stays fine at the cap


def test_saving_needs_a_session_and_csrf(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    job = live(world, people, "jobs-1", "m")
    anonymous = APIClient(enforce_csrf_checks=True)
    assert put(anonymous, job).status_code == 401  # type: ignore[attr-defined]
    client, _ = signed_in(make_user)
    assert client.put(f"/api/v1/me/saved/{job.pk}").status_code == 403
    assert SavedOpportunity.objects.count() == 0


def test_the_public_api_is_never_personalised(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    job = live(world, people, "jobs-1", "n")
    client, _ = signed_in(make_user)
    put(client, job)
    body = client.get("/api/v1/opportunities").json()
    assert all(item["is_saved"] is None for item in body["data"])


# --- session lifetime -----------------------------------------------------------------------------------
def age_session(client: APIClient, *, idle: float = 0, absolute: float = 0) -> None:
    session = client.session
    now = time.time()
    session["last_activity"] = now - idle
    session["login_at"] = now - absolute
    session.save()


def test_seeker_sessions_are_idle_7_days_and_absolute_30_days(make_user: Callable[..., User]) -> None:
    client, _ = signed_in(make_user)
    age_session(client, idle=6 * 86400, absolute=6 * 86400)
    assert client.get("/api/v1/me").status_code == 200
    age_session(client, idle=8 * 86400, absolute=8 * 86400)
    assert client.get("/api/v1/me").status_code == 401
    client2, _ = signed_in(make_user)
    age_session(client2, idle=60, absolute=31 * 86400)
    assert client2.get("/api/v1/me").status_code == 401


def test_staff_sessions_are_idle_30_minutes_and_absolute_8_hours(make_user: Callable[..., User]) -> None:
    client, _ = signed_in(make_user, roles=("editor",))
    age_session(client, idle=25 * 60, absolute=25 * 60)
    assert client.get("/api/v1/me").status_code == 200
    age_session(client, idle=31 * 60, absolute=31 * 60)
    assert client.get("/api/v1/me").status_code == 401
    client2, _ = signed_in(make_user, roles=("editor",))
    age_session(client2, idle=60, absolute=9 * 3600)
    assert client2.get("/api/v1/me").status_code == 401


def test_the_staff_site_sends_a_content_security_policy_and_noindex(
    make_user: Callable[..., User],
) -> None:
    from django.test import Client

    response = Client().get("/staff/login/")
    csp = response["Content-Security-Policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp and "unsafe-eval" not in csp
    assert "'unsafe-inline'" not in csp.split("script-src")[1].split(";")[0]
    assert response["X-Robots-Tag"] == "noindex, nofollow"
    assert "Content-Security-Policy" not in Client().get("/api/v1/")


def test_a_listing_can_be_saved_once_per_user_in_the_database(
    world: World, people: dict[str, User], make_user: Callable[..., User]
) -> None:
    from django.db import IntegrityError, transaction

    job = live(world, people, "jobs-1", "dup")
    user = make_user()
    SavedOpportunity.objects.create(user=user, opportunity=job)
    with pytest.raises(IntegrityError), transaction.atomic():
        SavedOpportunity.objects.create(user=user, opportunity=job)
    SavedOpportunity.objects.create(user=make_user(), opportunity=job)  # another person may save it
