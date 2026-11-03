"""Staff management (D-58): the Administrator's lifecycle over `/api/v1/staff/team/`.

Covers the whole path with real requests (CSRF on, session cookies): invitation and acceptance, duplicate e-mail,
role changes, suspension, session revocation, last-Administrator protection, removal that keeps history, who may
call what, and that nothing secret reaches the audit log, the e-mail or an answer.
"""

from __future__ import annotations

import re
import uuid
from datetime import timedelta
from typing import Any

import pytest
from django.contrib.sessions.models import Session
from django.utils import timezone
from rest_framework.test import APIClient

from access.registry import Role
from accounts import services, staff_admin, tokens
from accounts.models import AccountStatus, AuthToken, StaffRoleAssignment, TokenPurpose, User, UserSession
from audit.models import AuditEvent
from notifications import services as outbox
from notifications.models import EmailKind, EmailOutbox
from opportunities.models import Opportunity, OpportunityVersion, PublishingEvent
from tests.factories import World, published

from .conftest import PASSWORD, csrf, post_json
from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db

TEAM = f"{S}/team"
STRONG = "a long unguessable passphrase 7731"


def invite(
    client: APIClient, email: str = "new.staff@example.org", role: str = "editor", name: str = "New Person"
) -> Any:
    return send(client, "post", TEAM, {"email": email, "display_name": name, "role": role})


def invitation_link(user: User) -> str:
    row = EmailOutbox.objects.filter(user=user, kind=EmailKind.STAFF_INVITATION).latest("created_at")
    message = outbox.build_message(row)
    assert message is not None
    found = re.search(r"https?://\S+/accept-invitation\?token=[\w.\-]+", message.body)
    assert found, message.body
    return found.group(0)


def token_of(user: User) -> str:
    return invitation_link(user).split("token=")[1]


def accept(token: str, password: str = STRONG) -> Any:
    client = APIClient(enforce_csrf_checks=True)
    return post_json(client, "/api/v1/auth/staff-invitation/accept", {"token": token, "password": password})


def invited(admin: User, **kw: Any) -> User:
    client = signed_in(admin)
    response = invite(client, **kw)
    assert response.status_code == 201, response.content
    return User.objects.get(pk=response.json()["id"])


def active_staff(make_user: Any, role: str, email: str) -> User:
    user: User = make_user(email=email, roles=(role,))
    return user


# --- invitation ---------------------------------------------------------------------------------------------
def test_administrator_invites_a_staff_member_who_cannot_act_until_accepting(
    people: dict[str, User],
) -> None:
    user = invited(people["admin"], email="Fadzai@Example.org", name="Fadzai Moyo", role="editor")
    user.refresh_from_db()
    assert user.status == AccountStatus.PENDING_VERIFICATION and not user.has_usable_password()
    assert user.email.lower() == "fadzai@example.org" and user.email_verified_at is None
    assert (
        staff_admin.active_roles_of(user) == ["editor"] and not user.is_staff
    )  # a role, but no authority yet
    mail = EmailOutbox.objects.get(user=user, kind=EmailKind.STAFF_INVITATION)
    message = outbox.build_message(mail)
    assert message is not None and "accept-invitation?token=" in message.body
    assert "3 days" in message.body and "once" in message.body
    assert not re.search(r"temporary password|your password is", message.body, re.IGNORECASE)
    assert "password" not in str(mail.payload).lower()
    event = AuditEvent.objects.get(action="staff.invited")
    assert event.object_id == user.pk and event.actor_ref == people["admin"].pk
    assert event.changes == {"role": "editor"} and "example.org" not in str(event.changes)
    # the invited person cannot sign in before accepting (no usable password, account pending)
    attempt = post_json(
        APIClient(enforce_csrf_checks=True), "/api/v1/auth/login", {"email": user.email, "password": STRONG}
    )
    assert attempt.status_code in (400, 401, 403)


