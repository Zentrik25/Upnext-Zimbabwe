"""Outbox: enqueue inside the caller's transaction, process in a worker (SECURITY_ARCHITECTURE §4).

Delivery is at-least-once. Handlers never call the provider, so request latency and enumeration timing do
not depend on it.
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timedelta
from typing import Any, cast

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.template import Context
from django.template.loader import get_template
from django.utils import timezone

from accounts import tokens
from accounts.models import AuthToken, TokenPurpose, User

from . import suppression
from .htmlmail import render_html
from .models import EmailKind, EmailOutbox, OutboxStatus
from .sender import DeliveryResult, EmailMessage, EmailSender, get_sender

logger = logging.getLogger("upnext.email")

BACKOFF = [
    timedelta(seconds=30),
    timedelta(minutes=2),
    timedelta(minutes=10),
    timedelta(hours=1),
    timedelta(hours=6),
]
MAX_ATTEMPTS = 6  # PROPOSED, OQ-17
STUCK_AFTER = timedelta(minutes=5)

SUBJECTS = {
    EmailKind.EMAIL_VERIFICATION: "Confirm your NextJob Zimbabwe e-mail address",
    EmailKind.ACCOUNT_EXISTS: "You already have a NextJob Zimbabwe account",
    EmailKind.PASSWORD_RESET: "Reset your NextJob Zimbabwe password",
    EmailKind.PASSWORD_CHANGED_NOTICE: "Your NextJob Zimbabwe password was changed",
    EmailKind.ACCOUNT_DELETION_NOTICE: "We received your NextJob Zimbabwe account deletion request",
    EmailKind.ACCOUNT_DELETION_COMPLETED: "Your NextJob Zimbabwe account has been deleted",
    EmailKind.ACCOUNT_DELETION_CANCELLED: "Your NextJob Zimbabwe account deletion request was cancelled",
    EmailKind.EMAIL_CHANGE_CONFIRM: "Confirm your new NextJob Zimbabwe e-mail address",
    EmailKind.EMAIL_CHANGE_REQUESTED_NOTICE: "A change of your NextJob Zimbabwe e-mail address was requested",
    EmailKind.EMAIL_CHANGED_NOTICE: "Your NextJob Zimbabwe e-mail address was changed",
    EmailKind.JOB_ALERT: "New opportunities matching your NextJob Zimbabwe alert",
    EmailKind.EMPLOYER_CLAIM_RECEIVED: "We received your NextJob Zimbabwe organisation claim",
    EmailKind.EMPLOYER_CLAIM_APPROVED: "Your NextJob Zimbabwe organisation claim was approved",
    EmailKind.EMPLOYER_CLAIM_REJECTED: "Your NextJob Zimbabwe organisation claim was not approved",
    EmailKind.EMPLOYER_LISTING_SUBMITTED: "Your listing was submitted for review",
    EmailKind.EMPLOYER_LISTING_PUBLISHED: "Your listing is now published on NextJob Zimbabwe",
    EmailKind.EMPLOYER_LISTING_REJECTED: "Your listing needs changes before it can be published",
    EmailKind.EMPLOYER_LISTING_EXPIRING: "Your NextJob Zimbabwe listing closes soon",
    EmailKind.EMPLOYER_LISTING_EXPIRED: "Your NextJob Zimbabwe listing has closed",
}
_TOKEN_PATHS = {
    EmailKind.EMAIL_VERIFICATION: "/verify-email",
    EmailKind.PASSWORD_RESET: "/reset-password",
    EmailKind.EMAIL_CHANGE_CONFIRM: "/verify-email",
}


def enqueue(
    kind: str,
    user: User | None,
    to_address: str,
    *,
    token: AuthToken | None = None,
    idempotency_key: str | None = None,
    context: dict[str, Any] | None = None,
) -> EmailOutbox:
    """Insert an outbox row. Call inside the transaction that changes state (all or nothing)."""
    payload: dict[str, Any] = dict(context or {})
    if token is not None:
        payload["token_id"] = str(token.id)
    return EmailOutbox.objects.create(
        kind=kind,
        user=user,
        to_address=to_address,
        template_key=str(kind),
        payload=payload,
        idempotency_key=idempotency_key or f"{kind}:{uuid.uuid4().hex}",
    )


def enqueue_once(
    kind: str,
    user: User | None,
    to_address: str,
    *,
    idempotency_key: str,
    context: dict[str, Any] | None = None,
) -> EmailOutbox | None:
    """`enqueue` that is safe to repeat: the key is unique, so a second call with the same key writes
    nothing and returns None. The insert runs in a savepoint, so losing the race to a concurrent caller
    does not abort the caller's transaction."""
    try:
        with transaction.atomic():
            return enqueue(kind, user, to_address, idempotency_key=idempotency_key, context=context)
    except IntegrityError:
        return None


def _link(row: EmailOutbox) -> str | None:
    token_id = row.payload.get("token_id")
    path = _TOKEN_PATHS.get(EmailKind(row.kind))
    if not token_id or path is None:
        return None
    purpose = {
        EmailKind.EMAIL_VERIFICATION: TokenPurpose.EMAIL_VERIFICATION,
        EmailKind.EMAIL_CHANGE_CONFIRM: TokenPurpose.EMAIL_CHANGE,
    }.get(EmailKind(row.kind), TokenPurpose.PASSWORD_RESET)
    token = AuthToken.objects.filter(pk=token_id, purpose=purpose).first()
    if token is None:
        return None
    extra = "&change=1" if row.kind == EmailKind.EMAIL_CHANGE_CONFIRM else ""
    return f"{settings.UPNEXT_PUBLIC_BASE_URL.rstrip('/')}{path}?token={tokens.render(token)}{extra}"


