"""Registration with a phone number and recorded acceptance, "remember me", and Sign in with Google.

Google is never called: the token endpoint is replaced by a fake that returns whatever ID token a test builds.
"""

from __future__ import annotations

import base64
import json
import time
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from accounts import google
from accounts.models import AccountStatus, StaffRoleAssignment, User
from audit.models import AuditEvent
from tests.conftest import PASSWORD, csrf, post_json

pytestmark = pytest.mark.django_db
CLIENT_ID = "test-client-id.apps.googleusercontent.com"
GOOGLE = {"UPNEXT_GOOGLE_CLIENT_ID": CLIENT_ID, "UPNEXT_GOOGLE_CLIENT_SECRET": "test-secret"}


def register_body(**over: Any) -> dict[str, Any]:
    return {
        "email": "new@example.org",
        "password": PASSWORD,
        "display_name": "Nia Moyo",
        "phone_number": "+263 78 123 4567",
        "accept_terms": True,
        **over,
    }


# --- registration ----------------------------------------------------------------------------------------
def test_registration_stores_the_normalised_phone_number_and_the_acceptance(client: APIClient) -> None:
    assert post_json(client, "/api/v1/auth/register", register_body()).status_code == 202
    user = User.objects.get(email="new@example.org")
    assert user.phone_number == "+263781234567"
    assert user.terms_accepted_at is not None and user.terms_version


@pytest.mark.parametrize("phone", ["0781234567", "+0123456789", "+26378", "abc", "+263 78 123 45678901234"])
def test_a_phone_number_without_a_valid_country_code_is_refused(client: APIClient, phone: str) -> None:
    response = post_json(client, "/api/v1/auth/register", register_body(phone_number=phone))
    assert response.status_code == 400
    assert "phone_number" in response.json()["error"]["fields"]
    assert not User.objects.filter(email="new@example.org").exists()


def test_the_terms_must_be_accepted_and_the_phone_number_is_required(client: APIClient) -> None:
    refused = post_json(client, "/api/v1/auth/register", register_body(accept_terms=False))
    assert refused.status_code == 400 and "accept_terms" in refused.json()["error"]["fields"]
    body = register_body()
    del body["phone_number"]
    missing = post_json(client, "/api/v1/auth/register", body)
    assert missing.status_code == 400 and "phone_number" in missing.json()["error"]["fields"]


# --- remember me -----------------------------------------------------------------------------------------
def sign_in(client: APIClient, user: User, **extra: Any) -> Any:
    return post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD, **extra})


def test_without_remember_me_the_session_ends_with_the_browser(client: APIClient, make_user: Any) -> None:
    user = make_user(email="r1@example.org")
    response = sign_in(client, user, remember=False)
    cookie = response.cookies["upnext_sid"]
    assert response.status_code == 200 and not cookie["max-age"] and not cookie["expires"]


def test_with_remember_me_or_by_default_the_session_is_kept(client: APIClient, make_user: Any) -> None:
    kept = sign_in(client, make_user(email="r2@example.org"), remember=True).cookies["upnext_sid"]
    assert int(kept["max-age"]) > 24 * 3600
    other = APIClient(enforce_csrf_checks=True)
    default = sign_in(other, make_user(email="r3@example.org")).cookies["upnext_sid"]
    assert int(default["max-age"]) > 24 * 3600


# --- Google ----------------------------------------------------------------------------------------------
def start(client: APIClient, next_path: str | None = None) -> tuple[dict[str, list[str]], str]:
    response = client.get("/api/v1/auth/google/start", {"next": next_path} if next_path else {})
    assert response.status_code == 302, response.content
    location = response["Location"]
    return parse_qs(urlparse(location).query), location