def test_invitation_acceptance_is_single_use_and_activates_the_account(
    people: dict[str, User],
) -> None:
    user = invited(people["admin"])
    token = token_of(user)
    assert accept(token, "short").status_code == 400  # weak password: the link is not spent
    assert accept(token).status_code == 204
    user.refresh_from_db()
    assert user.status == AccountStatus.ACTIVE and user.email_verified_at and user.is_staff
    assert user.check_password(STRONG)
    assert accept(token).status_code == 400  # single use
    client = APIClient(enforce_csrf_checks=True)
    login = post_json(client, "/api/v1/auth/login", {"email": user.email, "password": STRONG})
    assert login.status_code == 200 and client.get(f"{S}/session").status_code == 200
    assert AuditEvent.objects.filter(action="staff.invitation_accepted", object_id=user.pk).exists()


def test_an_expired_or_forged_invitation_is_refused_with_the_same_answer(people: dict[str, User]) -> None:
    user = invited(people["admin"])
    row = AuthToken.objects.get(user=user, purpose=TokenPurpose.STAFF_INVITATION)
    token = token_of(user)
    row.expires_at = timezone.now() - timedelta(seconds=1)
    row.save()
    expired = accept(token)
    forged = accept("not-a-token.at-all")
    assert expired.status_code == forged.status_code == 400
    assert expired.json()["error"]["code"] == forged.json()["error"]["code"] == "invalid_token"
    user.refresh_from_db()
    assert user.status == AccountStatus.PENDING_VERIFICATION
    # an invitation is not a verification link: the ordinary e-mail verification path does not activate it
    assert services.verify_email(token) is False
    services.resend_verification(user.email)
    assert not AuthToken.objects.filter(user=user, purpose=TokenPurpose.EMAIL_VERIFICATION).exists()


def test_duplicate_email_is_rejected_whatever_the_case_or_who_holds_it(people: dict[str, User]) -> None:
    client = signed_in(people["admin"])
    for email in ("EDITOR@example.org", "seeker@example.org", "admin@example.org"):
        response = invite(client, email=email)
        assert response.status_code == 400
        assert response.json()["error"]["fields"]["email"]
    assert invite(client, email="one@example.org").status_code == 201
    assert invite(client, email="ONE@example.org").status_code == 400
    assert User.objects.filter(email="one@example.org").count() == 1


def test_invalid_invitations_are_refused_field_by_field(people: dict[str, User]) -> None:
    client = signed_in(people["admin"])
    bad = invite(client, email="not an email", role="publisher", name="")
    fields = bad.json()["error"]["fields"]
    assert bad.status_code == 400 and "email" in fields and "display_name" in fields
    assert invite(client, role="publisher").status_code == 400  # there is no Publisher role (D-23)
    assert invite(client, role="").status_code == 400
    extra = send(
        client,
        "post",
        TEAM,
        {"email": "x@example.org", "display_name": "X Y", "role": "editor", "status": "active"},
    )
    assert extra.status_code == 400  # unknown fields are refused, not ignored
    assert not User.objects.filter(email="x@example.org").exists()


def test_resend_invitation_replaces_the_link_and_is_rate_limited(people: dict[str, User]) -> None:
    user = invited(people["admin"])
    first = token_of(user)
    client = signed_in(people["admin"])
    too_soon = send(client, "post", f"{TEAM}/{user.pk}/actions/resend-invitation", {})
    assert too_soon.status_code == 429
    AuthToken.objects.filter(user=user).update(created_at=timezone.now() - timedelta(minutes=5))
    again = send(client, "post", f"{TEAM}/{user.pk}/actions/resend-invitation", {})
    assert again.status_code == 200 and again.json()["status"]["code"] == "invited"
    assert accept(first).status_code == 400  # the earlier link stopped working
    assert accept(token_of(user)).status_code == 204


def test_an_expired_invitation_can_be_resent(people: dict[str, User]) -> None:
    user = invited(people["admin"])
    AuthToken.objects.filter(user=user).update(
        created_at=timezone.now() - timedelta(days=4), expires_at=timezone.now() - timedelta(days=1)
    )
    client = signed_in(people["admin"])
    listing = client.get(f"{TEAM}?q={user.email}").json()
    assert listing["data"][0]["status"]["code"] == "invitation_expired"
    assert listing["summary"]["pending"] == 1 and listing["summary"]["expired"] == 1
    assert send(client, "post", f"{TEAM}/{user.pk}/actions/resend-invitation", {}).status_code == 200
    assert client.get(f"{TEAM}/{user.pk}").json()["status"]["code"] == "invited"


