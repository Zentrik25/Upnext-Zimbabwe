"""Optional two-step verification for ordinary accounts: set-up, the sign-in challenge, recovery and turning it off."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from accounts import login_challenge, mfa
from accounts.models import StaffMfaDevice, User, UserSession
from audit.models import AuditEvent

from .conftest import PASSWORD, csrf

pytestmark = pytest.mark.django_db

LOGIN, LOGIN_STEP, ME = "/api/v1/auth/login", "/api/v1/auth/login/two-step", "/api/v1/me"
STATE = f"{ME}/two-step"
SETUP, CONFIRM, DISABLE, CODES = (
    f"{STATE}/{leaf}" for leaf in ("setup", "confirm", "disable", "recovery-codes")
)


@pytest.fixture(autouse=True)
def _clean() -> None:
    cache.clear()


def send(client: APIClient, method: str, url: str, data: Any = None) -> Any:
    kwargs: dict[str, Any] = {"HTTP_X_CSRFTOKEN": csrf(client)}
    if data is not None:
        kwargs["format"] = "json"
        return getattr(client, method)(url, data, **kwargs)
    return getattr(client, method)(url, **kwargs)


def sign_in(user: User, **extra: Any) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    response = send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD, **extra})
    assert response.status_code == 200, response.content
    return client


def code_now(user: User) -> str:
    return mfa.code_at(mfa.secret_for(StaffMfaDevice.objects.get(user=user)), mfa.current_step())


def next_code(user: User) -> str:
    """A different valid code from the one just used (each time step is accepted once)."""
    device = StaffMfaDevice.objects.get(user=user)
    device.last_used_step = 0
    device.save(update_fields=["last_used_step"])
    return code_now(user)


def turn_on(user: User) -> list[str]:
    client = sign_in(user)
    assert send(client, "post", SETUP, {"password": PASSWORD}).status_code == 200
    response = send(client, "post", CONFIRM, {"code": code_now(user)})
    assert response.status_code == 200, response.content
    codes: list[str] = response.json()["recovery_codes"]
    return codes


# --- set-up ----------------------------------------------------------------------------------------------
def test_state_is_off_by_default(make_user: Callable[..., User]) -> None:
    client = sign_in(make_user())
    assert client.get(STATE).json() == {"enabled": False, "recovery_codes_left": 0, "staff": False}


def test_setup_needs_the_password_and_a_signed_in_user(make_user: Callable[..., User]) -> None:
    anonymous = APIClient(enforce_csrf_checks=True)
    assert send(anonymous, "post", SETUP, {"password": PASSWORD}).status_code in (401, 403)
    client = sign_in(make_user())
    refused = send(client, "post", SETUP, {"password": "wrong password here"})
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "reauth_required"
    assert not StaffMfaDevice.objects.exists()
    ok = send(client, "post", SETUP, {"password": PASSWORD})
    assert ok.status_code == 200
    body = ok.json()
    assert body["uri"].startswith("otpauth://totp/") and body["secret"]


def test_wrong_code_does_not_turn_it_on_and_right_code_does(make_user: Callable[..., User]) -> None:
    user = make_user()
    client = sign_in(user)
    send(client, "post", SETUP, {"password": PASSWORD})
    bad = send(client, "post", CONFIRM, {"code": "000000"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_code"
    assert client.get(STATE).json()["enabled"] is False
    good = send(client, "post", CONFIRM, {"code": code_now(user)})
    assert good.status_code == 200 and len(good.json()["recovery_codes"]) == mfa.RECOVERY_CODES
    assert client.get(STATE).json() == {
        "enabled": True,
        "recovery_codes_left": mfa.RECOVERY_CODES,
        "staff": False,
    }
    actions = set(AuditEvent.objects.filter(object_id=user.pk).values_list("action", flat=True))
    assert {"auth.mfa_enrolled", "auth.mfa_failed"} <= actions
    assert not any(a.startswith("staff.") for a in actions)


def test_turning_it_on_signs_out_other_browsers(make_user: Callable[..., User]) -> None:
    user = make_user()
    other, mine = sign_in(user), sign_in(user)
    send(mine, "post", SETUP, {"password": PASSWORD})
    send(mine, "post", CONFIRM, {"code": code_now(user)})
    assert other.get(ME).status_code in (401, 403)
    assert mine.get(ME).status_code == 200
    assert UserSession.objects.filter(user=user, revoked_at__isnull=True).count() == 1


def test_setup_and_confirm_are_refused_when_already_on(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert send(client, "post", SETUP, {"password": PASSWORD}).status_code == 409
    assert send(client, "post", CONFIRM, {"code": "123456"}).status_code == 409


def test_staff_use_the_workspace_flow(make_user: Callable[..., User]) -> None:
    client = sign_in(make_user(roles=("editor",)))
    assert client.get(STATE).json()["staff"] is True
    for url, body in ((SETUP, {"password": PASSWORD}), (CONFIRM, {"code": "123456"})):
        response = send(client, "post", url, body)
        assert response.status_code == 409 and response.json()["error"]["code"] == "staff_account"
    assert send(client, "post", DISABLE, {"password": PASSWORD, "code": "123456"}).status_code == 409


# --- the sign-in challenge -------------------------------------------------------------------------------
def test_without_it_sign_in_is_unchanged(make_user: Callable[..., User]) -> None:
    client = sign_in(make_user())
    assert client.get(ME).status_code == 200


def test_password_alone_does_not_sign_an_enrolled_account_in(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    response = send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    assert response.status_code == 200 and response.json() == {"two_step_required": True}
    assert client.get(ME).status_code in (401, 403)
    done = send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert done.status_code == 200 and done.json()["email"] == user.email
    assert client.get(ME).status_code == 200
    assert AuditEvent.objects.filter(action="auth.login", object_id=user.pk, changes__two_step=True).exists()


def test_a_wrong_code_is_refused_and_counted(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    for _ in range(mfa.MAX_FAILURES):
        bad = send(client, "post", LOGIN_STEP, {"code": "000000"})
        assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_code"
    blocked = send(client, "post", LOGIN_STEP, {"code": code_now(user)})
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "rate_limited"
    assert client.get(ME).status_code in (401, 403)


def test_a_recovery_code_works_once(make_user: Callable[..., User]) -> None:
    user = make_user()
    codes = turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    assert send(client, "post", LOGIN_STEP, {"code": codes[0]}).status_code == 200
    again = APIClient(enforce_csrf_checks=True)
    send(again, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    assert send(again, "post", LOGIN_STEP, {"code": codes[0]}).status_code == 400
    assert client.get(STATE).json()["recovery_codes_left"] == mfa.RECOVERY_CODES - 1


def test_the_code_step_needs_the_password_step_first(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    response = send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert response.status_code == 400 and response.json()["error"]["code"] == "two_step_expired"


def test_the_pending_sign_in_expires(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    session = client.session
    session[login_challenge.PENDING_KEY]["at"] = time.time() - login_challenge.LIFETIME - 1
    session.save()
    response = send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert response.status_code == 400 and response.json()["error"]["code"] == "two_step_expired"


def test_a_wrong_password_never_reaches_the_code_step(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    response = send(client, "post", LOGIN, {"email": user.email, "password": "not the password at all"})
    assert response.status_code == 401
    assert send(client, "post", LOGIN_STEP, {"code": next_code(user)}).status_code == 400


def test_remember_me_off_gives_a_browser_session_cookie(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD, "remember": False})
    done = send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert done.status_code == 200
    assert client.session.get_expire_at_browser_close() is True


def test_a_pending_sign_in_for_a_suspended_account_is_dropped(make_user: Callable[..., User]) -> None:
    user = make_user()
    turn_on(user)
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    User.objects.filter(pk=user.pk).update(status="suspended")
    response = send(client, "post", LOGIN_STEP, {"code": next_code(user)})
    assert response.status_code == 400 and response.json()["error"]["code"] == "two_step_expired"


# --- recovery codes and turning it off ---------------------------------------------------------------------
def signed_in_with_code(user: User) -> APIClient:
    client = APIClient(enforce_csrf_checks=True)
    send(client, "post", LOGIN, {"email": user.email, "password": PASSWORD})
    assert send(client, "post", LOGIN_STEP, {"code": next_code(user)}).status_code == 200
    return client


def test_new_recovery_codes_replace_the_old_ones(make_user: Callable[..., User]) -> None:
    user = make_user()
    old = turn_on(user)
    client = signed_in_with_code(user)
    refused = send(client, "post", CODES, {"password": "wrong password here", "code": next_code(user)})
    assert refused.status_code == 403
    bad = send(client, "post", CODES, {"password": PASSWORD, "code": "000000"})
    assert bad.status_code == 400
    fresh = send(client, "post", CODES, {"password": PASSWORD, "code": next_code(user)})
    assert fresh.status_code == 200
    new = fresh.json()["recovery_codes"]
    assert len(new) == mfa.RECOVERY_CODES and not set(new) & set(old)
    assert mfa.verify(user, old[0]) is False and mfa.verify(user, new[0]) is True


def test_turning_it_off_needs_password_and_code_and_ends_other_sessions(
    make_user: Callable[..., User],
) -> None:
    user = make_user()
    turn_on(user)
    mine, other = signed_in_with_code(user), signed_in_with_code(user)
    assert (
        send(mine, "post", DISABLE, {"password": "wrong password here", "code": next_code(user)}).status_code
        == 403
    )
    assert send(mine, "post", DISABLE, {"password": PASSWORD, "code": "000000"}).status_code == 400
    assert mine.get(STATE).json()["enabled"] is True
    done = send(mine, "post", DISABLE, {"password": PASSWORD, "code": next_code(user)})
    assert done.status_code == 204
    assert mine.get(STATE).json()["enabled"] is False
    assert other.get(ME).status_code in (401, 403)
    assert AuditEvent.objects.filter(action="auth.mfa_disabled", object_id=user.pk).exists()
    fresh = APIClient(enforce_csrf_checks=True)
    assert (
        send(fresh, "post", LOGIN, {"email": user.email, "password": PASSWORD}).json().get("email")
        == user.email
    )


def test_disable_and_codes_are_refused_when_it_is_off(make_user: Callable[..., User]) -> None:
    client = sign_in(make_user())
    for url in (DISABLE, CODES):
        response = send(client, "post", url, {"password": PASSWORD, "code": "123456"})
        assert response.status_code == 409 and response.json()["error"]["code"] == "not_enabled"


def test_unknown_fields_are_rejected(make_user: Callable[..., User]) -> None:
    client = sign_in(make_user())
    assert send(client, "post", SETUP, {"password": PASSWORD, "extra": 1}).status_code == 400


def test_break_glass_reset_frees_a_locked_out_person(make_user: Callable[..., User]) -> None:
    from django.core.management import call_command

    user = make_user()
    turn_on(user)
    call_command("reset_staff_mfa", email=user.email, reason="lost phone and recovery codes")
    assert not StaffMfaDevice.objects.filter(user=user).exists()
    assert AuditEvent.objects.filter(action="auth.mfa_reset", object_id=user.pk).exists()
    assert sign_in(user).get(ME).status_code == 200
