"""Staff lifecycle for Administrators (D-58): invite, accept, change role, suspend, reactivate, remove, reinstate,
revoke sessions and send recovery links.

Rules that hold for every operation here:

* **Permission first.** The caller must hold the registry permission for the operation (`user.role.grant`,
  `user.role.revoke`, `user.status.change`); only Administrators do. The views check it again; the service is the
  authority, so a future caller cannot skip it.
* **Nothing is deleted.** Removal deactivates the account and revokes its roles; the row, its name and every audit
  event, listing, review and verification it is attached to stay (the foreign keys are PROTECT as well).
* **Nobody removes their own access.** An Administrator cannot change their own role, suspend or remove themselves,
  and the last active Administrator cannot lose the role or the account, whoever asks. Those rows are locked in
  primary-key order so two simultaneous requests cannot each see "another administrator exists".
* **Every change is audited in the same transaction** (actor, target, reason and the facts that changed; never an
  e-mail address, password or token) and the person is told by e-mail through the outbox.
* **No password is ever stored or sent.** An invitation is a single-use, time-limited link (an `AuthToken` with its
  own purpose); the person chooses the password. Roles are checked against the registry, so there is no way to
  invent a role (there is deliberately no Publisher role, D-23).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils import timezone

from access.registry import DEFAULT_REGISTRY, Permission, Role
from audit import services as audit
from audit.models import Severity
from notifications import services as outbox
from notifications.models import EmailKind

from . import services, tokens, trusted_devices
from .models import AccountStatus, AuthToken, StaffRoleAssignment, TokenPurpose, User, UserSession

ROLE_ORDER: tuple[str, ...] = (Role.ADMINISTRATOR, Role.EDITOR, Role.CONTRIBUTOR)
ROLE_LABELS: dict[str, str] = {
    Role.ADMINISTRATOR: "Administrator",
    Role.EDITOR: "Editor",
    Role.CONTRIBUTOR: "Contributor",
}
ROLE_SUMMARIES: dict[str, str] = {
    Role.ADMINISTRATOR: "Manages staff, roles and settings, and can do everything an Editor can.",
    Role.EDITOR: "Writes, reviews, verifies and publishes listings; cannot approve their own work.",
    Role.CONTRIBUTOR: "Drafts listings and submits them for another person to review.",
}
REASON_MIN, REASON_MAX = 10, 500
RESEND_GAP = timedelta(seconds=60)

# What each state means for the person (see `state_of`).
INVITED, INVITATION_EXPIRED, ACTIVE, SUSPENDED, REMOVED = (
    "invited",
    "invitation_expired",
    "active",
    "suspended",
    "removed",
)


class StaffAdminError(Exception):
    """A rule refused the operation. `code` is stable for the API; `fields` maps a field to messages."""

    def __init__(
        self, code: str, message: str, *, status: int = 400, fields: dict[str, list[str]] | None = None
    ) -> None:
        super().__init__(message)
        self.code, self.message, self.status, self.fields = code, message, status, fields or {}


def _refuse(code: str, message: str, status: int = 409) -> StaffAdminError:
    return StaffAdminError(code, message, status=status)


def _need(actor: User, *codes: Permission) -> None:
    if not actor.is_active or not all(actor.has_permission_code(c) for c in codes):
        raise StaffAdminError("permission_denied", "You do not have permission to manage staff.", status=403)


# --- reading -------------------------------------------------------------------------------------------
def staff_accounts() -> QuerySet[User]:
    """Everyone who has ever held (or been invited to hold) a staff role. Removed staff stay listed."""
    return User.objects.filter(Exists(StaffRoleAssignment.objects.filter(user=OuterRef("pk"))))


def _live_invitation(now: datetime) -> Exists:
    return Exists(
        AuthToken.objects.filter(
            user=OuterRef("pk"),
            purpose=TokenPurpose.STAFF_INVITATION,
            used_at__isnull=True,
            invalidated_at__isnull=True,
            expires_at__gt=now,
        )
    )


def active_roles_of(user: User) -> list[str]:
    held = {a.role for a in user.role_assignments.all() if a.revoked_at is None}
    return [r for r in ROLE_ORDER if r in held]


def last_role_of(user: User) -> str | None:
    """The role shown for a removed person: the one they held last."""
    rows = sorted(user.role_assignments.all(), key=lambda a: a.granted_at, reverse=True)
    return rows[0].role if rows else None


def primary_role(user: User) -> str | None:
    roles = active_roles_of(user)
    return roles[0] if roles else last_role_of(user)


def state_of(user: User, *, has_live_invitation: bool) -> str:
    if user.status == AccountStatus.PENDING_VERIFICATION:
        return INVITED if has_live_invitation else INVITATION_EXPIRED
    if user.status == AccountStatus.SUSPENDED:
        return SUSPENDED
    if user.status == AccountStatus.ACTIVE:
        return ACTIVE
    return REMOVED


def summary_counts() -> dict[str, int]:
    now = timezone.now()
    qs = staff_accounts()
    return {
        "total": qs.exclude(status=AccountStatus.DEACTIVATED).count(),
        "active": qs.filter(status=AccountStatus.ACTIVE).count(),
        "suspended": qs.filter(status=AccountStatus.SUSPENDED).count(),
        "pending": qs.filter(status=AccountStatus.PENDING_VERIFICATION).count(),
        "expired": qs.filter(status=AccountStatus.PENDING_VERIFICATION)
        .exclude(_live_invitation(now))
        .count(),
    }


SORTS = {
    "name": "display_name",
    "email": "email",
    "last_login": "last_login",
    "joined": "created_at",
}


def filtered(search: str = "", role: str = "", status: str = "", sort: str = "name") -> QuerySet[User]:
    qs = staff_accounts().prefetch_related("role_assignments")
    term = search.strip()[:80]
    if term:
        qs = qs.filter(Q(display_name__icontains=term) | Q(email__icontains=term))
    if role in ROLE_ORDER:
        qs = qs.filter(
            Exists(
                StaffRoleAssignment.objects.filter(user=OuterRef("pk"), role=role, revoked_at__isnull=True)
            )
        )
    status_map = {
        "active": AccountStatus.ACTIVE,
        "suspended": AccountStatus.SUSPENDED,
        "pending": AccountStatus.PENDING_VERIFICATION,
        "removed": AccountStatus.DEACTIVATED,
    }
    if status in status_map:
        qs = qs.filter(status=status_map[status])
    descending = sort.startswith("-")
    key = SORTS.get(sort.lstrip("-"), "display_name")
    order = f"-{key}" if descending else key
    if key == "last_login":  # people who never signed in sort last, not first
        from django.db.models import F

        field_expr = (
            F("last_login").desc(nulls_last=True) if descending else F("last_login").asc(nulls_last=True)
        )
        return qs.order_by(field_expr, "display_name", "pk")
    return qs.order_by(order, "display_name", "pk")


def invitations_for(users: Iterable[User]) -> dict[uuid.UUID, AuthToken]:
    """The newest invitation token of each user (live, used or expired)."""
    latest: dict[uuid.UUID, AuthToken] = {}
    for token in AuthToken.objects.filter(
        user__in=list(users), purpose=TokenPurpose.STAFF_INVITATION
    ).order_by("created_at"):
        latest[token.user_id] = token
    return latest


def role_permissions(role: str | None) -> list[str]:
    """The permission codes a role grants through the registry (not the ones every account holds)."""
    return sorted(DEFAULT_REGISTRY.grants.get(str(role), frozenset())) if role else []


# --- validation helpers --------------------------------------------------------------------------------
def clean_reason(value: Any, *, required: bool = True) -> str:
    text = " ".join(str(value or "").split())
    if not text and not required:
        return ""
    if not REASON_MIN <= len(text) <= REASON_MAX:
        raise StaffAdminError(
            "validation_failed",
            "Give a reason.",
            fields={"reason": [f"Give a reason of {REASON_MIN} to {REASON_MAX} characters."]},
        )
    return text


def clean_role(value: Any) -> str:
    if value not in ROLE_ORDER:
        raise StaffAdminError(
            "validation_failed",
            "Choose a role.",
            fields={"role": ["Choose Administrator, Editor or Contributor."]},
        )
    return str(value)


def _lock(target_id: uuid.UUID | str) -> tuple[User, list[User]]:
    """Lock the target and every active Administrator in primary-key order; return (target, administrators)."""
    admin_ids = list(
        StaffRoleAssignment.objects.filter(role=Role.ADMINISTRATOR, revoked_at__isnull=True).values_list(
            "user_id", flat=True
        )
    )
    rows = list(User.objects.select_for_update().filter(Q(pk=target_id) | Q(pk__in=admin_ids)).order_by("pk"))
    target = next((u for u in rows if str(u.pk) == str(target_id)), None)
    if target is None or not staff_accounts().filter(pk=target.pk).exists():
        raise StaffAdminError("not_found", "Not found.", status=404)
    admins = [u for u in rows if u.pk in admin_ids and u.status == AccountStatus.ACTIVE]
    return target, admins


def _not_self(actor: User, target: User, what: str) -> None:
    if actor.pk == target.pk:
        raise _refuse("self_change", f"You cannot {what} your own account. Ask another Administrator.")


def _keep_an_administrator(target: User, admins: list[User]) -> None:
    """Refuse when the target is the last active Administrator."""
    if any(a.pk == target.pk for a in admins) and len(admins) <= 1:
        raise _refuse(
            "last_administrator",
            "This is the only active Administrator. Make another person an Administrator first.",
        )


def _notify(target: User, change: str, role: str | None) -> None:
    outbox.enqueue(
        EmailKind.STAFF_ACCOUNT_CHANGE,
        target,
        target.email,
        context={
            "display_name": target.display_name,
            "change": change,
            "role_label": ROLE_LABELS.get(role or "", ""),
        },
    )


def _audit(
    actor: User, target: User, action: str, *, severity: str = Severity.PRIVILEGED, **changes: Any
) -> None:
    audit.record(
        action=f"staff.{action}",
        object_type="user",
        object_id=target.pk,
        actor_id=actor.pk,
        severity=severity,
        changes=changes or None,
    )


def _grant(target: User, role: str, actor: User, reason: str) -> None:
    StaffRoleAssignment.objects.create(user=target, role=role, granted_by=actor, reason=reason)


def _revoke_roles(target: User, actor: User, *, keep: str | None = None) -> list[str]:
    now = timezone.now()
    revoked: list[str] = []
    for row in StaffRoleAssignment.objects.select_for_update().filter(user=target, revoked_at__isnull=True):
        if row.role == keep:
            continue
        row.revoked_at, row.revoked_by = now, actor
        row.save(update_fields=["revoked_at", "revoked_by"])
        revoked.append(row.role)
    return revoked


# --- invitation ----------------------------------------------------------------------------------------
def invite(actor: User, *, email: str, display_name: str, role: str) -> User:
    """Create the account in `pending_verification` with the chosen role and queue the invitation. The role
    carries no authority until the person accepts: `User.is_staff` needs an active account."""
    _need(actor, Permission.USER_ROLE_GRANT)
    email, display_name = services.normalise_email(email), display_name.strip()
    problems = {
        "email": [m] if (m := services.email_problem(email)) else [],
        "display_name": [m] if (m := services.display_name_problem(display_name)) else [],
    }
    if role not in ROLE_ORDER:
        problems["role"] = ["Choose Administrator, Editor or Contributor."]
    if any(problems.values()):
        raise StaffAdminError(
            "validation_failed", "Check the details.", fields={k: v for k, v in problems.items() if v}
        )
    with transaction.atomic():
        if User.objects.select_for_update().filter(email=email).exists():
            raise StaffAdminError(
                "validation_failed",
                "That e-mail address already has an account.",
                status=400,
                fields={"email": ["That e-mail address already has an account."]},
            )
        user = User(email=email, display_name=display_name, status=AccountStatus.PENDING_VERIFICATION)
        user.set_unusable_password()
        user.save()
        _grant(user, role, actor, "Invited by an administrator")
        token = tokens.issue(user, TokenPurpose.STAFF_INVITATION)
        _send_invitation(user, token, actor, role)
        _audit(actor, user, "invited", role=role)
    return user


def _send_invitation(user: User, token: AuthToken, actor: User, role: str) -> None:
    outbox.enqueue(
        EmailKind.STAFF_INVITATION,
        user,
        user.email,
        token=token,
        context={
            "display_name": user.display_name,
            "role_label": ROLE_LABELS.get(role, ""),
            "invited_by": actor.display_name,
        },
    )


def resend_invitation(actor: User, target_id: uuid.UUID | str) -> User:
    """A fresh link (the earlier one stops working) for a person who has not accepted yet, expired or not."""
    _need(actor, Permission.USER_ROLE_GRANT)
    with transaction.atomic():
        target, _ = _lock(target_id)
        if target.status != AccountStatus.PENDING_VERIFICATION:
            raise _refuse(
                "invalid_state", "Only a person who has not accepted yet can be sent a new invitation."
            )
        last = (
            AuthToken.objects.filter(user=target, purpose=TokenPurpose.STAFF_INVITATION)
            .order_by("-created_at")
            .first()
        )
        if last is None:
            raise _refuse("invalid_state", "This account was not created by an invitation.")
        if timezone.now() - last.created_at < RESEND_GAP:
            raise StaffAdminError(
                "rate_limited",
                "An invitation was sent a moment ago. Wait a minute before sending another.",
                status=429,
            )
        roles = active_roles_of(target)
        role = roles[0] if roles else ""
        token = tokens.issue(target, TokenPurpose.STAFF_INVITATION)
        _send_invitation(target, token, actor, role)
        _audit(actor, target, "invitation_resent", role=role)
    return target


def accept_invitation(token_value: str, password: str) -> bool:
    """Use the invitation: choose a password, activate the account. False for any bad, used or expired link."""
    now = timezone.now()
    with transaction.atomic():
        token = tokens.resolve(token_value, TokenPurpose.STAFF_INVITATION, now=now)
        if token is None:
            return False
        user = User.objects.select_for_update().get(pk=token.user_id)
        if user.status != AccountStatus.PENDING_VERIFICATION or not active_roles_of(user):
            return False  # removed or changed in the meantime: the same answer as a bad link
        problems = services.password_problems(password, email=user.email, display_name=user.display_name)
        if problems:
            raise services.AccountError({"password": problems})
        user.set_password(services.normalise_password(password))
        user.status, user.email_verified_at = AccountStatus.ACTIVE, now
        user.save(update_fields=["password", "status", "email_verified_at", "updated_at"])
        token.used_at = now
        token.save(update_fields=["used_at"])
        services.revoke_sessions(user, now=now)
        audit.record(
            action="staff.invitation_accepted",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
    return True


# --- changes -------------------------------------------------------------------------------------------
def update_profile(actor: User, target_id: uuid.UUID | str, *, display_name: str) -> User:
    _need(actor, Permission.USER_STATUS_CHANGE)
    name = display_name.strip()
    if problem := services.display_name_problem(name):
        raise StaffAdminError("validation_failed", "Check the name.", fields={"display_name": [problem]})
    with transaction.atomic():
        target, _ = _lock(target_id)
        if target.status == AccountStatus.DEACTIVATED:
            raise _refuse("invalid_state", "A removed account cannot be edited.")
        if target.display_name != name:
            before = target.display_name
            target.display_name = name
            target.row_version += 1
            target.save(update_fields=["display_name", "row_version", "updated_at"])
            _audit(actor, target, "profile_updated", display_name=[before, name], severity=Severity.INFO)
    return target


def change_role(actor: User, target_id: uuid.UUID | str, *, role: str, reason: str) -> User:
    """Make `role` the person's one staff role (earlier ones are revoked, never deleted)."""
    _need(actor, Permission.USER_ROLE_GRANT, Permission.USER_ROLE_REVOKE)
    role, reason = clean_role(role), clean_reason(reason)
    with transaction.atomic():
        target, admins = _lock(target_id)
        _not_self(actor, target, "change the role of")
        if not any(a.pk == actor.pk for a in admins):
            raise StaffAdminError(
                "permission_denied", "You do not have permission to manage staff.", status=403
            )
        if target.status == AccountStatus.DEACTIVATED:
            raise _refuse("invalid_state", "This person was removed. Reinstate them to give a role.")
        before = active_roles_of(target)
        if before == [role]:
            raise _refuse("invalid_state", f"This person is already {ROLE_LABELS[role]}.")
        if role != Role.ADMINISTRATOR:
            _keep_an_administrator(target, admins)
        if role not in before:
            _grant(target, role, actor, reason)
        _revoke_roles(target, actor, keep=role)
        target.row_version += 1
        target.save(update_fields=["row_version", "updated_at"])
        target.refresh_roles()
        trusted_devices.revoke_all(
            target, "role_changed", actor_id=actor.pk
        )  # new authority: prove a code again
        _audit(actor, target, "role_changed", previous=before, to=role, reason=reason)
        _notify(target, "role", role)
    return target


