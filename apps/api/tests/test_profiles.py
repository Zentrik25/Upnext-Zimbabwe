"""The seeker profile (Phase 6B): validation, privacy, reset, deletion, account deletion."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from rest_framework.test import APIClient

from accounts import deletion
from accounts.models import User
from alerts.models import JobAlert
from audit.models import AuditEvent
from catalog.models import Skill
from profiles.models import SeekerProfile
from tests.factories import World
from tests.seekers import delete, location_id, patch, post, sector_id, signed_in, skill_id

pytestmark = pytest.mark.django_db
URL = "/api/v1/me/profile"


def test_a_new_account_has_an_empty_profile_and_nothing_is_stored(
    make_user: Callable[..., User], world: World
) -> None:
    client, _ = signed_in(make_user)
    body = client.get(URL).json()
    assert body["exists"] is False and body["fields_filled"] == 0 and body["fields_total"] == 9
    assert body["categories"] == [] and body["skills"] == [] and body["home_location"] is None
    assert SeekerProfile.objects.count() == 0  # reading never creates a row


def test_profile_needs_a_session_and_csrf(make_user: Callable[..., User], world: World) -> None:
    anonymous = APIClient(enforce_csrf_checks=True)
    assert anonymous.get(URL).status_code == 401
    client, _ = signed_in(make_user)
    assert client.patch(URL, {"experience_level": "mid"}, format="json").status_code == 403
    assert client.delete(URL).status_code == 403
    assert SeekerProfile.objects.count() == 0


def test_every_field_can_be_saved_and_is_returned_with_names(
    make_user: Callable[..., User], world: World
) -> None:
    client, _ = signed_in(make_user)
    response = patch(
        client,
        URL,
        {
            "home_location": location_id("bulawayo"),
            "highest_qualification": "diploma",
            "experience_level": "entry",
            "skills": [skill_id("AutoCAD"), skill_id("Spreadsheets")],
            "categories": ["jobs", "internships"],
            "sectors": [sector_id("engineering")],
            "preferred_locations": [location_id("harare"), location_id("harare-province")],
            "employment_types": ["permanent", "contract"],
            "work_arrangements": ["hybrid", "remote"],
        },
    )
    assert response.status_code == 200, response.content
    body = client.get(URL).json()
    assert body["exists"] is True and body["fields_filled"] == 9
    assert body["home_location"]["name"] == "Bulawayo"
    assert {s["name"] for s in body["skills"]} == {"AutoCAD", "Spreadsheets"}
    assert {c["code"] for c in body["categories"]} == {"jobs", "internships"}
    assert body["sectors"][0]["name"] == "Engineering"
    assert body["employment_types"] == ["permanent", "contract"]
    assert body["work_arrangements"] == ["hybrid", "remote"]
    assert body["highest_qualification"] == "diploma" and body["experience_level"] == "entry"


def test_partial_update_replaces_lists_and_null_clears(make_user: Callable[..., User], world: World) -> None:
    client, _ = signed_in(make_user)
    patch(client, URL, {"experience_level": "mid", "categories": ["jobs"], "skills": [skill_id("AutoCAD")]})
    patch(client, URL, {"categories": ["grants"]})
    body = client.get(URL).json()
    assert [c["code"] for c in body["categories"]] == ["grants"]
    assert body["experience_level"] == "mid" and len(body["skills"]) == 1  # untouched
    patch(client, URL, {"experience_level": None, "skills": []})
    body = client.get(URL).json()
    assert body["experience_level"] is None and body["skills"] == []


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"nonsense": 1},
        {"experience_level": "wizard"},
        {"highest_qualification": "phd"},
        {"categories": ["nope"]},
        {
            "categories": [
                "jobs",
                "internships",
                "grants",
                "tenders",
                "scholarships",
                "graduate-programmes",
                "x",
            ]
        },
        {"skills": ["not-a-uuid"]},
        {"employment_types": ["forever"]},
        {"work_arrangements": ["on_site", "hybrid", "remote", "remote"]},
    ],
)
def test_invalid_input_is_refused_and_changes_nothing(
    make_user: Callable[..., User], world: World, payload: dict[str, object]
) -> None:
    client, _ = signed_in(make_user)
    response = patch(client, URL, payload)
    assert response.status_code == 400 and response.json()["error"]["code"] == "validation_failed"
    assert SeekerProfile.objects.count() == 0


def test_unknown_inactive_and_pending_taxonomy_values_are_refused(
    make_user: Callable[..., User], world: World
) -> None:
    client, _ = signed_in(make_user)
    missing = "00000000-0000-4000-8000-00000000ffff"
    assert patch(client, URL, {"skills": [missing]}).status_code == 400
    pending = Skill.objects.create(name="Secret pending skill", status="pending")
    assert patch(client, URL, {"skills": [str(pending.pk)]}).status_code == 400
    assert patch(client, URL, {"sectors": [missing]}).status_code == 400
    assert patch(client, URL, {"preferred_locations": [missing]}).status_code == 400
    dormant = Skill.objects.create(name="Retired skill", active=False)
    assert patch(client, URL, {"skills": [str(dormant.pk)]}).status_code == 400


def test_home_location_must_be_a_city_or_province(make_user: Callable[..., User], world: World) -> None:
    client, _ = signed_in(make_user)
    assert patch(client, URL, {"home_location": location_id("remote")}).status_code == 400
    assert patch(client, URL, {"home_location": location_id("harare")}).status_code == 200
    assert patch(client, URL, {"home_location": location_id("midlands")}).status_code == 200
    assert patch(client, URL, {"home_location": None}).json()["home_location"] is None


def test_duplicates_in_a_list_are_folded(make_user: Callable[..., User], world: World) -> None:
    client, _ = signed_in(make_user)
    response = patch(
        client,
        URL,
        {"skills": [skill_id("AutoCAD")] * 3, "work_arrangements": ["remote", "remote"]},
    )
    assert response.status_code == 200
    assert len(response.json()["skills"]) == 1 and response.json()["work_arrangements"] == ["remote"]


def test_reset_clears_preferences_but_keeps_the_about_you_fields(
    make_user: Callable[..., User], world: World
) -> None:
    client, _ = signed_in(make_user)
    patch(
        client,
        URL,
        {
            "highest_qualification": "diploma",
            "experience_level": "entry",
            "skills": [skill_id("AutoCAD")],
            "home_location": location_id("harare"),
            "categories": ["jobs"],
            "sectors": [sector_id("engineering")],
            "preferred_locations": [location_id("harare")],
            "employment_types": ["contract"],
            "work_arrangements": ["remote"],
        },
    )
    body = post(client, f"{URL}/reset-preferences").json()
    assert body["categories"] == [] and body["sectors"] == [] and body["preferred_locations"] == []
    assert body["employment_types"] == [] and body["work_arrangements"] == []
    assert body["highest_qualification"] == "diploma" and body["experience_level"] == "entry"
    assert len(body["skills"]) == 1 and body["home_location"]["name"] == "Harare"
    assert body["fields_filled"] == 4


def test_reset_with_no_profile_is_harmless(make_user: Callable[..., User], world: World) -> None:
    client, _ = signed_in(make_user)
    response = post(client, f"{URL}/reset-preferences")
    assert response.status_code == 200 and response.json()["exists"] is False


def test_delete_removes_everything_and_is_idempotent(make_user: Callable[..., User], world: World) -> None:
    client, user = signed_in(make_user, display_name="Keep My Name")
    patch(client, URL, {"categories": ["jobs"], "skills": [skill_id("AutoCAD")]})
    assert delete(client, URL).status_code == 204
    assert not SeekerProfile.objects.filter(user=user).exists()
    assert client.get(URL).json()["exists"] is False
    assert delete(client, URL).status_code == 204
    user.refresh_from_db()
    assert user.display_name == "Keep My Name"  # the account is untouched


def test_one_account_cannot_see_or_change_another_accounts_profile(
    make_user: Callable[..., User], world: World
) -> None:
    alice, _ = signed_in(make_user, email="alice@example.org")
    bob, bob_user = signed_in(make_user, email="bob@example.org")
    patch(alice, URL, {"experience_level": "senior", "categories": ["grants"]})
    assert bob.get(URL).json()["exists"] is False
    patch(bob, URL, {"experience_level": "entry"})
    assert alice.get(URL).json()["experience_level"] == "senior"
    delete(bob, URL)
    assert alice.get(URL).json()["exists"] is True
    assert SeekerProfile.objects.filter(user=bob_user).count() == 0


def test_staff_and_employers_see_only_their_own_profile(
    make_user: Callable[..., User], world: World, people: dict[str, User]
) -> None:
    seeker, _ = signed_in(make_user, email="private@example.org")
    patch(seeker, URL, {"experience_level": "executive"})
    for staff in ("admin", "editor"):
        client = APIClient(enforce_csrf_checks=True)
        from tests.conftest import PASSWORD, post_json

        assert (
            post_json(
                client, "/api/v1/auth/login", {"email": people[staff].email, "password": PASSWORD}
            ).status_code
            == 200
        )
        assert client.get(URL).json()["exists"] is False  # their own, empty


def test_profiles_and_alerts_are_not_in_the_staff_workspace() -> None:
    """No staff register or reference-data screen is built on a seeker's profile or alert (P6B-02)."""
    from api.staff_catalog import KINDS
    from api.staff_records import RESOURCES

    models = {r.queryset(None).model for r in RESOURCES.values()}  # type: ignore[arg-type]
    models |= {k.model for k in KINDS.values()}
    assert SeekerProfile not in models and JobAlert not in models