def fake_google(
    monkeypatch: pytest.MonkeyPatch, query: dict[str, list[str]], **claims: Any
) -> list[dict[str, str]]:
    sent: list[dict[str, str]] = []
    payload = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "exp": time.time() + 600,
        "nonce": query["nonce"][0],
        "sub": "google-sub-1",
        "email": "person@example.org",
        "email_verified": True,
        "name": "Person One",
        **claims,
    }
    token = ".".join(
        base64.urlsafe_b64encode(json.dumps(part).encode()).rstrip(b"=").decode()
        for part in ({"alg": "RS256"}, payload)
    )
    token += ".sig"

    def post(url: str, fields: dict[str, str]) -> dict[str, Any]:
        sent.append({"url": url, **fields})
        return {"id_token": token}

    monkeypatch.setattr(google, "_post_form", post)
    return sent


def callback(client: APIClient, query: dict[str, list[str]], **over: str) -> Any:
    return client.get("/api/v1/auth/google/callback", {"code": "abc", "state": query["state"][0], **over})


def test_the_provider_list_says_whether_google_is_available(client: APIClient) -> None:
    assert client.get("/api/v1/auth/providers").json() == {"google": False}
    with override_settings(**GOOGLE):
        assert client.get("/api/v1/auth/providers").json() == {"google": True}


def test_without_configuration_the_start_goes_back_to_sign_in(client: APIClient) -> None:
    response = client.get("/api/v1/auth/google/start")
    assert response.status_code == 302 and response["Location"] == "/sign-in?error=google"


@override_settings(**GOOGLE)
def test_the_request_to_google_carries_state_nonce_and_pkce(client: APIClient) -> None:
    query, location = start(client)
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert query["client_id"] == [CLIENT_ID] and query["response_type"] == ["code"]
    assert query["code_challenge_method"] == ["S256"] and len(query["state"][0]) > 30
    assert query["redirect_uri"][0].endswith("/api/v1/auth/google/callback")
    assert "openid" in query["scope"][0]