# --- who may call it ----------------------------------------------------------------------------------------
def test_only_administrators_reach_staff_management(people: dict[str, User]) -> None:
    target = people["editor2"]
    assert APIClient().get(TEAM).status_code in (401, 403)
    for who in ("editor", "author", "author_editor", "seeker"):
        client = signed_in(people[who])
        assert client.get(TEAM).status_code == 403, who
        assert client.get(f"{TEAM}/{target.pk}").status_code == 403, who
        assert client.get(f"{TEAM}/{target.pk}/activity").status_code == 403, who
        assert invite(client).status_code == 403, who
        assert (
            send(
                client, "post", f"{TEAM}/{target.pk}/actions/suspend", {"reason": "not allowed at all"}
            ).status_code
            == 403
        ), who
        assert (
            send(
                client,
                "post",
                f"{TEAM}/{target.pk}/actions/change-role",
                {"role": "administrator", "reason": "make me boss"},
            ).status_code
            == 403
        )
        assert send(client, "patch", f"{TEAM}/{target.pk}", {"display_name": "Hacked"}).status_code == 403
    target.refresh_from_db()
    assert target.status == AccountStatus.ACTIVE and staff_admin.active_roles_of(target) == ["editor"]
    assert target.display_name != "Hacked"


def test_unsafe_requests_need_csrf_and_a_seeker_id_is_not_a_profile(people: dict[str, User]) -> None:
    client = signed_in(people["admin"])
    assert (
        client.post(
            TEAM, {"email": "a@example.org", "display_name": "A B", "role": "editor"}, format="json"
        ).status_code
        == 403
    )
    assert client.get(f"{TEAM}/{people['seeker'].pk}").status_code == 404  # not staff: no such record here
    assert client.get(f"{TEAM}/{uuid.uuid4()}").status_code == 404
    assert (
        send(
            client,
            "post",
            f"{TEAM}/{people['seeker'].pk}/actions/suspend",
            {"reason": "a long enough reason"},
        ).status_code
        == 404
    )
    assert people["seeker"].status == AccountStatus.ACTIVE


# --- role changes -------------------------------------------------------------------------------------------
def test_role_change_replaces_the_role_audits_it_and_tells_the_person(people: dict[str, User]) -> None:
    client = signed_in(people["admin"])
    target = people["editor2"]
    response = send(
        client,
        "post",
        f"{TEAM}/{target.pk}/actions/change-role",
        {"role": "contributor", "reason": "Moved to drafting duties"},
    )
    assert response.status_code == 200 and response.json()["role"]["code"] == "contributor"
    target.refresh_from_db()
    target.refresh_roles()
    assert target.active_roles() == frozenset({Role.CONTRIBUTOR})
    old = StaffRoleAssignment.objects.get(user=target, role="editor")
    assert old.revoked_at and old.revoked_by_id == people["admin"].pk  # revoked, never deleted
    assert not target.has_permission_code("opp.review.approve")  # takes effect at once
    event = AuditEvent.objects.get(action="staff.role_changed")
    assert event.changes == {
        "previous": ["editor"],
        "to": "contributor",
        "reason": "Moved to drafting duties",
    }
    mail = EmailOutbox.objects.get(user=target, kind=EmailKind.STAFF_ACCOUNT_CHANGE)
    assert mail.payload["change"] == "role" and "reason" not in mail.payload
    again = send(
        client,
        "post",
        f"{TEAM}/{target.pk}/actions/change-role",
        {"role": "contributor", "reason": "Moved to drafting duties"},
    )
    assert again.status_code == 409


