"""Role-based landing (D-70): one server-side answer to "which dashboard?", used by every way of signing in."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.home import EMPLOYER_HOME, SEEKER_HOME, STAFF_HOME, dashboard_path
from accounts.models import AccountStatus, User
from employers.models import EmployerMembership
from tests.conftest import PASSWORD, post_json
from tests.employer_helpers import verified_member
from tests.test_registration_and_google import GOOGLE, callback, fake_google, start
from tests.test_user_mfa import LOGIN_STEP, code_now, send, turn_on

pytestmark = pytest.mark.django_db
LOGIN, ME = "/api/v1/auth/login", "/api/v1/me"


def login(user: User) -> tuple[APIClient, Any]:
    client = APIClient(enforce_csrf_checks=True)
    return client, post_json(client, LOGIN, {"email": user.email, "password": PASSWORD})


@pytest.fixture
def employer(make_user: Callable[..., User], people: dict[str, User]) -> User:
    member = make_user(email="employer@example.org")
    verified_member(people["editor"], member)
    return member


# --- the resolver ----------------------------------------------------------------------------------------
def test_a_plain_account_lands_on_the_seeker_dashboard(make_user: Callable[..., User]) -> None:
    assert dashboard_path(make_user()) == SEEKER_HOME == "/dashboard"


@pytest.mark.parametrize("role", ["contributor", "editor", "administrator"])
def test_every_staff_role_lands_in_the_workspace(make_user: Callable[..., User], role: str) -> None:
    assert dashboard_path(make_user(roles=(role,))) == STAFF_HOME == "/workspace"


def test_an_employer_member_lands_on_the_employer_dashboard(employer: User) -> None:
    assert dashboard_path(employer) == EMPLOYER_HOME == "/employer"


def test_staff_authority_wins_over_employer_membership(
    employer: User, make_user: Callable[..., User], people: dict[str, User]
) -> None:
    from accounts.models import StaffRoleAssignment

    StaffRoleAssignment.objects.create(user=employer, role="editor", reason="test fixture")
    employer.refresh_roles()
    assert dashboard_path(employer) == STAFF_HOME


def test_a_revoked_membership_no_longer_sends_anyone_to_the_employer_dashboard(
    employer: User, people: dict[str, User]
) -> None:
    EmployerMembership.objects.filter(user=employer).update(
        revoked_at=timezone.now(), revoked_by=people["editor"], revoked_reason="left the company"
    )
    assert dashboard_path(employer) == SEEKER_HOME


def test_an_account_asking_for_a_role_through_the_request_gains_nothing(
    client: APIClient, make_user: Callable[..., User]
) -> None:
    """A client-supplied role, header or query value is never read: the answer comes from the database."""
    user = make_user()
    web = APIClient(enforce_csrf_checks=True)
    smuggled = {
        "email": user.email,
        "password": PASSWORD,
        "roles": ["administrator"],
        "home_path": "/workspace",
    }
    assert post_json(web, LOGIN, smuggled).status_code == 400  # unknown fields are refused outright
    _, plain = login(user)
    assert plain.json()["home_path"] == "/dashboard"
    web, _ = login(user)
    assert web.get(f"{ME}?role=employer", HTTP_X_ROLE="administrator").json()["home_path"] == "/dashboard"


# --- password sign-in and session restoration ------------------------------------------------------------
@pytest.mark.parametrize(
    ("who", "expected"),
    [("seeker", "/dashboard"), ("editor", "/workspace"), ("admin", "/workspace"), ("author", "/workspace")],
)
def test_password_sign_in_names_the_dashboard(people: dict[str, User], who: str, expected: str) -> None:
    client, response = login(people[who])
    assert response.status_code == 200 and response.json()["home_path"] == expected
    assert client.get(ME).json()["home_path"] == expected  # restoring the session says the same


def test_an_employer_signs_in_to_the_employer_dashboard(employer: User) -> None:
    client, response = login(employer)
    assert response.json()["home_path"] == "/employer"
    assert client.get(ME).json()["home_path"] == "/employer"


# --- restricted and unverified accounts keep their controls ---------------------------------------------
@pytest.mark.parametrize(
    "status", [AccountStatus.SUSPENDED, AccountStatus.DEACTIVATED, AccountStatus.RESTRICTED]
)
def test_an_account_that_is_not_active_never_gets_a_dashboard(
    make_user: Callable[..., User], status: str
) -> None:
    user = make_user(status=status)
    client, response = login(user)
    assert response.status_code == 403 and "home_path" not in response.json()
    assert client.get(ME).status_code in (401, 403)


def test_an_unverified_account_is_told_to_verify_not_given_a_dashboard(
    make_user: Callable[..., User],
) -> None:
    user = make_user(status=AccountStatus.PENDING_VERIFICATION)
    client, response = login(user)
    assert response.status_code == 403 and response.json()["error"]["code"] == "email_not_verified"
    assert client.get(ME).status_code in (401, 403)
    assert client.get("/api/v1/employer/overview").status_code in (401, 403)


# --- two-step verification: the dashboard is named only after the code ----------------------------------
def test_two_step_sign_in_names_the_dashboard_only_after_the_code(
    make_user: Callable[..., User],
) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    first = send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    assert first.json() == {"two_step_required": True}
    assert client.get(ME).status_code in (401, 403)  # no session, so no dashboard yet
    from tests.test_user_mfa import next_code

    second = send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert second.status_code == 200 and second.json()["home_path"] == "/dashboard"


def test_a_wrong_code_gives_no_session_and_no_dashboard(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    bad = send(client, "post", LOGIN_STEP, {"code": "000000" if code_now(user) != "000000" else "111111"})
    assert bad.status_code == 400 and "home_path" not in bad.json()
    assert client.get(ME).status_code in (401, 403)


# --- Google ---------------------------------------------------------------------------------------------
@override_settings(**GOOGLE)
def test_google_sign_in_without_a_return_address_lands_on_the_dashboard(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    query, _ = start(client)
    fake_google(monkeypatch, query)
    assert callback(client, query)["Location"] == "/dashboard"


@override_settings(**GOOGLE)
def test_google_sign_in_of_an_employer_lands_on_the_employer_dashboard(
    client: APIClient, employer: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    query, _ = start(client)
    fake_google(monkeypatch, query, email=employer.email)
    assert callback(client, query)["Location"] == "/employer"


@override_settings(**GOOGLE)
def test_google_sign_in_keeps_a_safe_return_address(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    query, _ = start(client, "/saved")
    fake_google(monkeypatch, query)
    assert callback(client, query)["Location"] == "/saved"


@override_settings(**GOOGLE)
def test_the_google_request_carries_no_default_address(client: APIClient) -> None:
    response = client.get("/api/v1/auth/google/start")
    assert response.status_code == 302 and parse_qs(urlparse(response["Location"]).query)["state"]
