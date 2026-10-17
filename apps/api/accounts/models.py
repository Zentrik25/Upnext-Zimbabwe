"""Identity (ERD §3.1): custom user model and additive staff role assignments."""

from __future__ import annotations

import uuid
from typing import Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models import Q
from django.utils import timezone

from access.registry import DEFAULT_REGISTRY, Role

from .fields import CaseInsensitiveEmailField


class AccountStatus(models.TextChoices):
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    RESTRICTED = "restricted"  # semantics OPEN (OQ-15)
    SUSPENDED = "suspended"
    DEACTIVATED = "deactivated"


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def create_user(self, email: str, password: str | None, display_name: str, **extra: Any) -> User:
        if not email:
            raise ValueError("An e-mail address is required.")
        user = self.model(email=self.normalize_email(email), display_name=display_name, **extra)
        user.set_password(password)
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    """Seekers and staff share one identity table; staff authority comes from role assignments."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = CaseInsensitiveEmailField(unique=True, max_length=254)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=24, choices=AccountStatus.choices, default=AccountStatus.PENDING_VERIFICATION
    )
    display_name = models.CharField(max_length=80)
    deletion_requested_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    row_version = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["display_name"]
    objects = UserManager()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="active") | Q(email_verified_at__isnull=False),
                name="user_active_requires_verified_email",
            ),
        ]

    def __str__(self) -> str:
        return str(self.pk)

    # --- Django integration -------------------------------------------------------
    @property
    def is_active(self) -> bool:  # type: ignore[override]
        return self.status == AccountStatus.ACTIVE

    @property
    def is_staff(self) -> bool:
        """Admin site access is derived from active role assignments, never set by hand."""
        return self.is_active and bool(self.active_roles())

    # --- Roles and permissions ----------------------------------------------------
    def active_roles(self) -> frozenset[str]:
        cached = getattr(self, "_active_roles_cache", None)
        if cached is None:
            cached = frozenset(
                StaffRoleAssignment.objects.filter(user=self, revoked_at__isnull=True).values_list(
                    "role", flat=True
                )
            )
            self._active_roles_cache = cached
        return cached

    def refresh_roles(self) -> None:
        self.__dict__.pop("_active_roles_cache", None)

    def has_permission_code(self, code: str) -> bool:
        return self.is_active and DEFAULT_REGISTRY.has(self.active_roles(), code)

    # The Django admin asks has_perm/has_module_perms. In Phase 1 the admin shell is read-only and
    # reserved for Administrators; there is deliberately no superuser bypass.
    def has_perm(self, perm: str, obj: object = None) -> bool:
        return (
            self.is_active
            and Role.ADMINISTRATOR in self.active_roles()
            and perm.rsplit(".", 1)[-1].startswith("view_")
        )

    def has_module_perms(self, app_label: str) -> bool:
        return self.is_active and Role.ADMINISTRATOR in self.active_roles()


class StaffRoleAssignment(models.Model):
    """Additive, auditable staff roles (revoked, never deleted)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="role_assignments")
    role = models.CharField(max_length=32, choices=[(r.value, r.value.title()) for r in Role])
    granted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    granted_at = models.DateTimeField(default=timezone.now)
    revoked_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    revoked_at = models.DateTimeField(null=True, blank=True)
    reason = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role"],
                condition=Q(revoked_at__isnull=True),
                name="staff_role_one_active_assignment",
            ),
            models.CheckConstraint(
                condition=Q(revoked_at__isnull=True) | Q(revoked_at__isnull=False, revoked_by__isnull=False),
                name="staff_role_revocation_has_actor",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.role}"