@override_settings(**GOOGLE)
def test_a_new_person_is_created_signed_in_and_sent_where_they_were_going(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    query, _ = start(client, "/saved")
    sent = fake_google(monkeypatch, query)
    response = callback(client, query)
    assert response.status_code == 302 and response["Location"] == "/saved"
    user = User.objects.get(email="person@example.org")
    assert (
        user.status == AccountStatus.ACTIVE
        and user.email_verified_at
        and user.google_subject == "google-sub-1"
    )
    assert not user.has_usable_password() and user.terms_accepted_at
    assert client.get("/api/v1/me").json()["email"] == "person@example.org"
    assert sent[0]["code_verifier"] and sent[0]["client_secret"] == GOOGLE["UPNEXT_GOOGLE_CLIENT_SECRET"]
    assert AuditEvent.objects.filter(action="account.register_google", object_id=user.pk).exists()


@override_settings(**GOOGLE)
def test_the_next_address_must_be_a_path_on_this_site(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    for hostile in ("https://evil.example/", "//evil.example", "/\\evil", "javascript:alert(1)"):
        fresh = APIClient(enforce_csrf_checks=True)
        query, _ = start(fresh, hostile)
        fake_google(
            monkeypatch, query, sub=f"s-{abs(hash(hostile))}", email=f"{abs(hash(hostile))}@example.org"
        )
        assert callback(fresh, query)["Location"] == "/"


@override_settings(**GOOGLE)
@pytest.mark.parametrize(
    ("claims", "why"),
    [
        ({"iss": "https://evil.example"}, "issuer"),
        ({"aud": "someone-else"}, "audience"),
        ({"exp": 1}, "expired"),
        ({"nonce": "wrong"}, "nonce"),
        ({"email_verified": False}, "unverified e-mail"),
    ],
)
def test_an_id_token_that_fails_any_check_signs_nobody_in(
    client: APIClient, monkeypatch: pytest.MonkeyPatch, claims: dict[str, Any], why: str
) -> None:
    query, _ = start(client)
    fake_google(monkeypatch, query, **claims)
    response = callback(client, query)
    assert response["Location"] == "/sign-in?error=google", why
    assert not User.objects.filter(email="person@example.org").exists()
    assert client.get("/api/v1/me").status_code == 401


@override_settings(**GOOGLE)
def test_a_wrong_state_or_a_second_use_of_the_same_state_is_refused(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    query, _ = start(client)
    fake_google(monkeypatch, query)
    assert callback(client, query, state="forged")["Location"] == "/sign-in?error=google"
    assert callback(client, query)["Location"] == "/sign-in?error=google"  # the pending sign-in was consumed
    assert not User.objects.filter(email="person@example.org").exists()


@override_settings(**GOOGLE)
def test_staff_accounts_never_sign_in_with_google(
    client: APIClient, make_user: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_user(email="person@example.org", roles=("editor",))
    query, _ = start(client)
    fake_google(monkeypatch, query)
    assert callback(client, query)["Location"] == "/sign-in?error=google"
    assert client.get("/api/v1/me").status_code == 401
    assert User.objects.get(email="person@example.org").google_subject is None


@override_settings(**GOOGLE)
def test_an_existing_password_account_is_linked_through_the_verified_address(
    client: APIClient, make_user: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    existing = make_user(email="person@example.org")
    query, _ = start(client)
    fake_google(monkeypatch, query)
    assert callback(client, query)["Location"] == "/"
    existing.refresh_from_db()
    assert existing.google_subject == "google-sub-1" and existing.has_usable_password()
    assert AuditEvent.objects.filter(action="account.google_linked", object_id=existing.pk).exists()


@override_settings(**GOOGLE)
def test_linking_an_unconfirmed_account_removes_the_password_set_by_whoever_registered_it(
    client: APIClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    post_json(client, "/api/v1/auth/register", register_body(email="person@example.org"))
    squatter = User.objects.get(email="person@example.org")
    assert squatter.status == AccountStatus.PENDING_VERIFICATION and squatter.has_usable_password()
    owner = APIClient(enforce_csrf_checks=True)
    query, _ = start(owner)
    fake_google(monkeypatch, query)
    assert callback(owner, query)["Location"] == "/"
    squatter.refresh_from_db()
    assert squatter.status == AccountStatus.ACTIVE and not squatter.has_usable_password()
    # the squatter's password no longer works
    attacker = APIClient(enforce_csrf_checks=True)
    assert (
        post_json(
            attacker, "/api/v1/auth/login", {"email": "person@example.org", "password": PASSWORD}
        ).status_code
        == 401
    )


@override_settings(**GOOGLE)
def test_a_returning_google_person_is_found_by_subject_even_after_changing_their_google_address(
    client: APIClient, make_user: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = make_user(email="original@example.org")
    user.google_subject = "google-sub-1"
    user.save()
    query, _ = start(client)
    fake_google(monkeypatch, query, email="changed@example.org")
    assert callback(client, query)["Location"] == "/"
    assert client.get("/api/v1/me").json()["email"] == "original@example.org"
    assert not User.objects.filter(email="changed@example.org").exists()


@override_settings(**GOOGLE)
def test_unavailable_accounts_are_refused(
    client: APIClient, make_user: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_user(email="person@example.org", status=AccountStatus.SUSPENDED)
    query, _ = start(client)
    fake_google(monkeypatch, query)
    assert callback(client, query)["Location"] == "/sign-in?error=google"
    assert client.get("/api/v1/me").status_code == 401


@override_settings(**GOOGLE)
def test_deleting_an_account_removes_the_phone_number_and_the_google_link(make_user: Any) -> None:
    from datetime import timedelta

    from django.utils import timezone

    from accounts import deletion

    user = make_user(email="gone@example.org")
    user.phone_number, user.google_subject = "+263781234567", "sub-gone"
    user.deletion_requested_at = timezone.now() - timedelta(days=60)
    user.save()
    assert deletion.execute(user.pk, timezone.now())
    user.refresh_from_db()
    assert user.phone_number is None and user.google_subject is None and user.deleted_at
    assert not StaffRoleAssignment.objects.filter(user=user).exists()


def test_the_csrf_token_endpoint_still_works_for_the_forms(client: APIClient) -> None:
    assert csrf(client)