def suspend(actor: User, target_id: uuid.UUID | str, *, reason: str) -> User:
    _need(actor, Permission.USER_STATUS_CHANGE)
    reason = clean_reason(reason)
    with transaction.atomic():
        target, admins = _lock(target_id)
        _not_self(actor, target, "suspend")
        if not any(a.pk == actor.pk for a in admins):
            raise StaffAdminError(
                "permission_denied", "You do not have permission to manage staff.", status=403
            )
        if target.status != AccountStatus.ACTIVE:
            raise _refuse("invalid_state", "Only an active account can be suspended.")
        _keep_an_administrator(target, admins)
        target.status = AccountStatus.SUSPENDED
        target.row_version += 1
        target.save(update_fields=["status", "row_version", "updated_at"])
        revoked = services.revoke_sessions(target)
        trusted_devices.revoke_all(target, "suspended", actor_id=actor.pk)
        _audit(
            actor, target, "suspended", reason=reason, sessions_revoked=revoked, severity=Severity.SECURITY
        )
        _notify(target, "suspended", primary_role(target))
    return target


def reactivate(actor: User, target_id: uuid.UUID | str, *, reason: str) -> User:
    _need(actor, Permission.USER_STATUS_CHANGE)
    reason = clean_reason(reason)
    with transaction.atomic():
        target, _ = _lock(target_id)
        if target.status != AccountStatus.SUSPENDED:
            raise _refuse("invalid_state", "Only a suspended account can be reactivated.")
        target.status = AccountStatus.ACTIVE
        target.row_version += 1
        target.save(update_fields=["status", "row_version", "updated_at"])
        _audit(actor, target, "reactivated", reason=reason, severity=Severity.SECURITY)
        _notify(target, "reactivated", primary_role(target))
    return target