def test_role_change_validation_and_no_self_service(people: dict[str, User]) -> None:
    client = signed_in(people["admin"])
    target = people["editor2"]
    base = f"{TEAM}/{target.pk}/actions/change-role"
    assert (
        send(client, "post", base, {"role": "publisher", "reason": "a long enough reason"}).status_code == 400
    )
    assert send(client, "post", base, {"role": "editor"}).status_code == 400  # reason required
    assert send(client, "post", base, {"role": "administrator", "reason": "short"}).status_code == 400
    mine = send(
        client,
        "post",
        f"{TEAM}/{people['admin'].pk}/actions/change-role",
        {"role": "editor", "reason": "stepping down myself"},
    )
    assert mine.status_code == 409 and mine.json()["error"]["code"] == "self_change"
    assert staff_admin.active_roles_of(User.objects.get(pk=people["admin"].pk)) == ["administrator"]


def test_a_role_change_does_not_weaken_separation_of_duties(world: World, people: dict[str, User]) -> None:
    from opportunities import workflow
    from opportunities.errors import WorkflowError
    from tests.factories import submitted

    opp = submitted(world, people["author"])
    client = signed_in(people["admin"])
    send(
        client,
        "post",
        f"{TEAM}/{people['author'].pk}/actions/change-role",
        {"role": "editor", "reason": "Promoted after training"},
    )
    author = User.objects.get(pk=people["author"].pk)
    assert author.has_permission_code("opp.review.approve")
    with pytest.raises(WorkflowError):  # an Editor still cannot approve a revision they wrote
        workflow.approve(
            author,
            opp.pk,
            expected_row_version=opp.row_version,
            checklist={"source_reviewed": True, "duplicates_reviewed": True, "content_matches_source": True},
        )


# --- suspension and sessions --------------------------------------------------------------------------------
def test_suspension_blocks_access_ends_sessions_and_reactivation_restores_it(people: dict[str, User]) -> None:
    target = people["editor"]
    victim = signed_in(target)
    assert victim.get(f"{S}/session").status_code == 200
    assert UserSession.objects.filter(user=target, revoked_at__isnull=True).exists()
    admin = signed_in(people["admin"])
    done = send(admin, "post", f"{TEAM}/{target.pk}/actions/suspend", {"reason": "Pending an investigation"})
    assert done.status_code == 200 and done.json()["status"]["code"] == "suspended"
    assert victim.get(f"{S}/session").status_code in (401, 403)  # the live session no longer works
    assert not Session.objects.filter(
        session_key__in=UserSession.objects.filter(user=target).values("session_key")
    ).exists()
    relogin = post_json(
        APIClient(enforce_csrf_checks=True),
        "/api/v1/auth/login",
        {"email": target.email, "password": PASSWORD},
    )
    assert relogin.status_code in (401, 403)
    event = AuditEvent.objects.get(action="staff.suspended")
    assert (
        event.changes
        and event.changes["reason"] == "Pending an investigation"
        and event.severity == "security"
    )
    assert EmailOutbox.objects.filter(
        user=target, kind=EmailKind.STAFF_ACCOUNT_CHANGE, payload__change="suspended"
    ).exists()
    # a suspended person cannot be suspended twice; reactivation brings the same role back
    assert (
        send(
            admin, "post", f"{TEAM}/{target.pk}/actions/suspend", {"reason": "Pending an investigation"}
        ).status_code
        == 409
    )
    back = send(admin, "post", f"{TEAM}/{target.pk}/actions/reactivate", {"reason": "Investigation closed"})
    assert back.status_code == 200 and back.json()["status"]["code"] == "active"
    fresh = signed_in(target)
    assert fresh.get(f"{S}/session").status_code == 200 and fresh.get(TEAM).status_code == 403


def test_revoking_sessions_signs_the_person_out_but_leaves_the_account(people: dict[str, User]) -> None:
    target = people["editor"]
    one, two = signed_in(target), signed_in(target)
    admin = signed_in(people["admin"])
    response = send(
        admin, "post", f"{TEAM}/{target.pk}/actions/revoke-sessions", {"reason": "Left a shared computer"}
    )
    assert response.status_code == 200 and response.json()["status"]["code"] == "active"
    assert one.get(f"{S}/session").status_code in (401, 403) and two.get(f"{S}/session").status_code in (
        401,
        403,
    )
    assert signed_in(target).get(f"{S}/session").status_code == 200  # may sign in again
    assert AuditEvent.objects.get(action="staff.sessions_revoked").changes["sessions"] == 2  # type: ignore[index]
    own = send(
        admin,
        "post",
        f"{TEAM}/{people['admin'].pk}/actions/revoke-sessions",
        {"reason": "this would end my own"},
    )
    assert own.status_code == 409


