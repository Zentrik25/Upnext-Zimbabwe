"""The e-mail port (SECURITY_ARCHITECTURE §4.1): application code never talks to a provider.

No provider is chosen yet (OQ-03). `file` and `console` are for development and tests; `smtp` is a generic
adapter that is used only when the owner configures a provider; `none` (the production default) sends nothing,
so rows simply wait in the outbox.
"""

from __future__ import annotations

import json
import logging
import smtplib
import ssl
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.message import EmailMessage as MimeMessage
from pathlib import Path
from typing import Any, Literal, Protocol

from django.conf import settings

logger = logging.getLogger("upnext.email")


@dataclass(frozen=True)
class EmailMessage:
    idempotency_key: str
    to: str
    subject: str
    body: str
    kind: str


@dataclass(frozen=True)
class DeliveryResult:
    outcome: Literal["sent", "temporary_failure", "permanent_failure"]
    provider_message_id: str | None = None
    error_code: str | None = None


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> DeliveryResult: ...


@dataclass
class FakeSender:
    """Contract-test double: records messages; `outcomes` can script failures."""

    sent: list[EmailMessage] = field(default_factory=list)
    outcomes: list[DeliveryResult] = field(default_factory=list)

    def send(self, message: EmailMessage) -> DeliveryResult:
        self.sent.append(message)
        return self.outcomes.pop(0) if self.outcomes else DeliveryResult("sent", f"fake-{len(self.sent)}")


class FileSender:
    """Writes one JSON file per message to a spool directory (development / CI only)."""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def send(self, message: EmailMessage) -> DeliveryResult:
        self.directory.mkdir(parents=True, exist_ok=True)
        message_id = uuid.uuid4().hex
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        record: dict[str, Any] = {
            "id": message_id,
            "kind": message.kind,
            "to": message.to,
            "subject": message.subject,
            "body": message.body,
        }
        (self.directory / f"{stamp}-{message_id}.json").write_text(json.dumps(record), encoding="utf-8")
        return DeliveryResult("sent", message_id)


class ConsoleSender:
    """Logs that a message was produced, never its body (links are credentials)."""

    def send(self, message: EmailMessage) -> DeliveryResult:
        logger.info("e-mail produced", extra={"event": "email.console", "kind": message.kind})
        return DeliveryResult("sent", f"console-{uuid.uuid4().hex[:12]}")


class SmtpSender:
    """Generic SMTP adapter (STARTTLS or implicit TLS), configured from settings; credentials are never
    logged. A provider-specific API adapter can replace it by registering another factory (see `register`)."""

    def __init__(self) -> None:
        self.host = settings.UPNEXT_SMTP_HOST
        self.port = settings.UPNEXT_SMTP_PORT
        self.user = settings.UPNEXT_SMTP_USER
        self.password = settings.UPNEXT_SMTP_PASSWORD
        self.sender = settings.UPNEXT_EMAIL_FROM
        self.reply_to = settings.UPNEXT_EMAIL_REPLY_TO
        self.security = settings.UPNEXT_SMTP_SECURITY
        self.timeout = settings.UPNEXT_SMTP_TIMEOUT_SECONDS

    def _connect(self) -> smtplib.SMTP:
        if self.security == "ssl":
            return smtplib.SMTP_SSL(
                self.host, self.port, timeout=self.timeout, context=ssl.create_default_context()
            )
        smtp = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
        if self.security == "starttls":
            smtp.starttls(context=ssl.create_default_context())
        return smtp

    def send(self, message: EmailMessage) -> DeliveryResult:
        mime = MimeMessage()
        mime["From"], mime["To"], mime["Subject"] = self.sender, message.to, message.subject
        if self.reply_to:
            mime["Reply-To"] = self.reply_to
        mime["Message-ID"] = f"<{message.idempotency_key}@upnext>"
        mime["Auto-Submitted"] = "auto-generated"
        mime.set_content(message.body)
        try:
            with self._connect() as smtp:
                if self.user:
                    smtp.login(self.user, self.password)
                smtp.send_message(mime)
        except smtplib.SMTPRecipientsRefused:
            return DeliveryResult("permanent_failure", error_code="recipient_refused")
        except smtplib.SMTPAuthenticationError:
            return DeliveryResult("temporary_failure", error_code="smtp_auth_failed")
        except smtplib.SMTPResponseException as exc:
            # 5xx replies are permanent for this message, 4xx are worth retrying.
            code = "smtp_rejected" if 500 <= exc.smtp_code < 600 else "smtp_error"
            return DeliveryResult(
                "permanent_failure" if code == "smtp_rejected" else "temporary_failure", error_code=code
            )
        except smtplib.SMTPException, OSError:
            return DeliveryResult("temporary_failure", error_code="smtp_error")
        return DeliveryResult("sent", str(mime["Message-ID"]))

    def check(self) -> None:
        """Connect and authenticate without sending (used by `check_email_config --connect`)."""
        with self._connect() as smtp:
            smtp.noop()
            if self.user:
                smtp.login(self.user, self.password)


class DisabledSender:
    """Production default until a provider is chosen (OQ-03): nothing leaves the system."""

    def send(self, message: EmailMessage) -> DeliveryResult:
        return DeliveryResult("temporary_failure", error_code="no_provider_configured")


_FACTORIES: dict[str, Callable[[], EmailSender]] = {}


def register(name: str, factory: Callable[[], EmailSender]) -> None:
    """Add an adapter (for example a provider's HTTP API) selectable with UPNEXT_EMAIL_BACKEND=<name>."""
    _FACTORIES[name] = factory


def get_sender() -> EmailSender:
    backend = settings.UPNEXT_EMAIL_BACKEND
    if backend in _FACTORIES:
        return _FACTORIES[backend]()
    if backend == "file":
        return FileSender(settings.UPNEXT_EMAIL_FILE_DIR)
    if backend == "console":
        return ConsoleSender()
    if backend == "smtp":
        return SmtpSender()
    return DisabledSender()
