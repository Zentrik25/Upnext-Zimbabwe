"""Account use cases: registration, e-mail verification, password reset and change, sessions, deletion.

Everything that must not reveal whether an address is registered (register, resend, reset request) returns
nothing and does comparable work on every path. State changes and their outbox e-mails share a transaction.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import password_validation
from django.contrib.auth.hashers import make_password
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from audit import services as audit
from audit.models import Severity
from notifications import services as outbox
from notifications import verification
from notifications.models import EmailKind

from . import tokens
from .models import AccountStatus, TokenPurpose, User, UserSession

_LOCAL_PART = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$")
_URLISH = re.compile(r"(https?:|www\.|@|\.[a-z]{2,}/)", re.IGNORECASE)


class AccountError(Exception):
    """A rule failed; `fields` maps a field name to messages (rendered as a 400 `validation_failed`)."""

    def __init__(self, fields: dict[str, list[str]]) -> None:
        super().__init__(str(fields))
        self.fields = fields


def normalise_password(password: str) -> str:
    """NFKC-normalise before hashing and checking (VALIDATION_SPEC §2)."""
    return unicodedata.normalize("NFKC", password)


def normalise_email(email: str) -> str:
    return email.strip()


def email_problem(email: str) -> str | None:
    local, _, domain = email.partition("@")
    if not _LOCAL_PART.match(local) or ".." in local or local.startswith(".") or local.endswith("."):
        return "Enter an e-mail address without quotes, comments or a display name."
    if len(email) > 254 or not domain or " " in email:
        return "Enter a valid e-mail address."
    return None


def display_name_problem(name: str) -> str | None:
    if not 1 <= len(name) <= 80:
        return "Enter a name of 1 to 80 characters."
    if any(unicodedata.category(c).startswith("C") for c in name):
        return "The name cannot contain control characters."
    if _URLISH.search(name):
        return "The name cannot contain web addresses or e-mail addresses."
    return None


def password_problems(password: str, *, email: str, display_name: str) -> list[str]:
    password = normalise_password(password)
    if not 10 <= len(password) <= 128:
        return ["Use 10 to 128 characters."]
    probe = User(email=email, display_name=display_name)
    try:
        password_validation.validate_password(password, probe)
    except DjangoValidationError as exc:
        return list(exc.messages)
    return []


def _ensure(fields: dict[str, list[str]]) -> None:
    if any(fields.values()):
        raise AccountError({k: v for k, v in fields.items() if v})


def _dummy_hash_work(password: str) -> None:
    """Equalise timing between the new-account and existing-account paths of registration."""
    make_password(normalise_password(password))


# --- registration and verification -------------------------------------------------------------------
def register(*, email: str, password: str, display_name: str) -> None:
    """Indistinguishable from the caller's side; validation errors concern only the submitted values."""
    email, display_name = normalise_email(email), display_name.strip()
    _ensure(
        {
            "email": [m] if (m := email_problem(email)) else [],
            "display_name": [m] if (m := display_name_problem(display_name)) else [],
            "password": password_problems(password, email=email, display_name=display_name),
        }
    )
    try:
        with transaction.atomic():
            if User.objects.filter(email=email).exists():
                raise IntegrityError("exists")
            user = User.objects.create_user(
                email,
                normalise_password(password),
                display_name,
                status=AccountStatus.PENDING_VERIFICATION,
            )
            token = tokens.issue(user, TokenPurpose.EMAIL_VERIFICATION)
            outbox.enqueue(
                EmailKind.EMAIL_VERIFICATION,
                user,
                user.email,
                token=token,
                context={"display_name": user.display_name},
            )
            audit.record(
                action="account.register",
                object_type="user",
                object_id=user.pk,
                actor_id=user.pk,
                severity=Severity.SECURITY,
            )
    except IntegrityError:
        _dummy_hash_work(password)
        outbox.enqueue(EmailKind.ACCOUNT_EXISTS, None, email)


def verify_email(token_value: str) -> bool:
    now = timezone.now()
    with transaction.atomic():
        token = tokens.resolve(token_value, TokenPurpose.EMAIL_VERIFICATION, now=now)
        if token is None:
            return _confirm_email_change(token_value, now)
        user = User.objects.select_for_update().get(pk=token.user_id)
        token.used_at = now
        token.save(update_fields=["used_at"])
        if user.status == AccountStatus.PENDING_VERIFICATION:
            user.status, user.email_verified_at = AccountStatus.ACTIVE, now
            user.save(update_fields=["status", "email_verified_at", "updated_at"])
            audit.record(
                action="account.email_verified",
                object_type="user",
                object_id=user.pk,
                actor_id=user.pk,
                severity=Severity.SECURITY,
            )
    return True


class EmailChangeUnavailable(Exception):
    """Delivery has not been verified (P5-07), so a confirmation link cannot be relied on to arrive."""


def email_change_available() -> bool:
    return verification.delivery_verified()


