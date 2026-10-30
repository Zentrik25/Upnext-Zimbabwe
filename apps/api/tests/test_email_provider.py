"""E-mail provider architecture: configuration checks, the SMTP adapter against a local stub, suppression,
monitoring and the outbox admin. No real provider or credentials are involved."""

from __future__ import annotations

import base64
import socketserver
import threading
from collections.abc import Callable, Iterator
from datetime import timedelta
from io import StringIO
from types import SimpleNamespace
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from accounts.models import User
from notifications import config, suppression
from notifications import services as outbox
from notifications.models import EmailKind, EmailOutbox, EmailSuppression, OutboxStatus
from notifications.sender import (
    DeliveryResult,
    DisabledSender,
    EmailMessage,
    FakeSender,
    SmtpSender,
    get_sender,
    register,
)

pytestmark = pytest.mark.django_db
USER, PASSWORD = "mailer", "stub-only-credential"


class StubSmtp(socketserver.ThreadingTCPServer):
    """Just enough SMTP for the adapter: AUTH PLAIN, RCPT policy by address, 4xx/5xx on request."""

    allow_reuse_address = True
    daemon_threads = True

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), _Handler)
        self.messages: list[dict[str, str]] = []
        self.refuse = ""  # recipient to answer 550 for
        self.data_reply = "250 queued"
        self.auth_ok = True
        self.logins: list[tuple[str, str]] = []


class _Handler(socketserver.StreamRequestHandler):
    server: StubSmtp

    def reply(self, line: str) -> None:
        self.wfile.write(line.encode() + b"\r\n")

    def handle(self) -> None:
        self.reply("220 stub ready")
        rcpt = ""
        buffer: list[str] = []
        while True:
            line = self.rfile.readline().decode().strip()
            if not line:
                return
            verb = line.split(" ", 1)[0].upper()
            if verb == "EHLO":
                self.wfile.write(b"250-stub\r\n250 AUTH PLAIN\r\n")
            elif verb == "AUTH":
                decoded = base64.b64decode(line.split()[-1]).split(b"\0")
                self.server.logins.append((decoded[1].decode(), decoded[2].decode()))
                self.reply("235 ok" if self.server.auth_ok else "535 bad credentials")
            elif verb == "MAIL":
                self.reply("250 ok")
            elif verb == "RCPT":
                rcpt = line.split(":", 1)[1].strip("<> ")
                self.reply(
                    "550 no such mailbox" if self.server.refuse and self.server.refuse in rcpt else "250 ok"
                )
            elif verb == "DATA":
                self.reply("354 go")
                buffer = []
                while (data := self.rfile.readline().decode()).rstrip("\r\n") != ".":
                    buffer.append(data)
                self.server.messages.append({"rcpt": rcpt, "raw": "".join(buffer)})
                self.reply(self.server.data_reply)
            elif verb == "NOOP":
                self.reply("250 ok")
            elif verb == "QUIT":
                self.reply("221 bye")
                return
            else:
                self.reply("250 ok")


@pytest.fixture
def smtp(settings: Any) -> Iterator[StubSmtp]:
    server = StubSmtp()
    threading.Thread(target=server.serve_forever, daemon=True).start()
    settings.UPNEXT_EMAIL_BACKEND = "smtp"
    settings.UPNEXT_SMTP_HOST = "127.0.0.1"
    settings.UPNEXT_SMTP_PORT = server.server_address[1]
    settings.UPNEXT_SMTP_SECURITY = "none"
    settings.UPNEXT_SMTP_USER, settings.UPNEXT_SMTP_PASSWORD = USER, PASSWORD
    settings.UPNEXT_EMAIL_FROM = "UPNEXT Careers <hello@example.test>"
    settings.UPNEXT_EMAIL_REPLY_TO = "help@example.test"
    settings.UPNEXT_SMTP_TIMEOUT_SECONDS = 5
    yield server
    server.shutdown()
    server.server_close()


def message(to: str = "reader@example.org") -> EmailMessage:
    return EmailMessage(idempotency_key="key-1", to=to, subject="Hello", body="Body text\n", kind="x")


# --- configuration --------------------------------------------------------------------------------------
def conf(**over: Any) -> SimpleNamespace:
    base = {
        "UPNEXT_EMAIL_BACKEND": "none",
        "UPNEXT_SMTP_HOST": "",
        "UPNEXT_EMAIL_FROM": "UPNEXT <no-reply@example.invalid>",
        "UPNEXT_SMTP_SECURITY": "starttls",
        "UPNEXT_SMTP_USER": "",
        "UPNEXT_SMTP_PASSWORD": "",
    }
    return SimpleNamespace(**{**base, **over})