def test_recovery_link_is_a_single_use_reset_and_never_a_password(people: dict[str, User]) -> None:
    target = people["editor"]
    admin = signed_in(people["admin"])
    assert send(admin, "post", f"{TEAM}/{target.pk}/actions/send-recovery", {}).status_code == 200
    mail = EmailOutbox.objects.get(user=target, kind=EmailKind.PASSWORD_RESET)
    message = outbox.build_message(mail)
    assert message is not None and "reset-password?token=" in message.body
    assert send(admin, "post", f"{TEAM}/{target.pk}/actions/send-recovery", {}).status_code == 429
    assert AuditEvent.objects.filter(action="staff.recovery_sent", object_id=target.pk).exists()


# --- last administrator and self protection -----------------------------------------------------------------
def test_nobody_removes_their_own_access_and_the_last_administrator_is_protected(
    make_user: Any, people: dict[str, User]
) -> None:
    StaffRoleAssignment.objects.filter(user=people["author_admin"], role="administrator").update(
        revoked_at=timezone.now(), revoked_by=people["admin"]
    )  # the shared fixture has a second Administrator; this test needs exactly one
    admin = signed_in(people["admin"])
    me = f"{TEAM}/{people['admin'].pk}"
    assert admin.get(me).json()["protected"] == {"self": True, "last_administrator": True}
    for action, body in (
        ("suspend", {"reason": "locking myself out"}),
        ("remove", {"reason": "removing myself now", "confirm": True}),
        ("change-role", {"role": "editor", "reason": "demoting myself"}),
    ):
        refused = send(admin, "post", f"{me}/actions/{action}", body)
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "self_change", action
    actions = [a["name"] for a in admin.get(me).json()["actions"]]
    assert "remove" not in actions and "suspend" not in actions and "change-role" not in actions

    # the same rule holds for the service when it is the only Administrator left, whoever asks
    with pytest.raises(staff_admin.StaffAdminError) as exc:
        staff_admin._keep_an_administrator(people["admin"], [people["admin"]])
    assert exc.value.code == "last_administrator"

    # with a second Administrator the first may be changed, and exactly one Administrator always remains
    second = make_user(email="second.admin@example.org", roles=("administrator",))
    assert (
        send(
            admin,
            "post",
            f"{TEAM}/{second.pk}/actions/change-role",
            {"role": "editor", "reason": "Rota change agreed"},
        ).status_code
        == 200
    )
    active_admins = StaffRoleAssignment.objects.filter(
        role="administrator", revoked_at__isnull=True, user__status=AccountStatus.ACTIVE
    )
    assert active_admins.count() == 1
    assert (
        send(
            admin, "post", f"{TEAM}/{second.pk}/actions/suspend", {"reason": "nothing to do with it"}
        ).status_code
        == 200
    )


def test_two_administrators_cannot_both_demote_each_other_away(
    make_user: Any, people: dict[str, User]
) -> None:
    """The check is made on locked rows, so after one of them is gone the other cannot be touched by it."""
    a, b = people["admin"], make_user(email="b.admin@example.org", roles=("administrator",))
    staff_admin.change_role(a, b.pk, role="editor", reason="A demotes B first")
    with pytest.raises(staff_admin.StaffAdminError) as exc:  # B no longer holds the Administrator permission
        staff_admin.change_role(User.objects.get(pk=b.pk), a.pk, role="editor", reason="B demotes A second")
    assert exc.value.code == "permission_denied"
    assert StaffRoleAssignment.objects.filter(user=a, role="administrator", revoked_at__isnull=True).exists()


