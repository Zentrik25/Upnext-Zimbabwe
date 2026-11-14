"""Verification as one switch (D-62): the staff API, permissions enforced on the server, the public badge, and
that it stays separate from publication."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from opportunities.models import ListingStatus, Opportunity, VerificationLevel
from tests.factories import CHECKLIST, STANDARD, World, new_draft, published

from .conftest import csrf
from .test_staff_api import S, signed_in

pytestmark = pytest.mark.django_db


def put(client: APIClient, opp: Opportunity, body: Any) -> Any:
    return client.put(
        f"{S}/opportunities/{opp.pk}/verification", body, format="json", HTTP_X_CSRFTOKEN=csrf(client)
    )


def test_an_editor_verifies_and_unverifies_with_one_request_each(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    client = signed_in(people["editor2"])
    on = put(client, opp, {"verified": True, **STANDARD})
    assert on.status_code == 200
    row = on.json()
    assert row["verified"] is True and row["verification_label"] == "Verified" and row["can_verify"] is True
    assert row["verified_by"] == people["editor2"].display_name and row["verified_at"]
    opp.refresh_from_db()
    assert opp.is_verified and opp.verification_level == VerificationLevel.ISSUER_VERIFIED
    off = put(client, opp, {"verified": False}).json()
    assert (
        off["verified"] is False
        and off["verified_at"] is None
        and off["verification_label"] == "Not verified"
    )
    opp.refresh_from_db()
    assert not opp.is_verified and opp.verification_changed_by_id == people["editor2"].pk
    assert AuditEvent.objects.filter(object_id=opp.pk, action="opportunity.verified").count() == 1
    assert AuditEvent.objects.filter(object_id=opp.pk, action="opportunity.unverified").count() == 1


def test_the_listing_shows_the_saved_state_to_everyone_on_the_staff_list_and_detail(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    put(signed_in(people["admin"]), opp, {"verified": True, **STANDARD})
    detail = signed_in(people["editor"]).get(f"{S}/opportunities/{opp.pk}").json()
    assert detail["verified"] is True and detail["verified_by"] == people["admin"].display_name
    rows = signed_in(people["editor"]).get(f"{S}/opportunities").json()["data"]
    assert [r["verified"] for r in rows if r["id"] == str(opp.pk)] == [True]
    only_yes = signed_in(people["editor"]).get(f"{S}/opportunities", {"verified": "yes"}).json()["data"]
    only_no = signed_in(people["editor"]).get(f"{S}/opportunities", {"verified": "no"}).json()["data"]
    assert [r["id"] for r in only_yes] == [str(opp.pk)] and only_no == []


def test_permission_is_enforced_on_the_server_not_just_in_the_screen(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    contributor = signed_in(people["author"])
    shown = contributor.get(f"{S}/opportunities/{opp.pk}")
    # the Contributor can see their own work but is told they cannot verify it...
    assert shown.status_code == 200 and shown.json()["can_verify"] is False
    # ...and a direct request is refused whatever the screen showed
    refused = put(contributor, opp, {"verified": True, **STANDARD})
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "permission_denied"
    assert put(signed_in(people["seeker"]), opp, {"verified": True, **STANDARD}).status_code == 403
    assert put(APIClient(), opp, {"verified": True, **STANDARD}).status_code in (401, 403)
    opp.refresh_from_db()
    assert opp.is_verified is False
    assert AuditEvent.objects.filter(object_id=opp.pk, action="opportunity.verified.denied").exists()


def test_the_request_must_be_a_clear_yes_or_no(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    client = signed_in(people["editor"])
    for bad in ({}, {"verified": "yes"}, {"verified": 1}, [True], {"verified": None}):
        assert put(client, opp, bad).status_code == 400
    assert (
        client.put(
            f"{S}/opportunities/00000000-0000-0000-0000-000000000000/verification",
            {"verified": True, **STANDARD},
            format="json",
            HTTP_X_CSRFTOKEN=csrf(client),
        ).status_code
        == 404
    )
    opp.refresh_from_db()
    assert opp.is_verified is False


def test_without_the_csrf_token_nothing_changes(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    client = signed_in(people["editor"])
    response = client.put(
        f"{S}/opportunities/{opp.pk}/verification", {"verified": True, **STANDARD}, format="json"
    )
    assert response.status_code == 403
    opp.refresh_from_db()
    assert opp.is_verified is False


def test_new_listings_are_not_verified_and_publishing_does_not_verify(
    world: World, people: dict[str, User]
) -> None:
    draft = new_draft(world, people["editor"])
    assert draft.is_verified is False
    from opportunities import workflow

    workflow.publish_direct(
        people["editor"], draft.pk, expected_row_version=draft.row_version, checklist=CHECKLIST
    )
    draft.refresh_from_db()
    assert draft.status == ListingStatus.PUBLISHED and draft.is_verified is False  # published, not verified


def test_a_draft_can_be_verified_by_an_authorised_admin_and_does_not_block_editing(
    world: World, people: dict[str, User]
) -> None:
    from opportunities import workflow

    draft = new_draft(world, people["editor"])
    before = draft.row_version
    assert put(signed_in(people["admin"]), draft, {"verified": True, **STANDARD}).status_code == 200
    draft.refresh_from_db()
    assert draft.row_version == before  # the open editor's next save is not refused as stale
    workflow.save_draft(
        people["editor"], draft.pk, expected_row_version=before, content={"summary": "A fresh summary line."}
    )


def test_the_public_page_shows_the_state_and_the_old_action_is_gone(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    public = APIClient()
    assert public.get(f"/api/v1/opportunities/{opp.slug}").json()["verification"]["level"] == "not_verified"
    put(signed_in(people["editor2"]), opp, {"verified": True, **STANDARD})
    shown = public.get(f"/api/v1/opportunities/{opp.slug}").json()["verification"]
    assert shown["level"] == "issuer_verified" and shown["checked_at"]
    listed = public.get("/api/v1/opportunities").json()["data"]
    assert [r["verification"]["level"] for r in listed if r["slug"] == opp.slug] == ["issuer_verified"]
    put(signed_in(people["editor2"]), opp, {"verified": False})
    assert public.get(f"/api/v1/opportunities/{opp.slug}").json()["verification"] == {
        "level": "not_verified",
        "reverification_pending": False,
        "checked_at": None,
        "method": None,
    }
    actions = signed_in(people["editor"]).get(f"{S}/opportunities/{opp.pk}").json()["actions"]
    assert "verify" not in {
        a["name"] for a in actions
    }  # the multi-field record-verification action no longer exists


def test_the_backfill_keeps_issuer_verified_listings_verified(world: World, people: dict[str, User]) -> None:
    from importlib import import_module

    from django.apps import apps

    kept = published(world, people["author"], people["editor"], example="jobs-1")
    weaker = published(world, people["author"], people["editor"], example="jobs-2")
    Opportunity.objects.filter(pk=kept.pk).update(verification_level="issuer_verified")
    Opportunity.objects.filter(pk=weaker.pk).update(verification_level="source_checked")
    import_module("opportunities.migrations.0011_backfill_verification_and_media").forwards(apps, None)
    kept.refresh_from_db()
    weaker.refresh_from_db()
    assert kept.is_verified and kept.verification_level == "issuer_verified"
    assert not weaker.is_verified and weaker.verification_level == "not_verified"
