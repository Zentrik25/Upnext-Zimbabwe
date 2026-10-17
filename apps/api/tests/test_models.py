"""DB-01 and identity model invariants (ERD §3.1)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from io import StringIO

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from accounts.models import AccountStatus, StaffRoleAssignment, User

pytestmark = pytest.mark.django_db


def test_user_primary_key_is_uuid(make_user: Callable[..., User]) -> None:
    assert isinstance(make_user().pk, uuid.UUID)


def test_db_01_primary_keys_are_immutable(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("editor",))
    with pytest.raises(Exception, match="immutable"), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("UPDATE accounts_user SET id = %s WHERE id = %s", [str(uuid.uuid4()), str(user.pk)])
    assignment = StaffRoleAssignment.objects.get(user=user)
    with pytest.raises(Exception, match="immutable"), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            "UPDATE accounts_staffroleassignment SET id = %s WHERE id = %s",
            [str(uuid.uuid4()), str(assignment.pk)],
        )


def test_email_is_case_insensitively_unique(make_user: Callable[..., User]) -> None:
    make_user(email="Person@Example.org")
    with pytest.raises((IntegrityError, ValidationError)), transaction.atomic():
        make_user(email="person@example.ORG")
    assert User.objects.filter(email="PERSON@example.org").count() == 1


def test_active_account_requires_verified_email(make_user: Callable[..., User]) -> None:
    user = make_user(status=AccountStatus.PENDING_VERIFICATION)
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.filter(pk=user.pk).update(status=AccountStatus.ACTIVE)


def test_one_active_assignment_per_role_but_revoked_ones_can_repeat(make_user: Callable[..., User]) -> None:
    user = make_user()
    first = StaffRoleAssignment.objects.create(user=user, role="editor", reason="x")
    with pytest.raises(IntegrityError), transaction.atomic():
        StaffRoleAssignment.objects.create(user=user, role="editor", reason="again")
    first.revoked_at, first.revoked_by = timezone.now(), user
    first.save()
    StaffRoleAssignment.objects.create(user=user, role="editor", reason="re-grant")


def test_revocation_requires_an_actor(make_user: Callable[..., User]) -> None:
    user = make_user()
    with pytest.raises(IntegrityError), transaction.atomic():
        StaffRoleAssignment.objects.create(user=user, role="editor", reason="x", revoked_at=timezone.now())


def test_roles_are_derived_from_active_assignments(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("contributor", "editor"))
    assert user.active_roles() == {"contributor", "editor"}
    assert user.is_staff
    StaffRoleAssignment.objects.filter(user=user, role="editor").update(
        revoked_at=timezone.now(), revoked_by=user
    )
    user.refresh_roles()
    assert user.active_roles() == {"contributor"}


def test_no_superuser_bypass_and_admin_is_read_only(make_user: Callable[..., User]) -> None:
    seeker, editor, admin = make_user(), make_user(roles=("editor",)), make_user(roles=("administrator",))
    assert not seeker.is_staff and not seeker.has_module_perms("accounts")
    assert not editor.has_perm("accounts.view_user")
    assert admin.has_perm("accounts.view_user") and not admin.has_perm("accounts.change_user")
    assert not admin.has_perm("accounts.delete_user")


def test_suspended_staff_lose_staff_access(make_user: Callable[..., User]) -> None:
    user = make_user(roles=("administrator",), status=AccountStatus.SUSPENDED)
    assert not user.is_staff and not user.has_perm("accounts.view_user")


def test_create_staff_user_command(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPNEXT_BOOTSTRAP_PASSWORD", "a long bootstrap password 1")
    out = StringIO()
    call_command(
        "create_staff_user",
        "--email=boot@example.org",
        "--display-name=Boot",
        "--role=administrator",
        stdout=out,
    )
    user = User.objects.get(email="boot@example.org")
    assert user.is_active and user.active_roles() == {"administrator"}
    assert user.password.startswith(("md5$", "argon2$"))  # hashed, never stored in plain text