def request_email_change(user: User, new_email: str) -> None:
    """Ask to move the account to `new_email`. The caller has already re-checked the password.

    Nothing changes until the link sent to the NEW address is used. The old address is told. The answer does
    not reveal whether the new address already belongs to someone: that person gets the usual "you already
    have an account" message instead of a link.
    """
    if not email_change_available():
        raise EmailChangeUnavailable
    new_email = normalise_email(new_email)
    problem = email_problem(new_email)
    if problem:
        raise AccountError({"new_email": [problem]})
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if locked.active_roles():
            raise StaffAccountError
        if locked.status != AccountStatus.ACTIVE:
            raise AccountError({"new_email": ["Confirm your current address first."]})
        if new_email.casefold() == locked.email.casefold():
            raise AccountError({"new_email": ["This is already your address."]})
        if User.objects.filter(email=new_email).exists():
            outbox.enqueue(EmailKind.ACCOUNT_EXISTS, None, new_email)
        else:
            token = tokens.issue(locked, TokenPurpose.EMAIL_CHANGE, new_email=new_email)
            outbox.enqueue(
                EmailKind.EMAIL_CHANGE_CONFIRM,
                locked,
                new_email,
                token=token,
                context={"display_name": locked.display_name},
            )
        outbox.enqueue(
            EmailKind.EMAIL_CHANGE_REQUESTED_NOTICE,
            locked,
            locked.email,
            context={"display_name": locked.display_name},
        )
        audit.record(
            action="account.email_change_requested",
            object_type="user",
            object_id=locked.pk,
            actor_id=locked.pk,
            severity=Severity.SECURITY,
        )


def _confirm_email_change(token_value: str, now: datetime) -> bool:
    token = tokens.resolve(token_value, TokenPurpose.EMAIL_CHANGE, now=now)
    if token is None or not token.new_email:
        return False
    user = User.objects.select_for_update().get(pk=token.user_id)
    new_email, old_email = token.new_email, user.email
    token.used_at = now
    token.save(update_fields=["used_at"])
    if (
        user.status != AccountStatus.ACTIVE
        or User.objects.filter(email=new_email).exclude(pk=user.pk).exists()
    ):
        return False  # taken in the meantime, or the account is no longer usable: same answer as a bad link
    user.email, user.email_verified_at = new_email, now
    user.save(update_fields=["email", "email_verified_at", "updated_at"])
    outbox.enqueue(
        EmailKind.EMAIL_CHANGED_NOTICE, user, old_email, context={"display_name": user.display_name}
    )
    audit.record(
        action="account.email_changed",
        object_type="user",
        object_id=user.pk,
        actor_id=user.pk,
        severity=Severity.SECURITY,
    )
    return True


class _Rollback(Exception):
    pass


def _decoy_work(kind: str) -> None:
    """Do roughly the writes a real request would (then roll them back) so that unknown addresses do not
    answer measurably faster. Comparable, not identical: the answer's content carries the guarantee."""
    try:
        with transaction.atomic():
            outbox.enqueue(kind, None, "decoy@invalid.example")
            audit.record(
                action="account.decoy",
                object_type="user",
                object_id=None,
                actor_id=None,
                severity=Severity.INFO,
            )
            raise _Rollback
    except _Rollback:
        pass


def resend_verification(email: str) -> None:
    user = User.objects.filter(email=normalise_email(email)).first()
    if user is None or user.status != AccountStatus.PENDING_VERIFICATION:
        _decoy_work(EmailKind.EMAIL_VERIFICATION)
        return
    with transaction.atomic():
        token = tokens.issue(user, TokenPurpose.EMAIL_VERIFICATION)
        outbox.enqueue(
            EmailKind.EMAIL_VERIFICATION,
            user,
            user.email,
            token=token,
            context={"display_name": user.display_name},
        )


# --- passwords ---------------------------------------------------------------------------------------
def request_password_reset(email: str) -> None:
    user = User.objects.filter(email=normalise_email(email)).first()
    if user is not None and user.status == AccountStatus.PENDING_VERIFICATION:
        # Someone may have registered this address before its owner: confirming it comes first, after which
        # the owner can reset the password (otherwise a squatted address could never be recovered).
        resend_verification(user.email)
        return
    if user is None or user.status != AccountStatus.ACTIVE:
        _decoy_work(EmailKind.PASSWORD_RESET)
        return
    with transaction.atomic():
        token = tokens.issue(user, TokenPurpose.PASSWORD_RESET)
        outbox.enqueue(
            EmailKind.PASSWORD_RESET,
            user,
            user.email,
            token=token,
            context={"display_name": user.display_name},
        )
        audit.record(
            action="account.password_reset_requested",
            object_type="user",
            object_id=user.pk,
            actor_id=None,
            severity=Severity.SECURITY,
        )


def revoke_sessions(user: User, *, except_key: str | None = None, now: datetime | None = None) -> int:
    """Destroy every session of the user (optionally keeping one) and mark the metadata rows revoked."""
    now = now or timezone.now()
    records = UserSession.objects.filter(user=user, revoked_at__isnull=True)
    if except_key:
        records = records.exclude(session_key=except_key)
    keys = list(records.values_list("session_key", flat=True))
    records.update(revoked_at=now)
    Session.objects.filter(session_key__in=keys).delete()
    return len(keys)