def remove(actor: User, target_id: uuid.UUID | str, *, reason: str, confirmed: bool) -> User:
    """Deactivate the account, revoke its roles and sessions, cancel an open invitation. The row, the name and
    everything the person did stay: published listings, reviews, verifications and audit history are untouched."""
    _need(actor, Permission.USER_STATUS_CHANGE, Permission.USER_ROLE_REVOKE)
    reason = clean_reason(reason)
    if confirmed is not True:
        raise StaffAdminError(
            "validation_failed", "Confirm the removal.", fields={"confirm": ["Tick the box to confirm."]}
        )
    with transaction.atomic():
        target, admins = _lock(target_id)
        _not_self(actor, target, "remove")
        if not any(a.pk == actor.pk for a in admins):
            raise StaffAdminError(
                "permission_denied", "You do not have permission to manage staff.", status=403
            )
        if target.status == AccountStatus.DEACTIVATED:
            raise _refuse("invalid_state", "This person was already removed.")
        _keep_an_administrator(target, admins)
        was_pending = target.status == AccountStatus.PENDING_VERIFICATION
        roles = active_roles_of(target)
        last = primary_role(target)
        _revoke_roles(target, actor)
        target.status = AccountStatus.DEACTIVATED
        target.row_version += 1
        target.save(update_fields=["status", "row_version", "updated_at"])
        target.refresh_roles()
        AuthToken.objects.filter(user=target, used_at__isnull=True, invalidated_at__isnull=True).update(
            invalidated_at=timezone.now()
        )
        revoked = services.revoke_sessions(target)
        trusted_devices.revoke_all(target, "removed", actor_id=actor.pk)
        _audit(
            actor, target, "removed", reason=reason, roles=roles, sessions_revoked=revoked,
            was_pending_invitation=was_pending, severity=Severity.SECURITY,
        )  # fmt: skip
        if not was_pending:  # someone who never accepted needs no notice of an access they never had
            _notify(target, "removed", last)
    return target


