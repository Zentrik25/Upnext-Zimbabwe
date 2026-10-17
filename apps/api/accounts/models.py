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


class TokenPurpose(models.TextChoices):
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"  # noqa: S105


class AuthToken(models.Model):
    """Single-use e-mail token (SECURITY_ARCHITECTURE §3.5). Only a selector is stored: the emailed value is
    `base64url(id).base64url(HMAC(key, id|purpose|user|expiry))`, so a database leak yields no usable
    token."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="auth_tokens")
    purpose = models.CharField(max_length=24, choices=TokenPurpose.choices)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    invalidated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "purpose"], name="authtoken_user_purpose_idx")]

    def __str__(self) -> str:
        return f"{self.purpose}:{self.pk}"


class UserSession(models.Model):
    """Metadata for "manage my sessions" (ERD §3.1). The payload stays in Django's session table. The key is
    kept
    so revocation is a keyed delete rather than a scan of every session; it is the same value Django's own
    session table already stores as its primary key, so this adds no new exposure (deviation from the ERD's
    hashed column, recorded in ADR-0019). Browser family and a truncated network prefix only (no raw IP)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="session_records")
    session_key = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    last_seen_at = models.DateTimeField(default=timezone.now)
    user_agent_summary = models.CharField(max_length=80, blank=True)
    ip_prefix = models.CharField(max_length=64, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "revoked_at"], name="usersession_user_idx")]

    def __str__(self) -> str:
        return str(self.pk)


class StaffMfaDevice(models.Model):
    """Time-based one-time-password device for staff (OQ-16 provisional default P3-07).

    The shared secret is *derived* (HMAC of a server key and this row's random nonce), never stored, in the
    same spirit as the e-mail tokens: a database leak alone does not reveal it. Rotating the key resets every
    device."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="mfa_device")
    nonce = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_step = models.BigIntegerField(default=0)  # replay protection: a code is accepted once

    def __str__(self) -> str:
        return str(self.user_id)


class StaffRecoveryCode(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(StaffMfaDevice, on_delete=models.CASCADE, related_name="recovery_codes")
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["device", "code_hash"], name="recovery_code_unique")]

    def __str__(self) -> str:
        return str(self.pk)