def confirm_password_reset(token_value: str, new_password: str) -> bool:
    now = timezone.now()
    with transaction.atomic():
        token = tokens.resolve(token_value, TokenPurpose.PASSWORD_RESET, now=now)
        if token is None:
            return False
        user = User.objects.select_for_update().get(pk=token.user_id)
        _ensure(
            {
                "new_password": password_problems(
                    new_password, email=user.email, display_name=user.display_name
                )
            }
        )
        user.set_password(normalise_password(new_password))
        user.save(update_fields=["password", "updated_at"])
        token.used_at = now
        token.save(update_fields=["used_at"])
        revoke_sessions(user, now=now)
        outbox.enqueue(
            EmailKind.PASSWORD_CHANGED_NOTICE, user, user.email, context={"display_name": user.display_name}
        )
        audit.record(
            action="account.password_reset",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
    return True


def change_password(user: User, *, current_password: str, new_password: str, session_key: str | None) -> bool:
    """False when the current password is wrong. Other sessions are revoked on success."""
    if not user.check_password(normalise_password(current_password)):
        return False
    _ensure(
        {"new_password": password_problems(new_password, email=user.email, display_name=user.display_name)}
    )
    with transaction.atomic():
        user.set_password(normalise_password(new_password))
        user.save(update_fields=["password", "updated_at"])
        revoke_sessions(user, except_key=session_key)
        outbox.enqueue(
            EmailKind.PASSWORD_CHANGED_NOTICE, user, user.email, context={"display_name": user.display_name}
        )
        audit.record(
            action="account.password_changed",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
    return True


# --- sessions and deletion ----------------------------------------------------------------------------
def revoke_session(user: User, session_id: Any) -> bool:
    record = UserSession.objects.filter(pk=session_id, user=user, revoked_at__isnull=True).first()
    if record is None:
        return False
    with transaction.atomic():
        record.revoked_at = timezone.now()
        record.save(update_fields=["revoked_at"])
        Session.objects.filter(session_key=record.session_key).delete()
        audit.record(
            action="account.session_revoked",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
    return True


class StaffAccountError(Exception):
    """Accounts holding staff roles are offboarded by an administrator before they can be deleted."""


def scheduled_for(user: User) -> datetime | None:
    if user.deletion_requested_at is None:
        return None
    return user.deletion_requested_at + timedelta(days=settings.UPNEXT_DELETION_COOLING_OFF_DAYS)


def request_deletion(user: User) -> tuple[datetime, datetime]:
    """Record the request and start the cooling-off period. Returns (requested, scheduled). Nothing is deleted
    until the period ends and the worker runs `deletion.execute_due` (P4-05). Repeating the request changes
    nothing."""
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if locked.active_roles():
            raise StaffAccountError
        if locked.deletion_requested_at is None:
            locked.deletion_requested_at = timezone.now()
            locked.save(update_fields=["deletion_requested_at", "updated_at"])
            due = scheduled_for(locked)
            assert due is not None
            outbox.enqueue(
                EmailKind.ACCOUNT_DELETION_NOTICE,
                locked,
                locked.email,
                context={
                    "display_name": locked.display_name,
                    "scheduled_date": due.strftime("%d %B %Y"),
                    "days": settings.UPNEXT_DELETION_COOLING_OFF_DAYS,
                },
            )
            audit.record(
                action="account.deletion_requested",
                object_type="user",
                object_id=locked.pk,
                actor_id=locked.pk,
                severity=Severity.SECURITY,
                changes={"scheduled_for": due.isoformat()},
            )
        user.deletion_requested_at = locked.deletion_requested_at
        assert locked.deletion_requested_at is not None
        due = scheduled_for(locked)
        assert due is not None
        return locked.deletion_requested_at, due


def cancel_deletion(user: User) -> bool:
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if locked.deletion_requested_at is None or locked.deleted_at is not None:
            return False
        locked.deletion_requested_at = None
        locked.save(update_fields=["deletion_requested_at", "updated_at"])
        audit.record(
            action="account.deletion_cancelled",
            object_type="user",
            object_id=locked.pk,
            actor_id=locked.pk,
            severity=Severity.SECURITY,
        )
        outbox.enqueue(
            EmailKind.ACCOUNT_DELETION_CANCELLED,
            locked,
            locked.email,
            context={"display_name": locked.display_name},
        )
        user.deletion_requested_at = None
    return True


__all__ = [
    "AccountError",
    "StaffAccountError",
    "cancel_deletion",
    "change_password",
    "confirm_password_reset",
    "display_name_problem",
    "email_problem",
    "normalise_email",
    "normalise_password",
    "password_problems",
    "register",
    "request_deletion",
    "request_password_reset",
    "resend_verification",
    "revoke_session",
    "revoke_sessions",
    "scheduled_for",
    "verify_email",
]