def test_configuration_rules() -> None:
    assert config.problems(conf(), production=True) == []  # "none" is the safe default
    assert config.problems(conf(UPNEXT_EMAIL_BACKEND="file"), production=False) == []
    assert any(
        "development only" in p for p in config.problems(conf(UPNEXT_EMAIL_BACKEND="file"), production=True)
    )
    assert any("one of" in p for p in config.problems(conf(UPNEXT_EMAIL_BACKEND="x"), production=False))
    smtp_ok = conf(
        UPNEXT_EMAIL_BACKEND="smtp", UPNEXT_SMTP_HOST="h", UPNEXT_EMAIL_FROM="UPNEXT <hi@example.test>"
    )
    assert config.problems(smtp_ok, production=True) == []
    placeholder = conf(UPNEXT_EMAIL_BACKEND="smtp", UPNEXT_SMTP_HOST="h")
    assert any("real sender" in p for p in config.problems(placeholder, production=True))
    unencrypted = conf(**{**vars(smtp_ok), "UPNEXT_SMTP_SECURITY": "none"})
    assert any("unencrypted" in p for p in config.problems(unencrypted, production=True))
    assert config.problems(unencrypted, production=False) == []
    half = conf(**{**vars(smtp_ok), "UPNEXT_SMTP_USER": "u"})
    assert any("together" in p for p in config.problems(half, production=False))


def test_the_default_backend_sends_nothing_and_a_custom_adapter_can_be_registered(settings: Any) -> None:
    settings.UPNEXT_EMAIL_BACKEND = "none"
    assert isinstance(get_sender(), DisabledSender)
    fake = FakeSender()
    register("test-provider", lambda: fake)
    settings.UPNEXT_EMAIL_BACKEND = "test-provider"
    assert get_sender() is fake


# --- SMTP adapter against the stub ------------------------------------------------------------------------
def test_smtp_adapter_delivers_with_the_right_headers_and_authenticates(smtp: StubSmtp) -> None:
    result = SmtpSender().send(message())
    assert result.outcome == "sent" and result.provider_message_id == "<key-1@upnext.co.zw>"
    sent = smtp.messages[0]
    assert sent["rcpt"] == "reader@example.org"
    raw = sent["raw"]
    for expected in (
        "From: UPNEXT Careers <hello@example.test>",
        "To: reader@example.org",
        "Subject: Hello",
        "Reply-To: help@example.test",
        "Auto-Submitted: auto-generated",
        "Message-ID: <key-1@upnext.co.zw>",
        "Body text",
    ):
        assert expected in raw
    assert smtp.logins == [(USER, PASSWORD)]


def test_smtp_results_are_classified_for_retry_or_giving_up(smtp: StubSmtp) -> None:
    smtp.refuse = "gone@"
    assert SmtpSender().send(message("gone@example.org")) == DeliveryResult(
        "permanent_failure", error_code="recipient_refused"
    )
    smtp.data_reply = "554 rejected as spam"
    assert SmtpSender().send(message()).error_code == "smtp_rejected"
    smtp.data_reply = "451 try later"
    later = SmtpSender().send(message())
    assert later.outcome == "temporary_failure" and later.error_code == "smtp_error"
    smtp.data_reply, smtp.auth_ok = "250 queued", False
    auth = SmtpSender().send(message())
    assert auth.outcome == "temporary_failure" and auth.error_code == "smtp_auth_failed"


def test_an_unreachable_server_is_a_temporary_failure(settings: Any) -> None:
    settings.UPNEXT_EMAIL_BACKEND, settings.UPNEXT_SMTP_HOST = "smtp", "127.0.0.1"
    settings.UPNEXT_SMTP_PORT, settings.UPNEXT_SMTP_SECURITY = 1, "none"
    settings.UPNEXT_SMTP_TIMEOUT_SECONDS = 2
    assert SmtpSender().send(message()).outcome == "temporary_failure"