# --- removal keeps history ----------------------------------------------------------------------------------
def test_removal_deactivates_without_deleting_listings_or_audit_history(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    editor = people["editor"]
    events_before = PublishingEvent.objects.filter(actor=editor).count()
    audit_before = AuditEvent.objects.filter(actor_ref=editor.pk).count()
    assert events_before and OpportunityVersion.objects.filter(approved_by=editor).exists()
    victim = signed_in(editor)
    admin = signed_in(people["admin"])
    path = f"{TEAM}/{editor.pk}/actions/remove"
    assert (
        send(admin, "post", path, {"reason": "Left the organisation"}).status_code == 400
    )  # needs confirmation
    assert send(admin, "post", path, {"reason": "Left the organisation", "confirm": False}).status_code == 400
    assert send(admin, "post", path, {"reason": "Left the organisation", "confirm": True}).status_code == 200
    editor.refresh_from_db()
    assert editor.status == AccountStatus.DEACTIVATED and not editor.is_staff
    assert not StaffRoleAssignment.objects.filter(user=editor, revoked_at__isnull=True).exists()
    assert StaffRoleAssignment.objects.filter(user=editor).count() == 1  # the assignment is kept, revoked
    assert victim.get(f"{S}/session").status_code in (401, 403)
    assert post_json(
        APIClient(enforce_csrf_checks=True),
        "/api/v1/auth/login",
        {"email": editor.email, "password": PASSWORD},
    ).status_code in (401, 403)
    # everything they did is still there, attributed to them
    opp.refresh_from_db()
    assert opp.status == "published" and Opportunity.objects.filter(pk=opp.pk).exists()
    assert OpportunityVersion.objects.filter(approved_by=editor).exists()
    assert PublishingEvent.objects.filter(actor=editor).count() == events_before
    assert AuditEvent.objects.filter(actor_ref=editor.pk).count() >= audit_before
    assert APIClient().get(f"/api/v1/opportunities/{opp.slug}").status_code == 200  # still public
    detail = admin.get(f"{TEAM}/{editor.pk}").json()
    assert detail["status"]["code"] == "removed" and detail["stats"]["published"] >= 1
    assert detail["permissions"] == []
    removed = AuditEvent.objects.get(action="staff.removed")
    assert removed.changes and removed.changes["roles"] == ["editor"]
    assert "removed" in [
        m.payload.get("change")
        for m in EmailOutbox.objects.filter(user=editor, kind=EmailKind.STAFF_ACCOUNT_CHANGE)
    ]


def test_cancelling_an_invitation_voids_the_link_and_a_removed_person_can_be_reinstated(
    people: dict[str, User],
) -> None:
    user = invited(people["admin"])
    token = token_of(user)
    admin = signed_in(people["admin"])
    assert (
        send(
            admin,
            "post",
            f"{TEAM}/{user.pk}/actions/remove",
            {"reason": "Wrong person invited", "confirm": True},
        ).status_code
        == 200
    )
    assert accept(token).status_code == 400
    assert not EmailOutbox.objects.filter(
        user=user, kind=EmailKind.STAFF_ACCOUNT_CHANGE
    ).exists()  # never had access
    assert (
        send(
            admin, "post", f"{TEAM}/{user.pk}/actions/reinstate", {"role": "editor", "reason": "Back again"}
        ).status_code
        == 409
    )  # never accepted

    other = people["editor2"]
    assert (
        send(
            admin, "post", f"{TEAM}/{other.pk}/actions/remove", {"reason": "Contract ended", "confirm": True}
        ).status_code
        == 200
    )
    back = send(
        admin,
        "post",
        f"{TEAM}/{other.pk}/actions/reinstate",
        {"role": "contributor", "reason": "Contract renewed"},
    )
    assert (
        back.status_code == 200
        and back.json()["status"]["code"] == "active"
        and back.json()["role"]["code"] == "contributor"
    )
    assert signed_in(other).get(f"{S}/session").status_code == 200


# --- reading ------------------------------------------------------------------------------------------------
def test_list_has_summary_search_filters_sorting_and_pages(make_user: Any, people: dict[str, User]) -> None:
    for i in range(30):
        make_user(email=f"extra{i:02d}@example.org", roles=("contributor",), display_name=f"Extra {i:02d}")
    invited(people["admin"], email="pending@example.org", name="Pending Pat")
    admin = signed_in(people["admin"])
    make_suspended = people["editor2"]
    send(admin, "post", f"{TEAM}/{make_suspended.pk}/actions/suspend", {"reason": "Just for this test"})
    listing = admin.get(TEAM).json()
    summary = listing["summary"]
    total_staff = staff_admin.staff_accounts().count()
    assert summary["total"] == total_staff and summary["suspended"] == 1 and summary["pending"] == 1
    assert summary["active"] == total_staff - 2
    assert listing["page"]["page_size"] == 25 and listing["page"]["pages"] == 2 and len(listing["data"]) == 25
    assert {r["value"] for r in listing["roles"]} == {"administrator", "editor", "contributor"}
    second = admin.get(f"{TEAM}?page=2").json()
    assert len(second["data"]) == total_staff - 25
    assert admin.get(f"{TEAM}?q=pending pat").json()["data"][0]["name"] == "Pending Pat"
    assert admin.get(f"{TEAM}?q=extra07@").json()["page"]["total"] == 1
    assert {r["role"]["code"] for r in admin.get(f"{TEAM}?role=administrator").json()["data"]} == {
        "administrator"
    }
    assert [r["status"]["code"] for r in admin.get(f"{TEAM}?status=suspended").json()["data"]] == [
        "suspended"
    ]
    assert admin.get(f"{TEAM}?status=pending").json()["data"][0]["status"]["code"] == "invited"
    names = [r["name"] for r in admin.get(f"{TEAM}?sort=-name&page_size=50").json()["data"]]
    assert names == sorted(names, reverse=True)
    assert admin.get(f"{TEAM}?sort=password").status_code == 200  # an unknown sort falls back to the default
    assert admin.get(f"{TEAM}?role=nonsense&status=nonsense&page=zzz").status_code == 200
    me = next(r for r in admin.get(f"{TEAM}?q=admin@example.org").json()["data"] if r["is_you"])
    assert me["email"] == "admin@example.org"
    # sorting by last sign-in puts people who never signed in last
    people["editor"].last_login = timezone.now()
    people["editor"].save()
    by_login = admin.get(f"{TEAM}?sort=-last_login&page_size=50").json()["data"]
    assert by_login[0]["last_login"] is not None and by_login[-1]["last_login"] is None


def test_profile_shows_permissions_listing_work_and_activity(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    admin = signed_in(people["admin"])
    detail = admin.get(f"{TEAM}/{people['editor'].pk}").json()
    assert detail["role"] == {"code": "editor", "label": "Editor"} and detail["email"] == "editor@example.org"
    assert "opp.review.approve" in detail["permissions"] and "user.role.grant" not in detail["permissions"]
    assert detail["stats"]["reviewed"] >= 1 and detail["stats"]["published"] >= 1
    assert any(r["id"] == str(opp.pk) for r in detail["recent_listings"])
    assert detail["two_step"] is False and detail["email_verified"] is True
    assert detail["protected"] == {"self": False, "last_administrator": False}
    assert {a["name"] for a in detail["actions"]} >= {
        "change-role",
        "suspend",
        "remove",
        "revoke-sessions",
        "send-recovery",
    }
    author = admin.get(f"{TEAM}/{people['author'].pk}").json()
    assert author["stats"]["created"] >= 1 and author["role"]["code"] == "contributor"
    activity = admin.get(f"{TEAM}/{people['editor'].pk}/activity").json()
    assert activity["page"]["page"] == 1
    send(
        admin,
        "post",
        f"{TEAM}/{people['editor'].pk}/actions/change-role",
        {"role": "contributor", "reason": "Rotating duties"},
    )
    activity = admin.get(f"{TEAM}/{people['editor'].pk}/activity").json()["data"]
    assert activity[0]["what"] == "Role changed" and activity[0]["actor"] == people["admin"].display_name
    assert activity[0]["details"]["to"] == "contributor"
    assert "password" not in str(activity).lower()


def test_profile_edit_changes_only_the_name(people: dict[str, User]) -> None:
    admin = signed_in(people["admin"])
    path = f"{TEAM}/{people['editor'].pk}"
    ok = send(admin, "patch", path, {"display_name": "Tendai Chikwanha"})
    assert ok.status_code == 200 and ok.json()["name"] == "Tendai Chikwanha"
    for body in (
        {"display_name": "x", "email": "attacker@example.org"},
        {"role": "administrator"},
        {"status": "active"},
        {"is_staff": True},
    ):
        assert send(admin, "patch", path, body).status_code == 400
    assert send(admin, "patch", path, {"display_name": "https://evil.example"}).status_code == 400
    assert send(admin, "patch", path, {"display_name": ""}).status_code == 400
    user = User.objects.get(pk=people["editor"].pk)
    assert user.email == "editor@example.org" and staff_admin.active_roles_of(user) == ["editor"]
    assert AuditEvent.objects.filter(action="staff.profile_updated", object_id=user.pk).count() == 1


# --- audit hygiene and e-mail -------------------------------------------------------------------------------
def test_audit_and_outbox_never_hold_secrets(people: dict[str, User]) -> None:
    user = invited(people["admin"], email="secretless@example.org")
    token = token_of(user)
    accept(token)
    admin = signed_in(people["admin"])
    send(
        admin,
        "post",
        f"{TEAM}/{user.pk}/actions/change-role",
        {"role": "contributor", "reason": "Moving to drafting"},
    )
    send(admin, "post", f"{TEAM}/{user.pk}/actions/suspend", {"reason": "Checking something"})
    blob = " ".join(f"{e.action} {e.changes}" for e in AuditEvent.objects.filter(action__startswith="staff."))
    for secret in (token, token.split(".")[0], STRONG, "secretless@example.org", "pbkdf2", "argon2"):
        assert secret not in blob
    for row in EmailOutbox.objects.filter(user=user):
        assert token not in str(row.payload) and STRONG not in str(row.payload)
    assert (
        AuditEvent.objects.filter(
            action__startswith="staff.", severity__in=("privileged", "security")
        ).count()
        >= 4
    )


def test_every_change_is_attributed_to_the_actor_and_target(people: dict[str, User]) -> None:
    admin = signed_in(people["admin"])
    target = people["editor2"]
    send(admin, "post", f"{TEAM}/{target.pk}/actions/suspend", {"reason": "Reason for the audit"})
    event = AuditEvent.objects.get(action="staff.suspended")
    assert (event.actor_ref, event.object_type, event.object_id) == (people["admin"].pk, "user", target.pk)
    assert event.occurred_at and event.request_id


def test_validation_of_reasons_and_unknown_actions(people: dict[str, User]) -> None:
    admin = signed_in(people["admin"])
    target = people["editor2"]
    path = f"{TEAM}/{target.pk}/actions"
    assert send(admin, "post", f"{path}/suspend", {}).status_code == 400
    assert send(admin, "post", f"{path}/suspend", {"reason": "short"}).status_code == 400
    assert send(admin, "post", f"{path}/suspend", {"reason": "x" * 501}).status_code == 400
    assert send(admin, "post", f"{path}/delete", {"reason": "a long enough reason"}).status_code == 404
    assert send(admin, "post", f"{path}/reactivate", {"reason": "a long enough reason"}).status_code == 409
    assert send(admin, "post", f"{path}/resend-invitation", {}).status_code == 409
    assert (
        admin.post(
            f"{path}/suspend", "[]", content_type="application/json", HTTP_X_CSRFTOKEN=csrf(admin)
        ).status_code
        == 400
    )
    assert User.objects.get(pk=target.pk).status == AccountStatus.ACTIVE


def test_invitation_and_change_emails_use_the_branded_system(people: dict[str, User]) -> None:
    user = invited(people["admin"], role="administrator", name="Rudo")
    message = outbox.build_message(EmailOutbox.objects.get(user=user, kind=EmailKind.STAFF_INVITATION))
    assert message is not None and message.html and "Administrator" in message.html
    assert "UPNEXT" in message.html and "Accept invitation and set password" in message.html
    assert message.subject.startswith("You are invited to join the UPNEXT Careers team")
    assert tokens.TTL[TokenPurpose.STAFF_INVITATION] == timedelta(hours=72)
