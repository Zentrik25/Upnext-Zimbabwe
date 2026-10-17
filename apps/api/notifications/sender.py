"""The e-mail port (SECURITY_ARCHITECTURE §4.1): application code never talks to a provider.

No provider is chosen yet (OQ-03). `file` and `console` are for development and tests; `smtp` is a generic
adapter that is used only when the owner configures a provider; `none` (the production default) sends nothing,
so rows simply wait in the outbox.
"""

from __future__ import annotations

import json
import logging
import smtplib
import uuid
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
    def __init__(self) -> None:
        self.host = settings.UPNEXT_SMTP_HOST
        self.port = settings.UPNEXT_SMTP_PORT
        self.user = settings.UPNEXT_SMTP_USER
        self.password = settings.UPNEXT_SMTP_PASSWORD
        self.sender = settings.UPNEXT_EMAIL_FROM

    def send(self, message: EmailMessage) -> DeliveryResult:
        mime = MimeMessage()
        mime["From"], mime["To"], mime["Subject"] = self.sender, message.to, message.subject
        mime["Message-ID"] = f"<{message.idempotency_key}@upnext>"
        mime.set_content(message.body)
        try:
            with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
                smtp.starttls()
                if self.user:
                    smtp.login(self.user, self.password)
                smtp.send_message(mime)
        except smtplib.SMTPRecipientsRefused:
            return DeliveryResult("permanent_failure", error_code="recipient_refused")
        except smtplib.SMTPException, OSError:
            return DeliveryResult("temporary_failure", error_code="smtp_error")
        return DeliveryResult("sent", str(mime["Message-ID"]))


class DisabledSender:
    """Production default until a provider is chosen (OQ-03): nothing leaves the system."""

    def send(self, message: EmailMessage) -> DeliveryResult:
        return DeliveryResult("temporary_failure", error_code="no_provider_configured")


def get_sender() -> EmailSender:
    backend = settings.UPNEXT_EMAIL_BACKEND
    if backend == "file":
        return FileSender(settings.UPNEXT_EMAIL_FILE_DIR)
    if backend == "console":
        return ConsoleSender()
    if backend == "smtp":
        return SmtpSender()
    return DisabledSender()