def test_no_url_exposes_a_seeker_profile_by_id() -> None:
    """The seeker profile is reachable only as `/me/profile`: no route takes an id that selects another account."""
    from collections.abc import Iterator

    from django.urls import URLPattern, URLResolver, get_resolver

    def routes(patterns: list[URLPattern | URLResolver], prefix: str = "") -> Iterator[str]:
        for p in patterns:
            if isinstance(p, URLResolver):
                yield from routes(p.url_patterns, prefix + str(p.pattern))
            elif isinstance(p, URLPattern):
                yield prefix + str(p.pattern)

    found = [r for r in routes(get_resolver().url_patterns) if "profile" in r and "employer" not in r]
    assert sorted(found) == ["api/v1/me/profile", "api/v1/me/profile/reset-preferences"]


def test_audit_records_that_a_change_happened_and_never_its_content(
    make_user: Callable[..., User], world: World
) -> None:
    client, user = signed_in(make_user)
    patch(client, URL, {"experience_level": "executive", "skills": [skill_id("AutoCAD")]})
    event = AuditEvent.objects.get(action="profile.updated", actor_ref=user.pk)
    assert event.changes == {"fields": ["experience_level", "skills"]}
    assert "executive" not in str(event.changes) and "AutoCAD" not in str(event.changes)
    delete(client, URL)
    assert AuditEvent.objects.filter(action="profile.deleted", actor_ref=user.pk).count() == 1


def test_account_deletion_removes_the_profile_the_alert_and_its_ledger(
    make_user: Callable[..., User], world: World, people: dict[str, User]
) -> None:
    from datetime import timedelta

    from django.utils import timezone

    from alerts.models import AlertDelivery
    from tests.seekers import live

    client, user = signed_in(make_user)
    patch(client, URL, {"categories": ["jobs"], "skills": [skill_id("AutoCAD")]})
    alert = JobAlert.objects.create(user=user, frequency="daily")
    job = live(world, people, "jobs-1", "del")
    AlertDelivery.objects.create(alert=alert, opportunity=job)
    user.deletion_requested_at = timezone.now() - timedelta(days=30)
    user.save()
    assert deletion.execute(user.pk) is True
    assert not SeekerProfile.objects.filter(user=user).exists()
    assert not JobAlert.objects.filter(user=user).exists()
    assert AlertDelivery.objects.count() == 0
