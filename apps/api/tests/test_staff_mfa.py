"""Staff two-step verification (provisional default P3-07 for OQ-16)."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client

from accounts import mfa
from accounts.models import StaffMfaDevice, StaffRecoveryCode, User, UserSession
from audit.models import AuditEvent

from .conftest import PASSWORD, post_json

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def mfa_required(settings: Any) -> None:
    settings.UPNEXT_STAFF_MFA_REQUIRED = True
    cache.clear()


def staff_client(user: User) -> Client:
    client = Client()
    client.force_login(user)
    return client


def current_code(user: User) -> str:
    device = StaffMfaDevice.objects.get(user=user)
    return mfa.code_at(mfa.secret_for(device), mfa.current_step())


def enrol(client: Client, user: User) -> list[str]:
    client.get("/staff/mfa/")  # creates the pending device
    response = client.post("/staff/mfa/", {"code": current_code(user), "next": "/staff/"})
    assert response.status_code == 200, response.content.decode()[:300]
    return re.findall(r"<code>([0-9a-f]{6}-[0-9a-f]{6})</code>", response.content.decode())


def test_rfc_6238_vectors() -> None:
    secret = b"12345678901234567890"
    assert mfa.code_at(secret, 59 // 30) == "287082"
    assert mfa.code_at(secret, 1111111109 // 30) == "081804"
    assert mfa.code_at(secret, 1234567890 // 30) == "005924"


def test_staff_must_pass_the_second_step_before_any_staff_page(make_user: Callable[..., User]) -> None:
    client = staff_client(make_user(roles=("editor",)))
    for path in ("/staff/", "/staff/opportunities/opportunity/"):
        response = client.get(path)
        assert response.status_code == 302 and response["Location"].startswith("/staff/mfa/"), path
    assert client.get("/staff/mfa/").status_code == 200


def test_people_without_a_staff_role_are_not_sent_to_the_staff_gate(make_user: Callable[..., User]) -> None:
    client = staff_client(make_user())
    response = client.get("/staff/")
    assert response.status_code == 302 and "/staff/login/" in response["Location"]


def test_first_sign_in_enrols_shows_recovery_codes_once_then_opens_the_site(
    make_user: Callable[..., User],
) -> None:
    user = make_user(roles=("editor",))
    client = staff_client(user)
    page = client.get("/staff/mfa/").content.decode()
    assert "Set up two-step verification" in page and 'id="mfa-secret"' in page
    wrong = client.post("/staff/mfa/", {"code": "000000", "next": "/staff/"})
    assert "did not match" in wrong.content.decode() and client.get("/staff/").status_code == 302
    codes = enrol(client, user)
    assert len(codes) == mfa.RECOVERY_CODES and len(set(codes)) == mfa.RECOVERY_CODES
    assert client.get("/staff/").status_code == 200
    assert mfa.is_enrolled(user)
    again = client.get("/staff/mfa/")  # already verified: straight back to the site
    assert again.status_code == 302 and again["Location"] == "/staff/"
    assert not any(c in client.get("/staff/").content.decode() for c in codes)
    actions = set(AuditEvent.objects.filter(object_id=user.pk).values_list("action", flat=True))
    assert "staff.mfa_enrolled" in actions and "staff.mfa_failed" in actions


def test_each_later_sign_in_needs_a_fresh_code_and_a_used_code_cannot_be_replayed(
    make_user: Callable[..., User],
) -> None:
    user = make_user(roles=("editor",))
    enrol(staff_client(user), user)
    second = staff_client(user)  # a new sign-in
    assert second.get("/staff/").status_code == 302
    device = StaffMfaDevice.objects.get(user=user)
    assert "Enter your verification code" in second.get("/staff/mfa/").content.decode()
    replay = second.post("/staff/mfa/", {"code": mfa.code_at(mfa.secret_for(device), device.last_used_step)})
    assert replay.status_code == 200 and "not valid" in replay.content.decode()
    nxt = mfa.code_at(mfa.secret_for(device), mfa.current_step() + 1)
    ok = second.post("/staff/mfa/", {"code": nxt, "next": "/staff/opportunities/opportunity/"})
    assert ok.status_code == 302 and ok["Location"] == "/staff/opportunities/opportunity/"
    assert second.get("/staff/").status_code == 200


def test_recovery_codes_work_once(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("editor",))
    codes = enrol(staff_client(user), user)
    first = staff_client(user)
    assert first.post("/staff/mfa/", {"code": codes[0].upper()}).status_code == 302
    second = staff_client(user)
    assert "not valid" in second.post("/staff/mfa/", {"code": codes[0]}).content.decode()
    assert second.post("/staff/mfa/", {"code": codes[1]}).status_code == 302
    assert StaffRecoveryCode.objects.filter(used_at__isnull=False).count() == 2


def test_wrong_codes_are_limited_and_audited(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("editor",))
    enrol(staff_client(user), user)
    client = staff_client(user)
    for _ in range(mfa.MAX_FAILURES):
        assert "not valid" in client.post("/staff/mfa/", {"code": "123456"}).content.decode()
    locked = client.post("/staff/mfa/", {"code": current_code(user)})
    assert "Too many incorrect codes" in locked.content.decode() and client.get("/staff/").status_code == 302
    assert AuditEvent.objects.filter(action="staff.mfa_failed", object_id=user.pk).count() == mfa.MAX_FAILURES


def test_the_secret_is_derived_not_stored_and_a_key_change_resets_devices(
    make_user: Callable[..., User], settings: Any
) -> None:
    user = make_user(roles=("editor",))
    enrol(staff_client(user), user)
    device = StaffMfaDevice.objects.get(user=user)
    secret = mfa.secret_text(device).replace(" ", "")
    stored = str([getattr(device, f.name) for f in device._meta.fields]) + str(
        list(StaffRecoveryCode.objects.values())
    )
    assert secret not in stored
    before = mfa.code_at(mfa.secret_for(device), mfa.current_step())
    settings.UPNEXT_TOKEN_KEY = "another-server-key-" * 3
    assert mfa.code_at(mfa.secret_for(device), mfa.current_step()) != before


def test_a_password_only_session_from_the_api_does_not_open_the_staff_site(
    make_user: Callable[..., User],
) -> None:
    user = make_user(roles=("administrator",))
    from rest_framework.test import APIClient

    api = APIClient(enforce_csrf_checks=True)
    assert (
        post_json(api, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}).status_code == 200
    )
    response = api.get("/staff/")
    assert response.status_code == 302 and response["Location"].startswith("/staff/mfa/")


def test_next_is_only_followed_inside_the_staff_site(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("editor",))
    enrol(staff_client(user), user)
    client = staff_client(user)
    device = StaffMfaDevice.objects.get(user=user)
    for target in ("https://evil.example/", "//evil.example/", "/api/v1/me", "javascript:alert(1)"):
        cache.clear()
        StaffMfaDevice.objects.filter(pk=device.pk).update(last_used_step=0)
        fresh = staff_client(user)
        response = fresh.post("/staff/mfa/", {"code": current_code(user), "next": target})
        assert response["Location"] == "/staff/", target
    assert client is not None


def test_verifying_rotates_the_session_key_and_keeps_the_session_record(
    make_user: Callable[..., User],
) -> None:
    user = make_user(roles=("editor",))
    client = staff_client(user)
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
    editor_client = staff_client(editor)
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
    assert editor_client.get("/staff/").status_code == 302  # session ended
    event = AuditEvent.objects.get(action="staff.mfa_reset")
    assert event.actor_ref == other_admin.pk and event.severity == "privileged"
    with pytest.raises(CommandError, match="no two-step"):
        call_command("reset_staff_mfa", email=editor.email, reason="lost phone, verified in person")
    enrol(staff_client(editor), editor)  # re-enrols
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
    assert staff_client(make_user(roles=("editor",))).get("/staff/").status_code == 200