def reinstate(actor: User, target_id: uuid.UUID | str, *, role: str, reason: str) -> User:
    """Bring a removed person back with a chosen role. They keep their password and must pass two-step again."""
    _need(actor, Permission.USER_ROLE_GRANT, Permission.USER_STATUS_CHANGE)
    role, reason = clean_role(role), clean_reason(reason)
    with transaction.atomic():
        target, _ = _lock(target_id)
        if target.status != AccountStatus.DEACTIVATED:
            raise _refuse("invalid_state", "Only a removed person can be reinstated.")
        if target.email_verified_at is None:
            raise _refuse(
                "invalid_state", "This person never accepted the invitation. Invite them again instead."
            )
        target.status = AccountStatus.ACTIVE
        target.row_version += 1
        target.save(update_fields=["status", "row_version", "updated_at"])
        _grant(target, role, actor, reason)
        target.refresh_roles()
        _audit(actor, target, "reinstated", role=role, reason=reason, severity=Severity.SECURITY)
        _notify(target, "reinstated", role)
    return target


def revoke_sessions(actor: User, target_id: uuid.UUID | str, *, reason: str) -> int:
    _need(actor, Permission.USER_STATUS_CHANGE)
    reason = clean_reason(reason)
    with transaction.atomic():
        target, _ = _lock(target_id)
        _not_self(actor, target, "sign out everywhere with this tool for")
        count = services.revoke_sessions(target)
        _audit(actor, target, "sessions_revoked", reason=reason, sessions=count, severity=Severity.SECURITY)
    return count