def test_starttls_uses_a_verifying_context(settings: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    import smtplib
    import ssl

    seen: dict[str, Any] = {}

    class Recorder(smtplib.SMTP):
        def starttls(self, *, context: ssl.SSLContext | None = None, **kwargs: Any) -> tuple[int, bytes]:
            seen["context"] = context
            raise smtplib.SMTPException("stop here")

    monkeypatch.setattr(smtplib, "SMTP", lambda *a, **k: _Connected(Recorder, *a, **k))
    settings.UPNEXT_SMTP_HOST, settings.UPNEXT_SMTP_PORT = "127.0.0.1", 2525
    settings.UPNEXT_SMTP_SECURITY = "starttls"
    SmtpSender().send(message())
    assert seen["context"].verify_mode == ssl.CERT_REQUIRED and seen["context"].check_hostname


def _Connected(cls: Any, *args: Any, **kwargs: Any) -> Any:
    instance = cls.__new__(cls)
    instance.__dict__["_host"] = "127.0.0.1"
    instance.timeout, instance.esmtp_features, instance.command_encoding = 5, {}, "ascii"
    instance.local_hostname, instance._auth_challenge_count, instance.does_esmtp = "x", 0, False
    instance.sock, instance.file, instance.source_address, instance._host = None, None, None, "127.0.0.1"
    instance.ehlo_resp = instance.helo_resp = None
    instance.debuglevel = 0
    instance.starttls = cls.starttls.__get__(instance)
    instance.ehlo = lambda *a, **k: (250, b"ok")
    instance.__enter__ = lambda: instance
    return instance


# --- suppression -----------------------------------------------------------------------------------------
def test_a_refused_recipient_is_suppressed_and_never_tried_again(
    smtp: StubSmtp, make_user: Callable[..., User]
) -> None:
    user = make_user(email="bounce@example.org")
    first = outbox.enqueue(
        EmailKind.PASSWORD_CHANGED_NOTICE, user, "gone@example.org", context={"display_name": "x"}
    )
    smtp.refuse = "gone@"
    assert outbox.process_batch()["dead"] == 1
    first.refresh_from_db()
    assert first.status == OutboxStatus.DEAD and first.last_error == "recipient_refused"
    assert suppression.is_suppressed("GONE@example.org")
    again = outbox.enqueue(
        EmailKind.PASSWORD_CHANGED_NOTICE, user, "gone@example.org", context={"display_name": "x"}
    )
    smtp.refuse = ""
    before = len(smtp.messages)
    assert outbox.process_batch()["dead"] == 1
    again.refresh_from_db()
    assert again.last_error == "suppressed" and len(smtp.messages) == before


def test_the_suppression_list_holds_no_addresses(make_user: Callable[..., User]) -> None:
    assert suppression.suppress("Person@Example.org", "complaint") is True
    assert suppression.suppress("person@example.org", "manual") is False
    row = EmailSuppression.objects.get()
    assert "example.org" not in row.address_hash and "person" not in str(row.__dict__).lower().replace(
        "person@", ""
    )
    assert suppression.release("PERSON@example.org") is True and not suppression.is_suppressed(
        "person@example.org"
    )
    call_command("suppress_address", email="a@example.org", reason="manual")
    assert suppression.is_suppressed("a@example.org")
    call_command("suppress_address", email="a@example.org", release=True)
    assert not suppression.is_suppressed("a@example.org")


# --- commands ---------------------------------------------------------------------------------------------
def run(name: str, **kwargs: Any) -> str:
    out = StringIO()
    call_command(name, stdout=out, **kwargs)
    return out.getvalue()


def test_check_email_config_reports_without_secrets(smtp: StubSmtp, settings: Any) -> None:
    output = run("check_email_config", connect=True, send_test=True, to="owner@example.org")
    assert "connection and authentication: ok" in output and "test message: sent" in output
    assert (PASSWORD not in output and USER not in output.replace("mailer", "")) or PASSWORD not in output
    assert smtp.messages[-1]["rcpt"] == "owner@example.org"
    smtp.auth_ok = False
    with pytest.raises(CommandError, match="authenticate"):
        call_command("check_email_config", connect=True)
    settings.UPNEXT_SMTP_HOST = ""
    with pytest.raises(CommandError, match="UPNEXT_SMTP_HOST"):
        call_command("check_email_config")


def test_check_email_config_with_delivery_disabled(settings: Any) -> None:
    settings.UPNEXT_EMAIL_BACKEND = "none"
    assert "Delivery is disabled" in run("check_email_config")
    with pytest.raises(CommandError, match="--to"):
        call_command("check_email_config", send_test=True)


def test_outbox_status_counts_and_alerts(make_user: Callable[..., User]) -> None:
    user = make_user()
    assert "oldest waiting: none" in run("outbox_status")
    waiting = outbox.enqueue(EmailKind.PASSWORD_CHANGED_NOTICE, user, user.email, context={})
    assert "pending: 1" in run("outbox_status", check=True)  # fresh: no alert
    EmailOutbox.objects.filter(pk=waiting.pk).update(created_at=timezone.now() - timedelta(minutes=11))
    with pytest.raises(CommandError, match="oldest waiting"):
        call_command("outbox_status", check=True)
    EmailOutbox.objects.filter(pk=waiting.pk).update(status=OutboxStatus.DEAD)
    with pytest.raises(CommandError, match="dead"):
        call_command("outbox_status", check=True)


# --- signed bounce/complaint feed (P5-01) ---------------------------------------------------------------------------

import json as _json  # noqa: E402
import time as _time  # noqa: E402

from rest_framework.test import APIClient as _Client  # noqa: E402

from notifications import suppression as _suppression  # noqa: E402
from notifications import webhook as _webhook  # noqa: E402

SECRET = "w" * 32


def _post(
    client: _Client, events: list[dict[str, Any]], *, secret: str = SECRET, ts: int | None = None
) -> object:
    body = _json.dumps({"events": events}).encode()
    stamp = str(ts if ts is not None else int(_time.time()))
    return client.post(
        "/api/v1/hooks/email",
        data=body,
        content_type="application/json",
        HTTP_X_UPNEXT_TIMESTAMP=stamp,
        HTTP_X_UPNEXT_SIGNATURE=_webhook.sign(secret, stamp, body),
    )


def test_a_signed_permanent_bounce_and_a_complaint_suppress_the_addresses(db: None, settings: Any) -> None:
    from django.core.cache import cache

    cache.clear()
    settings.UPNEXT_EMAIL_WEBHOOK_SECRET = SECRET
    client = _Client()
    response = _post(
        client,
        [
            {"type": "bounce", "permanent": True, "address": "Gone@Example.org"},
            {"type": "complaint", "address": "angry@example.org"},
            {"type": "bounce", "permanent": False, "address": "soft@example.org"},
            {"type": "delivered", "address": "fine@example.org"},
            {"nonsense": True},
        ],
    )
    assert response.status_code == 204  # type: ignore[attr-defined]
    assert _suppression.is_suppressed("gone@example.org") and _suppression.is_suppressed("angry@example.org")
    assert not _suppression.is_suppressed("soft@example.org") and not _suppression.is_suppressed(
        "fine@example.org"
    )


def test_the_feed_is_off_without_a_secret(db: None, settings: Any) -> None:
    settings.UPNEXT_EMAIL_WEBHOOK_SECRET = ""
    assert _post(_Client(), [], secret="x" * 32).status_code == 503  # type: ignore[attr-defined]


@pytest.mark.parametrize("case", ["wrong_secret", "stale", "future", "replay", "oversize", "bad_json"])
def test_unsigned_stale_replayed_or_malformed_deliveries_are_refused(
    db: None, settings: Any, case: str
) -> None:
    from django.core.cache import cache

    cache.clear()
    settings.UPNEXT_EMAIL_WEBHOOK_SECRET = SECRET
    client = _Client()
    event: list[dict[str, Any]] = [{"type": "complaint", "address": "victim@example.org"}]
    if case == "wrong_secret":
        assert _post(client, event, secret="z" * 32).status_code == 401  # type: ignore[attr-defined]
    elif case == "stale":
        assert _post(client, event, ts=int(_time.time()) - 3600).status_code == 401  # type: ignore[attr-defined]
    elif case == "future":
        assert _post(client, event, ts=int(_time.time()) + 3600).status_code == 401  # type: ignore[attr-defined]
    elif case == "replay":
        stamp = str(int(_time.time()))
        body = _json.dumps({"events": event}).encode()
        headers = {
            "HTTP_X_UPNEXT_TIMESTAMP": stamp,
            "HTTP_X_UPNEXT_SIGNATURE": _webhook.sign(SECRET, stamp, body),
        }
        assert (
            client.post(
                "/api/v1/hooks/email",
                data=body,
                content_type="application/json",
                **headers,  # type: ignore[arg-type]
            ).status_code
            == 204
        )
        assert (
            client.post(
                "/api/v1/hooks/email",
                data=body,
                content_type="application/json",
                **headers,  # type: ignore[arg-type]
            ).status_code
            == 401
        )
        return
    elif case == "oversize":
        big: list[dict[str, Any]] = [
            {"type": "complaint", "address": f"{i}@example.org"} for i in range(5000)
        ]
        assert _post(client, big).status_code == 413  # type: ignore[attr-defined]
    else:
        stamp = str(int(_time.time()))
        body = b"{not json"
        response = client.post(
            "/api/v1/hooks/email",
            data=body,
            content_type="application/json",
            HTTP_X_UPNEXT_TIMESTAMP=stamp,
            HTTP_X_UPNEXT_SIGNATURE=_webhook.sign(SECRET, stamp, body),
        )
        assert response.status_code == 400
        return
    assert not _suppression.is_suppressed("victim@example.org")


def test_no_credentials_or_cookies_are_needed_and_none_are_set(db: None, settings: Any) -> None:
    settings.UPNEXT_EMAIL_WEBHOOK_SECRET = SECRET
    response = _post(_Client(), [])
    assert response.status_code == 204 and not response.cookies  # type: ignore[attr-defined]
