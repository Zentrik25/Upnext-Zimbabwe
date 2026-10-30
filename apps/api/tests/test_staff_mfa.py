"""Staff two-step verification through the staff API (provisional default P3-07 for OQ-16; D-46)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from accounts import mfa
from accounts.models import StaffMfaDevice, StaffRecoveryCode, User, UserSession
from audit.models import AuditEvent

from .conftest import PASSWORD
from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def mfa_required(settings: Any) -> None:
    settings.UPNEXT_STAFF_MFA_REQUIRED = True
    cache.clear()


TWO_STEP = f"{S}/two-step"


def current_code(user: User) -> str:
    device = StaffMfaDevice.objects.get(user=user)
    return mfa.code_at(mfa.secret_for(device), mfa.current_step())


def enrol(client: APIClient, user: User) -> list[str]:
    assert client.get(TWO_STEP).json()["enrolling"] is True  # creates the pending device
    response = send(client, "post", TWO_STEP, {"code": current_code(user)})
    assert response.status_code == 200, response.content
    codes: list[str] = response.json()["recovery_codes"]
    return codes


def test_rfc_6238_vectors() -> None:
    secret = b"12345678901234567890"
    assert mfa.code_at(secret, 59 // 30) == "287082"
    assert mfa.code_at(secret, 1111111109 // 30) == "081804"
    assert mfa.code_at(secret, 1234567890 // 30) == "005924"


def test_staff_must_pass_the_second_step_before_any_staff_endpoint(make_user: Callable[..., User]) -> None:
    client = signed_in(make_user(roles=("editor",)))
    for path in ("/dashboard", "/opportunities", "/records", "/catalog", "/activity"):
        response = client.get(f"{S}{path}")
        assert response.status_code == 403 and response.json()["error"]["code"] == "two_step_required", path
    session = client.get(f"{S}/session").json()
    assert session["two_step"]["verified"] is False and "attention" not in session
    assert client.get(TWO_STEP).status_code == 200


def test_people_without_a_staff_role_are_not_sent_to_the_staff_gate(make_user: Callable[..., User]) -> None:
    client = signed_in(make_user())
    assert client.get(f"{S}/session").status_code == 403
    assert client.get(TWO_STEP).status_code == 403


def test_first_sign_in_enrols_shows_recovery_codes_once_then_opens_the_api(
    make_user: Callable[..., User],
) -> None:
    user = make_user(roles=("editor",))
    client = signed_in(user)
    setup = client.get(TWO_STEP).json()
    assert setup["enrolling"] is True and setup["secret"] and setup["uri"].startswith("otpauth://")
    wrong = send(client, "post", TWO_STEP, {"code": "000000"})
    assert wrong.status_code == 400 and "did not match" in wrong.json()["error"]["message"]
    assert client.get(f"{S}/dashboard").status_code == 403
    codes = enrol(client, user)
    assert len(codes) == mfa.RECOVERY_CODES and len(set(codes)) == mfa.RECOVERY_CODES
    assert client.get(f"{S}/dashboard").status_code == 200
    assert mfa.is_enrolled(user)
    again = client.get(TWO_STEP).json()  # already verified: nothing secret is shown again
    assert again == {"enrolling": False, "verified": True}
    assert not any(c in client.get(f"{S}/dashboard").content.decode() for c in codes)
    actions = set(AuditEvent.objects.filter(object_id=user.pk).values_list("action", flat=True))
    assert "staff.mfa_enrolled" in actions and "staff.mfa_failed" in actions


def test_each_later_sign_in_needs_a_fresh_code_and_a_used_code_cannot_be_replayed(
    make_user: Callable[..., User],
) -> None:
    user = make_user(roles=("editor",))
    enrol(signed_in(user), user)
    second = signed_in(user)  # a new sign-in
    assert second.get(f"{S}/dashboard").status_code == 403
    device = StaffMfaDevice.objects.get(user=user)
    assert second.get(TWO_STEP).json()["enrolling"] is False
    replay = send(
        second, "post", TWO_STEP, {"code": mfa.code_at(mfa.secret_for(device), device.last_used_step)}
    )
    assert replay.status_code == 400 and "not valid" in replay.json()["error"]["message"]
    nxt = mfa.code_at(mfa.secret_for(device), mfa.current_step() + 1)
    assert send(second, "post", TWO_STEP, {"code": nxt}).status_code == 200
    assert second.get(f"{S}/dashboard").status_code == 200


def test_recovery_codes_work_once(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("editor",))
    codes = enrol(signed_in(user), user)
    assert send(signed_in(user), "post", TWO_STEP, {"code": codes[0].upper()}).status_code == 200
    second = signed_in(user)
    assert send(second, "post", TWO_STEP, {"code": codes[0]}).status_code == 400
    assert send(second, "post", TWO_STEP, {"code": codes[1]}).status_code == 200
    assert StaffRecoveryCode.objects.filter(used_at__isnull=False).count() == 2


def test_wrong_codes_are_limited_and_audited(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("editor",))
    enrol(signed_in(user), user)
    client = signed_in(user)
    for _ in range(mfa.MAX_FAILURES):
        assert send(client, "post", TWO_STEP, {"code": "123456"}).status_code == 400
    locked = send(client, "post", TWO_STEP, {"code": current_code(user)})
    assert locked.status_code == 429 and "Too many incorrect codes" in locked.json()["error"]["message"]
    assert client.get(f"{S}/dashboard").status_code == 403
    assert AuditEvent.objects.filter(action="staff.mfa_failed", object_id=user.pk).count() == mfa.MAX_FAILURES


def test_the_secret_is_derived_not_stored_and_a_key_change_resets_devices(
    make_user: Callable[..., User], settings: Any
) -> None:
    user = make_user(roles=("editor",))
    enrol(signed_in(user), user)
    device = StaffMfaDevice.objects.get(user=user)
    secret = mfa.secret_text(device).replace(" ", "")
    stored = str([getattr(device, f.name) for f in device._meta.fields]) + str(
        list(StaffRecoveryCode.objects.values())
    )
    assert secret not in stored
    before = mfa.code_at(mfa.secret_for(device), mfa.current_step())
    settings.UPNEXT_TOKEN_KEY = "another-server-key-" * 3
    assert mfa.code_at(mfa.secret_for(device), mfa.current_step()) != before


def test_a_password_only_session_does_not_open_the_staff_api(make_user: Callable[..., User]) -> None:
    api = signed_in(make_user(roles=("administrator",)))
    response = api.get(f"{S}/dashboard")
    assert response.status_code == 403 and response.json()["error"]["code"] == "two_step_required"


def test_verifying_rotates_the_session_key_and_keeps_the_session_record(
    make_user: Callable[..., User],
) -> None:
    user = make_user(roles=("editor",))
    client = signed_in(user)
    before = client.session.session_key
    enrol(client, user)
    after = client.session.session_key
    assert before != after
    assert UserSession.objects.filter(user=user, session_key=after, revoked_at__isnull=True).exists()
    assert not UserSession.objects.filter(session_key=before).exists()


def test_reset_command_is_audited_ends_sessions_and_forbids_self_reset(
    make_user: Callable[..., User],
) -> None:
    admin = make_user(roles=("administrator",))
    other_admin = make_user(roles=("administrator",))
    editor = make_user(roles=("editor",))
    editor_client = signed_in(editor)
    enrol(editor_client, editor)
    with pytest.raises(CommandError, match="own"):
        call_command("reset_staff_mfa", email=admin.email, reason="locked out of my device", by=admin.email)
    with pytest.raises(CommandError, match="Administrator"):
        call_command("reset_staff_mfa", email=editor.email, reason="locked out of my device", by=editor.email)
    with pytest.raises(CommandError, match="10 characters"):
        call_command("reset_staff_mfa", email=editor.email, reason="short", by=other_admin.email)
    call_command(
        "reset_staff_mfa", email=editor.email, reason="lost phone, verified in person", by=other_admin.email
    )
    assert not StaffMfaDevice.objects.filter(user=editor).exists()
    assert editor_client.get(f"{S}/dashboard").status_code in (401, 403)  # session ended
    event = AuditEvent.objects.get(action="staff.mfa_reset")
    assert event.actor_ref == other_admin.pk and event.severity == "privileged"
    with pytest.raises(CommandError, match="no two-step"):
        call_command("reset_staff_mfa", email=editor.email, reason="lost phone, verified in person")
    enrol(signed_in(editor), editor)  # re-enrols
    call_command("reset_staff_mfa", email=editor.email, reason="break-glass with server access")
    assert AuditEvent.objects.filter(action="staff.mfa_reset", actor_type="system").exists()


def test_demo_totp_tool_is_for_demo_accounts_on_demo_stacks_only(
    make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
) -> None:
    demo = make_user(email="editor@demo.upnext.example", roles=("editor",))
    StaffMfaDevice.objects.create(user=demo, nonce="n", confirmed_at=demo.created_at)
    monkeypatch.delenv("UPNEXT_DEMO_TOOLS", raising=False)
    with pytest.raises(CommandError, match="UPNEXT_DEMO_TOOLS"):
        call_command("demo_totp_code", email=demo.email)
    monkeypatch.setenv("UPNEXT_DEMO_TOOLS", "1")
    with pytest.raises(CommandError, match="demo accounts"):
        call_command("demo_totp_code", email="real@example.org")
    from io import StringIO

    out = StringIO()
    call_command("demo_totp_code", email=demo.email, stdout=out)
    assert mfa.verify(demo, out.getvalue().strip())


def test_the_gate_can_be_switched_off_only_by_configuration(
    make_user: Callable[..., User], settings: Any
) -> None:
    settings.UPNEXT_STAFF_MFA_REQUIRED = False
    assert signed_in(make_user(roles=("editor",))).get(f"{S}/dashboard").status_code == 200


def test_signing_in_again_requires_the_second_step_again(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("editor",))
    client = signed_in(user)
    enrol(client, user)
    assert client.get(f"{S}/dashboard").status_code == 200
    again = send(client, "post", "/api/v1/auth/login", {"email": user.email, "password": PASSWORD})
    assert again.status_code == 200, again.content
    assert client.get(f"{S}/dashboard").status_code == 403  # the flag from the earlier sign-in is gone