def revoke_trusted_devices(actor: User, target_id: uuid.UUID | str, *, reason: str) -> int:
    """Forget every trusted device of a person: their next sign-in on any browser asks for a code."""
    _need(actor, Permission.USER_STATUS_CHANGE)
    reason = clean_reason(reason)
    with transaction.atomic():
        target, _ = _lock(target_id)
        count = trusted_devices.revoke_all(target, "admin_revoked", actor_id=actor.pk)
        _audit(
            actor, target, "trusted_devices_revoked", reason=reason, devices=count, severity=Severity.SECURITY
        )
    return count


def send_recovery(actor: User, target_id: uuid.UUID | str) -> User:
    """A password-reset link for an active person (the standard single-use, one-hour link)."""
    _need(actor, Permission.USER_STATUS_CHANGE)
    with transaction.atomic():
        target, _ = _lock(target_id)
        if target.status != AccountStatus.ACTIVE:
            raise _refuse("invalid_state", "A recovery link can only be sent to an active account.")
        last = (
            AuthToken.objects.filter(user=target, purpose=TokenPurpose.PASSWORD_RESET)
            .order_by("-created_at")
            .first()
        )
        if last is not None and timezone.now() - last.created_at < RESEND_GAP:
            raise StaffAdminError(
                "rate_limited",
                "A link was sent a moment ago. Wait a minute before sending another.",
                status=429,
            )
        token = tokens.issue(target, TokenPurpose.PASSWORD_RESET)
        outbox.enqueue(
            EmailKind.PASSWORD_RESET,
            target,
            target.email,
            token=token,
            context={"display_name": target.display_name},
        )
        _audit(actor, target, "recovery_sent", severity=Severity.SECURITY)
    return target


def sessions_of(user: User) -> list[UserSession]:
    return list(UserSession.objects.filter(user=user, revoked_at__isnull=True).order_by("-last_seen_at")[:10])
