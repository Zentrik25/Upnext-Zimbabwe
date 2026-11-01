"""Trusted devices (D-59): "Trust this device for 30 days" without weakening two-step verification.

Real requests with cookies (CSRF on): recognition on the same browser, a new browser, expiry, revocation, a copied
cookie in another kind of browser, the 24-hour staff limit, and everything that must revoke every device.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts import mfa, services, trusted_devices
from accounts.models import StaffMfaDevice, TrustedDevice, User
from audit.models import AuditEvent
from core.staff_mfa import PROVED_AT, SESSION_FLAG, is_fresh

from .conftest import PASSWORD
from .test_staff_api import S, send, signed_in
from .test_staff_mfa import TWO_STEP, current_code, enrol
from .test_user_mfa import LOGIN, LOGIN_STEP, ME, next_code, turn_on

pytestmark = pytest.mark.django_db

COOKIE = "upnext_td"
CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"
TEAM = f"{S}/team"


@pytest.fixture(autouse=True)
def _clean(settings: Any) -> None:
    settings.UPNEXT_STAFF_MFA_REQUIRED = True
    cache.clear()


def browser(agent: str = CHROME) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    client.defaults["HTTP_USER_AGENT"] = agent
    return client


def password_login(client: APIClient, user: User, password: str = PASSWORD) -> Any:
    return send(client, "post", LOGIN, {"email": user.email, "password": password})


def seeker_with_mfa(make_user: Callable[..., User]) -> User:
    user = make_user(email="mfa.seeker@example.org")
    turn_on(user)
    return user


def trust_via_login(user: User, client: APIClient | None = None) -> APIClient:
    """Password, then a code with the box ticked: the browser now holds the trusted-device cookie."""
    client = client or browser()
    assert password_login(client, user).json() == {"two_step_required": True}
    done = send(client, "post", LOGIN_STEP, {"code": next_code(user), "trust_device": True})
    assert done.status_code == 200, done.content
    assert COOKIE in done.cookies
    return client


def logout(client: APIClient) -> None:
    assert send(client, "post", "/api/v1/auth/logout").status_code == 204


def needs_code(client: APIClient, user: User) -> bool:
    response = password_login(client, user)
    assert response.status_code == 200, response.content
    return bool(response.json().get("two_step_required"))


# --- ordinary accounts ----------------------------------------------------------------------------------
def test_without_ticking_the_box_every_sign_in_still_asks_for_a_code(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    client = browser()
    assert needs_code(client, user)
    done = send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert done.status_code == 200 and COOKIE not in done.cookies
    assert not TrustedDevice.objects.filter(user=user).exists()
    logout(client)
    assert needs_code(client, user)


def test_a_trusted_browser_skips_the_code_but_never_the_password(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    client = trust_via_login(user)
    logout(client)
    assert not needs_code(client, user)  # signed in straight away
    assert client.get(f"{ME}").status_code == 200
    wrong = password_login(client, user, "not the password at all 1")
    assert wrong.status_code == 401  # the cookie is no substitute for the password
    event = AuditEvent.objects.filter(action="auth.login", object_id=user.pk).latest("id")
    assert event.changes and event.changes["trusted_device"] == str(TrustedDevice.objects.get(user=user).pk)


def test_the_cookie_is_httponly_lax_and_only_a_hash_is_stored(
    make_user: Callable[..., User], settings: Any
) -> None:
    user = seeker_with_mfa(make_user)
    client = browser()
    password_login(client, user)
    done = send(client, "post", LOGIN_STEP, {"code": next_code(user), "trust_device": True})
    morsel = done.cookies[COOKIE]
    assert morsel["httponly"] is True and morsel["samesite"] == "Lax" and morsel["path"] == "/"
    assert int(morsel["max-age"]) in range(30 * 86400 - 60, 30 * 86400 + 1)
    device = TrustedDevice.objects.get(user=user)
    assert morsel.value not in (device.token_hash, str(device.pk)) and len(device.token_hash) == 64
    assert morsel.value not in str(device.__dict__)  # the cookie value itself is nowhere in the row
    assert abs(device.expires_at - device.created_at - timedelta(days=30)) < timedelta(seconds=2)
    settings.SESSION_COOKIE_SECURE = True
    other = browser()
    password_login(other, user)
    secure = send(other, "post", LOGIN_STEP, {"code": next_code(user), "trust_device": True})
    assert secure.cookies[COOKIE]["secure"] is True  # Secure whenever the site is served over https


def test_a_new_or_untrusted_browser_is_challenged(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    trust_via_login(user)
    assert needs_code(browser(), user)  # another browser, no cookie
    forged = browser()
    forged.cookies[COOKIE] = "x" * 43
    assert needs_code(forged, user)  # a made-up cookie is just ignored


def test_a_cookie_of_another_person_does_nothing(make_user: Callable[..., User]) -> None:
    first, second = seeker_with_mfa(make_user), make_user(email="second.mfa@example.org")
    turn_on(second)
    client = trust_via_login(first)
    cookie = client.cookies[COOKIE].value
    thief = browser()
    thief.cookies[COOKIE] = cookie
    assert needs_code(thief, second)


def test_the_device_expires_after_thirty_days(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    client = trust_via_login(user)
    logout(client)
    TrustedDevice.objects.filter(user=user).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert needs_code(client, user)
    assert trusted_devices.live_devices(user) == []


def test_a_code_proven_again_with_the_box_ticked_replaces_the_device(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    client = trust_via_login(user)
    first = TrustedDevice.objects.get(user=user)
    logout(client)
    TrustedDevice.objects.filter(pk=first.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
    trust_via_login(user, client)
    live = trusted_devices.live_devices(user)
    assert len(live) == 1 and live[0].pk != first.pk
    assert live[0].expires_at > timezone.now() + timedelta(days=29)


def test_a_copied_cookie_in_a_different_browser_is_refused_and_the_device_is_revoked(
    make_user: Callable[..., User],
) -> None:
    user = seeker_with_mfa(make_user)
    client = trust_via_login(user, browser(CHROME))
    stolen = browser(FIREFOX)
    stolen.cookies[COOKIE] = client.cookies[COOKIE].value
    assert needs_code(stolen, user)
    device = TrustedDevice.objects.get(user=user)
    assert device.revoked_at is not None and device.revoked_reason == "agent_changed"
    logout(client)
    assert needs_code(client, user)  # the genuine browser must prove a code again too
    assert AuditEvent.objects.filter(action="auth.trusted_device_revoked", severity="security").exists()


def test_a_run_of_failed_attempts_makes_a_trusted_device_ask_again(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    client = trust_via_login(user)
    logout(client)
    for _ in range(3):
        assert password_login(browser(), user, "wrong password number 1").status_code == 401
    assert needs_code(client, user)
    assert TrustedDevice.objects.get(user=user).revoked_at is None  # doubted, not destroyed


@pytest.mark.parametrize("change", ["password", "disable", "recovery_codes", "reset"])
def test_changing_the_password_or_two_step_settings_revokes_every_device(
    make_user: Callable[..., User], change: str
) -> None:
    user = seeker_with_mfa(make_user)
    trust_via_login(user)
    trust_via_login(user)
    assert len(trusted_devices.live_devices(user)) == 2
    if change == "password":
        assert services.change_password(
            user, current_password=PASSWORD, new_password="a brand new long passphrase 55", session_key=None
        )
    elif change == "disable":
        mfa.disable(user)
    elif change == "recovery_codes":
        assert mfa.regenerate_recovery_codes(user)
    else:
        assert mfa.reset(user, actor=None, reason="lost the phone, verified by phone")
    assert trusted_devices.live_devices(user) == []
    reasons = {"password_changed", "mfa_changed", "mfa_reset"}
    assert TrustedDevice.objects.filter(user=user, revoked_reason__in=reasons).count() == 2


def test_a_password_reset_by_link_revokes_devices_too(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    trust_via_login(user)
    from accounts import tokens
    from accounts.models import TokenPurpose

    token = tokens.render(tokens.issue(user, TokenPurpose.PASSWORD_RESET))
    assert services.confirm_password_reset(token, "another long unguessable phrase 8")
    assert trusted_devices.live_devices(user) == []


def test_each_person_keeps_at_most_ten_trusted_devices(make_user: Callable[..., User], settings: Any) -> None:
    settings.UPNEXT_TRUSTED_DEVICE_LIMIT = 3
    user = seeker_with_mfa(make_user)
    for _ in range(5):
        trust_via_login(user)
    assert len(trusted_devices.live_devices(user)) == 3


# --- Account → Security ---------------------------------------------------------------------------------
def test_the_person_sees_and_forgets_their_trusted_devices(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    mine = trust_via_login(user, browser(CHROME))
    other = trust_via_login(user, browser(FIREFOX))
    listing = mine.get(f"{ME}/trusted-devices").json()
    assert {d["label"] for d in listing["data"]} == {"Chrome on Windows", "Firefox on Linux"}
    assert [d["current"] for d in listing["data"] if d["label"].startswith("Chrome")] == [True]
    assert [d["current"] for d in listing["data"] if d["label"].startswith("Firefox")] == [False]
    assert listing["code_every_hours"] is None and "token" not in str(listing).lower()
    theirs = next(d["id"] for d in listing["data"] if d["label"].startswith("Firefox"))
    assert send(mine, "delete", f"{ME}/trusted-devices/{theirs}").status_code == 204
    logout(other)
    assert needs_code(other, user)
    here = next(d["id"] for d in mine.get(f"{ME}/trusted-devices").json()["data"])
    gone = send(mine, "delete", f"{ME}/trusted-devices/{here}")
    assert (
        gone.status_code == 204 and gone.cookies[COOKIE].value == ""
    )  # forgetting this one clears the cookie
    assert send(mine, "delete", f"{ME}/trusted-devices/{here}").status_code == 404
    assert mine.get(f"{ME}/trusted-devices").json()["data"] == []


def test_forget_all_and_nobody_reaches_someone_elses_devices(make_user: Callable[..., User]) -> None:
    user, stranger = seeker_with_mfa(make_user), make_user(email="stranger@example.org")
    turn_on(stranger)
    trust_via_login(user)
    other_client = trust_via_login(stranger)
    device = TrustedDevice.objects.get(user=user)
    assert send(other_client, "delete", f"{ME}/trusted-devices/{device.pk}").status_code == 404  # no IDOR
    assert TrustedDevice.objects.get(pk=device.pk).revoked_at is None
    assert APIClient().get(f"{ME}/trusted-devices").status_code in (401, 403)
    mine = browser()
    assert needs_code(mine, user)
    send(mine, "post", LOGIN_STEP, {"code": next_code(user)})
    assert send(mine, "delete", f"{ME}/trusted-devices").status_code == 204
    assert trusted_devices.live_devices(user) == []
    assert trusted_devices.live_devices(stranger) != []


def test_unsafe_device_requests_need_csrf(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    client = trust_via_login(user)
    device = TrustedDevice.objects.get(user=user)
    assert client.delete(f"{ME}/trusted-devices/{device.pk}").status_code == 403


def test_the_trust_box_is_a_strict_boolean(make_user: Callable[..., User]) -> None:
    user = seeker_with_mfa(make_user)
    client = browser()
    password_login(client, user)
    bad = send(client, "post", LOGIN_STEP, {"code": next_code(user), "trust_device": "yes-please", "x": 1})
    assert bad.status_code == 400 and not TrustedDevice.objects.filter(user=user).exists()


# --- staff: fresh code at least every 24 hours ----------------------------------------------------------
def enrolled_staff(people: dict[str, User], who: str = "editor") -> User:
    staff = people[who]
    enrol(signed_in(staff), staff)
    return staff


def verified_admin(people: dict[str, User]) -> APIClient:
    """An Administrator who has passed the second step (it is enforced in these tests)."""
    client = signed_in(people["admin"])
    enrol(client, people["admin"])
    return client


def staff_trust(user: User) -> APIClient:
    """Sign in, pass the staff second step with the box ticked."""
    client = browser()
    assert password_login(client, user).status_code == 200
    assert client.get(f"{S}/opportunities").status_code == 403  # a fresh sign-in still owes a code
    done = send(client, "post", TWO_STEP, {"code": next_code(user), "trust_device": True})
    assert done.status_code == 200 and COOKIE in done.cookies
    assert client.get(f"{S}/opportunities").status_code == 200
    return client


def staff_gets_in(client: APIClient, user: User) -> bool:
    assert password_login(client, user).status_code == 200
    return bool(client.get(f"{S}/opportunities").status_code == 200)


def test_a_trusted_staff_device_skips_the_second_step_within_24_hours(people: dict[str, User]) -> None:
    staff = enrolled_staff(people)
    client = staff_trust(staff)
    logout(client)
    assert staff_gets_in(client, staff)
    assert client.get(f"{S}/session").json()["two_step"]["verified"] is True
    assert not staff_gets_in(browser(), staff)  # another browser still owes one


def test_staff_must_prove_a_code_at_least_every_24_hours_even_on_a_trusted_device(
    people: dict[str, User],
) -> None:
    staff = enrolled_staff(people)
    client = staff_trust(staff)
    logout(client)
    device = TrustedDevice.objects.get(user=staff)
    proved = timezone.now() - timedelta(hours=23, minutes=59)
    TrustedDevice.objects.filter(pk=device.pk).update(last_mfa_at=proved)
    assert staff_gets_in(client, staff)
    assert TrustedDevice.objects.get(pk=device.pk).last_mfa_at == proved  # skipping never refreshes the proof
    logout(client)
    TrustedDevice.objects.filter(pk=device.pk).update(
        last_mfa_at=timezone.now() - timedelta(hours=24, minutes=1)
    )
    assert not staff_gets_in(client, staff)  # a code is due, although the device is still trusted
    assert TrustedDevice.objects.get(pk=device.pk).revoked_at is None
    # proving a code refreshes the proof (without needing the box again), so the next sign-in skips once more
    assert send(client, "post", TWO_STEP, {"code": next_code(staff)}).status_code == 200
    assert TrustedDevice.objects.get(pk=device.pk).last_mfa_at > timezone.now() - timedelta(minutes=1)
    logout(client)
    assert staff_gets_in(client, staff)


def test_a_live_staff_session_is_not_trusted_past_24_hours_either(people: dict[str, User]) -> None:
    staff = enrolled_staff(people)
    client = staff_trust(staff)
    session = client.session
    assert session[SESSION_FLAG] is True
    session[PROVED_AT] = time.time() - 24 * 3600 - 5
    session.save()
    denied = client.get(f"{S}/opportunities")
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "two_step_required"
    assert is_fresh({SESSION_FLAG: True, PROVED_AT: time.time()}) and not is_fresh({SESSION_FLAG: True})
    assert not is_fresh({PROVED_AT: time.time()})


def test_a_session_flag_from_before_this_change_is_not_enough(people: dict[str, User]) -> None:
    staff = enrolled_staff(people)
    client = staff_trust(staff)
    session = client.session
    del session[PROVED_AT]
    session.save()
    assert client.get(f"{S}/opportunities").status_code == 403


def test_logout_and_session_expiry_never_leave_the_second_step_behind(people: dict[str, User]) -> None:
    staff = enrolled_staff(people)
    plain = browser()
    assert password_login(plain, staff).status_code == 200
    assert send(plain, "post", TWO_STEP, {"code": next_code(staff)}).status_code == 200  # no box ticked
    assert plain.get(f"{S}/opportunities").status_code == 200
    logout(plain)
    assert plain.get(f"{S}/opportunities").status_code in (401, 403)
    assert not staff_gets_in(plain, staff)  # nothing remembered without the box
    # an expired session behaves like a sign-out; the trusted cookie then decides, within its 24 hours
    trusted = staff_trust(staff)
    session = trusted.session
    session["login_at"] = time.time() - 9 * 3600  # past the 8-hour staff limit
    session.save()
    assert trusted.get(f"{S}/session").status_code in (401, 403)
    assert staff_gets_in(trusted, staff)


def test_an_administrator_forgets_a_persons_trusted_devices(people: dict[str, User]) -> None:
    staff = enrolled_staff(people)
    client = staff_trust(staff)
    logout(client)
    admin = verified_admin(people)
    path = f"{TEAM}/{staff.pk}/actions/revoke-trusted-devices"
    assert send(admin, "post", path, {"reason": "short"}).status_code == 400
    assert (
        send(signed_in(people["editor2"]), "post", path, {"reason": "not allowed to do this"}).status_code
        == 403
    )
    done = send(admin, "post", path, {"reason": "Lost laptop reported by phone"})
    assert done.status_code == 200
    assert trusted_devices.live_devices(staff) == []
    assert not staff_gets_in(client, staff)
    event = AuditEvent.objects.get(action="staff.trusted_devices_revoked")
    assert event.actor_ref == people["admin"].pk and event.changes and event.changes["devices"] == 1
    assert "Forget trusted devices" in [a["label"] for a in admin.get(f"{TEAM}/{staff.pk}").json()["actions"]]


@pytest.mark.parametrize("action", ["suspend", "remove", "change-role"])
def test_suspension_removal_and_role_changes_revoke_devices(people: dict[str, User], action: str) -> None:
    staff = enrolled_staff(people, "editor2")
    staff_trust(staff)
    assert trusted_devices.live_devices(staff)
    admin = verified_admin(people)
    body: dict[str, Any] = {"reason": "A long enough reason"}
    if action == "remove":
        body["confirm"] = True
    if action == "change-role":
        body["role"] = "contributor"
    assert send(admin, "post", f"{TEAM}/{staff.pk}/actions/{action}", body).status_code == 200
    assert trusted_devices.live_devices(staff) == []


def test_staff_who_have_not_enrolled_get_nothing_from_a_cookie(people: dict[str, User]) -> None:
    staff = people["editor"]
    client = browser()
    client.cookies[COOKIE] = "y" * 43
    assert password_login(client, staff).status_code == 200
    assert client.get(f"{S}/opportunities").status_code == 403


def test_retention_removes_old_devices_and_keeps_live_ones(make_user: Callable[..., User]) -> None:
    from accounts import retention

    user = seeker_with_mfa(make_user)
    trust_via_login(user)
    trust_via_login(user)
    old = TrustedDevice.objects.filter(user=user).first()
    assert old is not None
    TrustedDevice.objects.filter(pk=old.pk).update(revoked_at=timezone.now() - timedelta(days=90))
    assert retention.run()["trusted_devices"] == 1
    assert TrustedDevice.objects.filter(user=user).count() == 1


def test_trust_is_offered_on_enrolment_too_and_the_secret_is_not_in_the_session(
    people: dict[str, User],
) -> None:
    staff = people["editor2"]
    client = browser()
    password_login(client, staff)
    assert client.get(TWO_STEP).json()["enrolling"] is True
    done = send(client, "post", TWO_STEP, {"code": current_code(staff), "trust_device": True})
    assert done.status_code == 200 and COOKIE in done.cookies
    assert StaffMfaDevice.objects.filter(user=staff, confirmed_at__isnull=False).exists()
    token = client.cookies[COOKIE].value
    assert token not in str(dict(client.session.items()))


def test_deleting_an_account_removes_its_trusted_devices(make_user: Callable[..., User]) -> None:
    from accounts import deletion

    user = seeker_with_mfa(make_user)
    trust_via_login(user)
    assert TrustedDevice.objects.filter(user=user).count() == 1
    assert deletion.execute(user.pk, now=timezone.now() + timedelta(days=60), restored=True)
    assert not TrustedDevice.objects.filter(user=user).exists()
