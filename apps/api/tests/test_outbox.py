"""E-mail outbox, sender port and tokens (SECURITY_ARCHITECTURE §3.5 and §4)."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from accounts import tokens
from accounts.models import AccountStatus, TokenPurpose, User
from notifications import services as outbox
from notifications.models import EmailKind, EmailOutbox, OutboxStatus
from notifications.sender import DeliveryResult, DisabledSender, FakeSender, FileSender, get_sender

pytestmark = pytest.mark.django_db


def queue(user: User, kind: str = EmailKind.PASSWORD_RESET) -> EmailOutbox:
    token = tokens.issue(
        user,
        TokenPurpose.PASSWORD_RESET if kind == EmailKind.PASSWORD_RESET else TokenPurpose.EMAIL_VERIFICATION,
    )
    return outbox.enqueue(kind, user, user.email, token=token, context={"display_name": user.display_name})


def test_rows_store_no_secret_and_the_link_is_derived_at_send_time(make_user: Callable[..., User]) -> None:
    user = make_user()
    row = queue(user)
    assert set(row.payload) == {"display_name", "token_id"}
    message = outbox.build_message(row)
    assert message is not None and "/reset-password?token=" in message.body
    assert tokens.render(row.user.auth_tokens.get()) in message.body  # type: ignore[union-attr]
    assert message.subject == "Reset your NextJob Zimbabwe password"


def test_processing_sends_scrubs_the_payload_and_is_idempotent(make_user: Callable[..., User]) -> None:
    row = queue(make_user())
    sender = FakeSender()
    assert outbox.process_batch(sender=sender)["sent"] == 1
    assert outbox.process_batch(sender=sender)["sent"] == 0  # nothing left to claim
    row.refresh_from_db()
    assert row.status == OutboxStatus.SENT and row.payload == {} and row.sent_at is not None
    assert len(sender.sent) == 1 and sender.sent[0].idempotency_key == row.idempotency_key


def test_temporary_failures_back_off_and_become_dead_after_the_attempt_limit(
    make_user: Callable[..., User],
) -> None:
    row = queue(make_user())
    sender = FakeSender(outcomes=[DeliveryResult("temporary_failure", error_code="smtp_error")] * 10)
    for attempt in range(1, outbox.MAX_ATTEMPTS + 1):
        EmailOutbox.objects.filter(pk=row.pk).update(next_attempt_at=timezone.now() - timedelta(seconds=1))
        outbox.process_batch(sender=sender)
        row.refresh_from_db()
        assert row.attempts == attempt
        assert row.status == (OutboxStatus.DEAD if attempt == outbox.MAX_ATTEMPTS else OutboxStatus.FAILED)
    assert row.last_error == "smtp_error"
    EmailOutbox.objects.filter(pk=row.pk).update(next_attempt_at=timezone.now() - timedelta(seconds=1))
    assert outbox.process_batch(sender=sender) == {"sent": 0, "failed": 0, "dead": 0}  # dead rows stay dead


def test_failed_rows_wait_for_their_backoff(make_user: Callable[..., User]) -> None:
    row = queue(make_user())
    outbox.process_batch(sender=FakeSender(outcomes=[DeliveryResult("temporary_failure", error_code="x")]))
    row.refresh_from_db()
    assert row.next_attempt_at > timezone.now() + timedelta(seconds=20)
    assert outbox.process_batch(sender=FakeSender()) == {"sent": 0, "failed": 0, "dead": 0}


def test_permanent_failure_goes_straight_to_dead_and_retry_revives_it(make_user: Callable[..., User]) -> None:
    row = queue(make_user())
    outbox.process_batch(
        sender=FakeSender(outcomes=[DeliveryResult("permanent_failure", error_code="rejected")])
    )
    row.refresh_from_db()
    assert row.status == OutboxStatus.DEAD
    outbox.retry(row)
    assert outbox.process_batch(sender=FakeSender())["sent"] == 1


def test_a_row_stuck_in_sending_is_recovered(make_user: Callable[..., User]) -> None:
    row = queue(make_user())
    EmailOutbox.objects.filter(pk=row.pk).update(
        status=OutboxStatus.SENDING, locked_at=timezone.now() - timedelta(minutes=6), locked_by="crashed"
    )
    assert outbox.process_batch(sender=FakeSender())["sent"] == 1


def test_a_sender_exception_does_not_poison_the_batch(make_user: Callable[..., User]) -> None:
    class Exploding:
        def send(self, message: Any) -> DeliveryResult:
            raise RuntimeError("boom")

    row = queue(make_user())
    assert outbox.process_batch(sender=Exploding())["failed"] == 1
    row.refresh_from_db()
    assert row.status == OutboxStatus.FAILED and row.last_error == "sender_exception"


def test_a_row_whose_token_is_gone_is_not_sent(make_user: Callable[..., User]) -> None:
    row = queue(make_user())
    row.user.auth_tokens.all().delete()  # type: ignore[union-attr]
    sender = FakeSender()
    assert outbox.process_batch(sender=sender)["dead"] == 1 and sender.sent == []


def test_default_sender_sends_nothing_until_a_provider_is_chosen(settings: Any) -> None:
    settings.UPNEXT_EMAIL_BACKEND = "none"
    assert isinstance(get_sender(), DisabledSender)


def test_file_sender_and_last_email_command(
    tmp_path: Path, settings: Any, make_user: Callable[..., User]
) -> None:
    settings.UPNEXT_EMAIL_BACKEND = "file"
    settings.UPNEXT_EMAIL_FILE_DIR = str(tmp_path)
    assert isinstance(get_sender(), FileSender)
    queue(make_user(email="reader@example.org"))
    call_command("process_email_outbox")
    out = Path(tmp_path)
    assert len(list(out.glob("*.json"))) == 1
    from io import StringIO

    buffer = StringIO()
    call_command("last_email", "--to", "READER@example.org", stdout=buffer)
    record = json.loads(buffer.getvalue())
    assert record["kind"] == EmailKind.PASSWORD_RESET and "/reset-password?token=" in record["body"]
    with pytest.raises(CommandError):
        call_command("last_email", "--to", "nobody@example.org")
    settings.UPNEXT_EMAIL_BACKEND = "none"
    with pytest.raises(CommandError):
        call_command("last_email", "--to", "reader@example.org")


# --- tokens --------------------------------------------------------------------------------------------
def test_token_roundtrip_and_purpose_binding(make_user: Callable[..., User]) -> None:
    user = make_user(status=AccountStatus.ACTIVE)
    token = tokens.issue(user, TokenPurpose.PASSWORD_RESET)
    value = tokens.render(token)
    assert tokens.resolve(value, TokenPurpose.PASSWORD_RESET) == token
    assert tokens.resolve(value, TokenPurpose.EMAIL_VERIFICATION) is None
    assert len(value) < tokens.MAX_LENGTH
    assert tokens.resolve(value + "x", TokenPurpose.PASSWORD_RESET) is None
    assert tokens.resolve("a.b.c", TokenPurpose.PASSWORD_RESET) is None


def test_database_holds_no_usable_token(make_user: Callable[..., User]) -> None:
    user = make_user()
    token = tokens.issue(user, TokenPurpose.PASSWORD_RESET)
    value = tokens.render(token)
    columns = [f.name for f in type(token)._meta.get_fields()]
    assert not any("hash" in c or "secret" in c or c == "token" for c in columns)
    row_dump = json.dumps({c: str(getattr(token, c, "")) for c in columns})
    assert value.split(".")[1] not in row_dump


def test_two_workers_do_not_send_the_same_row_twice(make_user: Callable[..., User]) -> None:
    for _ in range(3):
        queue(make_user())
    first, second = FakeSender(), FakeSender()
    outbox.process_batch(sender=first, batch=2)
    outbox.process_batch(sender=second, batch=2)
    keys = [m.idempotency_key for m in first.sent + second.sent]
    assert len(keys) == len(set(keys)) == 3


def test_plain_text_mail_is_not_html_escaped(db: None, make_user: Any) -> None:
    from notifications import services as outbox_services
    from notifications.models import EmailKind

    user = make_user(display_name="Tom & Jerry <3")
    row = outbox_services.enqueue(
        EmailKind.PASSWORD_CHANGED_NOTICE, user, user.email, context={"display_name": user.display_name}
    )
    body = outbox_services.build_message(row).body  # type: ignore[union-attr]
    assert "Tom & Jerry <3" in body and "&amp;" not in body and "&lt;" not in body
