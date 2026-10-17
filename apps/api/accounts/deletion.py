"""Executing account deletions after the cooling-off period (OQ-09, provisional default P4-05).

What is removed: saved listings, session records and sessions, e-mail tokens, two-step devices, and the
address and name on the account and on its outbox rows. What remains: a tombstone user row (needed because
history rows point at users), audit rows with an opaque account number, and one completion e-mail that is
removed from the outbox like any other sent message. The address is released, so it can register again.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from audit import services as audit
from audit.models import ActorType, Severity
from notifications import services as outbox
from notifications.models import EmailKind, EmailOutbox, OutboxStatus
from opportunities.models import SavedOpportunity

from .models import AccountStatus, AuthToken, StaffMfaDevice, User, UserSession
from .services import revoke_sessions

logger = logging.getLogger("upnext.deletion")
TOMBSTONE_NAME = "Deleted account"
SCRUBBED_ADDRESS = "scrubbed@deleted.invalid"


def due_user_ids(now: datetime | None = None) -> list[uuid.UUID]:
    now = now or timezone.now()
    cutoff = now - timedelta(days=settings.UPNEXT_DELETION_COOLING_OFF_DAYS)
    return list(
        User.objects.filter(deletion_requested_at__lte=cutoff, deleted_at__isnull=True).values_list(
            "pk", flat=True
        )
    )


def execute(user_id: uuid.UUID, now: datetime | None = None) -> bool:
    """Delete one account if it is still due. Safe to repeat and to run from several workers."""
    now = now or timezone.now()
    cutoff = now - timedelta(days=settings.UPNEXT_DELETION_COOLING_OFF_DAYS)
    with transaction.atomic():
        user = User.objects.select_for_update().filter(pk=user_id).first()
        if (
            user is None
            or user.deleted_at is not None
            or user.deletion_requested_at is None
            or user.deletion_requested_at > cutoff
        ):
            return False
        if user.active_roles():
            # Staff access was granted after the request: an administrator must offboard the person first.
            logger.warning("deletion skipped: account holds staff roles", extra={"user_id": str(user.pk)})
            return False
        original_email, display_name = user.email, user.display_name
        revoke_sessions(user, now=now)
        UserSession.objects.filter(user=user).delete()
        AuthToken.objects.filter(user=user).delete()
        StaffMfaDevice.objects.filter(user=user).delete()
        SavedOpportunity.objects.filter(user=user).delete()
        # Mail still waiting for this person is cancelled; all their rows lose the address.
        EmailOutbox.objects.filter(
            user=user, status__in=[OutboxStatus.PENDING, OutboxStatus.FAILED, OutboxStatus.SENDING]
        ).update(status=OutboxStatus.DEAD, last_error="account deleted", locked_at=None, locked_by=None)
        EmailOutbox.objects.filter(user=user).update(to_address=SCRUBBED_ADDRESS, payload={}, user=None)
        user.email = f"deleted-{user.pk}@deleted.invalid"
        user.display_name = TOMBSTONE_NAME
        user.set_unusable_password()
        user.status = AccountStatus.DEACTIVATED
        user.email_verified_at = None
        user.last_login = None
        user.deleted_at = now
        user.save()
        outbox.enqueue(
            EmailKind.ACCOUNT_DELETION_COMPLETED,
            None,
            original_email,
            context={"display_name": display_name},
        )
        audit.record(
            action="account.deletion_executed",
            object_type="user",
            object_id=user.pk,
            actor_id=None,
            actor_type=ActorType.SYSTEM,
            severity=Severity.SECURITY,
        )
    return True


def execute_due(now: datetime | None = None) -> int:
    done = 0
    for user_id in due_user_ids(now):
        try:
            done += int(execute(user_id, now))
        except Exception:  # one failing account must not stop the others
            logger.exception("deletion failed", extra={"user_id": str(user_id)})
    return done