def build_message(row: EmailOutbox) -> EmailMessage | None:
    """Render at send time. Returns None when the link's token no longer exists (nothing to send)."""
    link = _link(row)
    if row.kind in _TOKEN_PATHS and link is None:
        return None
    context = {**row.payload, "link": link, "base_url": settings.UPNEXT_PUBLIC_BASE_URL.rstrip("/")}
    headers: tuple[tuple[str, str], ...] = ()
    if row.kind == EmailKind.JOB_ALERT:
        from alerts import messages  # local import: alerts depends on this module

        extra = messages.context_for(row)
        if extra is None:
            return None
        context.update(extra)
        headers = messages.headers_for(row)
    # Plain text: nothing is HTML-escaped (a link's "&" or a name such as "Tom & Jerry" must arrive as typed).
    template = get_template(f"notifications/{row.template_key}_v{row.template_version}.txt")
    body = str(cast(Any, template).template.render(Context(context, autoescape=False)))
    subject = str(row.payload.get("subject") or SUBJECTS[EmailKind(row.kind)])
    return EmailMessage(
        idempotency_key=row.idempotency_key,
        to=row.to_address,
        subject=subject,
        body=body,
        kind=row.kind,
        html=render_html(subject=subject, body=body),
        headers=headers,
    )


def _claim(worker: str, now: datetime, batch: int) -> list[EmailOutbox]:
    with transaction.atomic():
        EmailOutbox.objects.filter(status=OutboxStatus.SENDING, locked_at__lt=now - STUCK_AFTER).update(
            status=OutboxStatus.FAILED, locked_at=None, locked_by=None, next_attempt_at=now
        )
        rows = list(
            EmailOutbox.objects.select_for_update(skip_locked=True)
            .filter(status__in=[OutboxStatus.PENDING, OutboxStatus.FAILED], next_attempt_at__lte=now)
            .order_by("next_attempt_at")[:batch]
        )
        ids = [r.pk for r in rows]
        EmailOutbox.objects.filter(pk__in=ids).update(
            status=OutboxStatus.SENDING, locked_at=now, locked_by=worker, attempts=F("attempts") + 1
        )
    return list(EmailOutbox.objects.filter(pk__in=ids))


def _finish(row: EmailOutbox, result: DeliveryResult, now: datetime) -> None:
    if result.outcome == "sent":
        row.status, row.sent_at = OutboxStatus.SENT, now
        row.provider_message_id = result.provider_message_id
        row.payload = {}  # scrub variables after sending (ERD §3.9)
        row.last_error = None
    elif result.outcome == "permanent_failure" or row.attempts >= MAX_ATTEMPTS:
        row.status, row.last_error = OutboxStatus.DEAD, (result.error_code or "failed")[:300]
        if result.error_code == "recipient_refused":
            suppression.suppress(row.to_address, "bounce")
    else:
        delay = BACKOFF[min(row.attempts - 1, len(BACKOFF) - 1)]
        row.status, row.last_error = OutboxStatus.FAILED, (result.error_code or "failed")[:300]
        row.next_attempt_at = now + delay * random.uniform(0.8, 1.2)  # noqa: S311 - jitter, not security
    row.locked_at = row.locked_by = None
    row.save()


def process_batch(
    *, worker: str = "worker", batch: int = 20, sender: EmailSender | None = None
) -> dict[str, int]:
    """Claim due rows, send them, record the outcome. Safe to run from several processes."""
    sender = sender or get_sender()
    now = timezone.now()
    counts = {"sent": 0, "failed": 0, "dead": 0}
    for row in _claim(worker, now, batch):
        message = build_message(row)
        if message is not None and suppression.is_suppressed(row.to_address):
            _finish(row, DeliveryResult("permanent_failure", error_code="suppressed"), now)
        elif message is None:
            _finish(row, DeliveryResult("permanent_failure", error_code="token_missing"), now)
        else:
            try:
                result = sender.send(message)
            except Exception:  # a sender bug must not poison the batch
                logger.exception("sender raised", extra={"event": "email.sender_error"})
                result = DeliveryResult("temporary_failure", error_code="sender_exception")
            _finish(row, result, timezone.now())
        counts[
            "sent"
            if row.status == OutboxStatus.SENT
            else "dead"
            if row.status == OutboxStatus.DEAD
            else "failed"
        ] += 1
    return counts


def retry(row: EmailOutbox) -> None:
    """Administrator retry of a dead or failed row."""
    row.status, row.attempts, row.next_attempt_at = OutboxStatus.PENDING, 0, timezone.now()
    row.save(update_fields=["status", "attempts", "next_attempt_at"])


ALERT_OLDEST_SECONDS = 10 * 60  # PROPOSED (SECURITY_ARCHITECTURE §4.3)


def status_summary(now: datetime | None = None) -> dict[str, Any]:
    """Counts per status, age of the oldest waiting message, and the conditions worth alerting on."""
    from django.db.models import Count, Min

    now = now or timezone.now()
    counts = {s.value: 0 for s in OutboxStatus}
    counts.update(dict(EmailOutbox.objects.values_list("status").annotate(n=Count("pk"))))
    oldest = EmailOutbox.objects.filter(status__in=[OutboxStatus.PENDING, OutboxStatus.FAILED]).aggregate(
        first=Min("created_at")
    )["first"]
    age = (now - oldest).total_seconds() if oldest else None
    alerts = []
    if age is not None and age > ALERT_OLDEST_SECONDS:
        alerts.append(f"oldest waiting message is {int(age)} s old")
    if counts[OutboxStatus.DEAD]:
        alerts.append(f"{counts[OutboxStatus.DEAD]} dead message(s)")
    return {"counts": counts, "oldest_waiting_seconds": age, "alerts": alerts}
