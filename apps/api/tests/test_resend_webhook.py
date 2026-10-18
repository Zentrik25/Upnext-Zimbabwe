"""Resend (Svix-signed) webhook: signature on the raw body, freshness, duplicates, bounce semantics (D-34)."""

from __future__ import annotations

import base64
import json
import time
from typing import Any

import pytest
from django.test import Client

from notifications import resend_webhook, suppression

pytestmark = pytest.mark.django_db

SECRET = "whsec_" + base64.b64encode(b"unit-test-secret-not-real-0123456789").decode()
URL = "/api/v1/hooks/email/resend"


@pytest.fixture(autouse=True)
def configured(settings: Any) -> None:
    settings.UPNEXT_RESEND_WEBHOOK_SECRET = SECRET


def event(kind: str, to: list[str], **data: Any) -> bytes:
    return json.dumps(
        {"type": kind, "created_at": "2026-10-18T08:00:00Z", "data": {"to": to, **data}}
    ).encode()


def post(
    body: bytes,
    *,
    message_id: str = "msg_1",
    stamp: int | None = None,
    signature: str | None = None,
    secret: str = SECRET,
) -> Any:
    ts = str(stamp if stamp is not None else int(time.time()))
    headers: dict[str, Any] = {
        "HTTP_SVIX_ID": message_id,
        "HTTP_SVIX_TIMESTAMP": ts,
        "HTTP_SVIX_SIGNATURE": signature or resend_webhook.sign(secret, message_id, ts, body),
    }
    return Client().post(URL, data=body, content_type="application/json", **headers)


def test_a_permanent_bounce_suppresses_the_recipient() -> None:
    body = event("email.bounced", ["Gone One <gone@example.org>"], bounce={"type": "Permanent"})
    assert post(body).status_code == 204
    assert suppression.is_suppressed("gone@example.org")


@pytest.mark.parametrize("kind", ["email.bounced", "email.complained"])
def test_an_event_naming_several_recipients_suppresses_nobody(kind: str) -> None:
    """Which recipient failed is unknowable from such an event; guessing would suppress innocent addresses."""
    body = event(kind, ["one@example.org", "two@example.org"], bounce={"type": "Permanent"})
    assert post(body, message_id=f"msg_{kind}").status_code == 204
    assert not suppression.is_suppressed("one@example.org") and not suppression.is_suppressed(
        "two@example.org"
    )


def test_no_recipient_or_a_malformed_one_suppresses_nobody() -> None:
    for to in ([], ["not-an-address"], [None]):
        body = json.dumps({"type": "email.complained", "data": {"to": to}}).encode()
        assert post(body, message_id=f"msg_{len(str(to))}").status_code == 204


def test_the_bounce_type_is_matched_without_regard_to_case() -> None:
    assert (
        post(event("email.bounced", ["lower@example.org"], bounce={"type": "permanent"})).status_code == 204
    )
    assert suppression.is_suppressed("lower@example.org")


def test_a_complaint_suppresses() -> None:
    assert post(event("email.complained", ["angry@example.org"])).status_code == 204
    assert suppression.is_suppressed("angry@example.org")


@pytest.mark.parametrize(
    ("kind", "extra"),
    [
        ("email.bounced", {"bounce": {"type": "Transient"}}),
        ("email.bounced", {"bounce": {"type": "Undetermined"}}),
        ("email.bounced", {}),
        ("email.delivery_delayed", {}),
        ("email.failed", {}),
        ("email.delivered", {}),
        ("email.sent", {}),
        ("email.something_new", {}),
        ("email.scheduled", {}),
        ("email.suppressed", {"suppressed": {"type": "OnAccountSuppressionList", "message": "x"}}),
        ("email.failed", {"failed": {"reason": "reached_daily_quota"}}),
        ("suppression.added", {"email": "fine@example.org", "origin": "bounce"}),
    ],
)
def test_temporary_or_unknown_events_never_suppress(kind: str, extra: dict[str, Any]) -> None:
    assert post(event(kind, ["fine@example.org"], **extra), message_id=f"msg_{kind}").status_code == 204
    assert not suppression.is_suppressed("fine@example.org")


def test_a_bad_signature_is_refused_and_applies_nothing() -> None:
    body = event("email.complained", ["a@example.org"])
    other = "whsec_" + base64.b64encode(b"a-different-secret-0123456789abc").decode()
    assert post(body, secret=other).status_code == 401
    assert post(body, signature="v1,AAAA").status_code == 401
    assert post(body, signature="garbage").status_code == 401
    assert not suppression.is_suppressed("a@example.org")


def test_the_signature_covers_the_raw_body() -> None:
    body = event("email.complained", ["a@example.org"])
    ts = str(int(time.time()))
    signature = resend_webhook.sign(SECRET, "msg_1", ts, body)
    tampered = event("email.complained", ["b@example.org"])
    response = Client().post(
        URL,
        data=tampered,
        content_type="application/json",
        HTTP_SVIX_ID="msg_1",
        HTTP_SVIX_TIMESTAMP=ts,
        HTTP_SVIX_SIGNATURE=signature,
    )
    assert response.status_code == 401 and not suppression.is_suppressed("b@example.org")


def test_a_second_valid_signature_in_the_header_is_accepted() -> None:
    body = event("email.complained", ["rot@example.org"])
    ts = str(int(time.time()))
    good = resend_webhook.sign(SECRET, "msg_r", ts, body)
    assert post(body, message_id="msg_r", signature=f"v1,AAAA {good}").status_code == 204


def test_stale_and_future_timestamps_are_refused() -> None:
    body = event("email.complained", ["a@example.org"])
    assert post(body, stamp=int(time.time()) - 3600).status_code == 401
    assert post(body, stamp=int(time.time()) + 3600, message_id="msg_f").status_code == 401
    assert not suppression.is_suppressed("a@example.org")


def test_missing_headers_are_refused() -> None:
    response = Client().post(
        URL, data=event("email.complained", ["a@example.org"]), content_type="application/json"
    )
    assert response.status_code == 401


def test_a_retry_of_the_same_event_is_acknowledged_and_not_reapplied() -> None:
    body = event("email.bounced", ["dup@example.org"], bounce={"type": "Permanent"})
    assert post(body, message_id="msg_dup").status_code == 204
    assert suppression.release("dup@example.org") is True
    assert post(body, message_id="msg_dup").status_code == 204  # duplicate: nothing applied again
    assert not suppression.is_suppressed("dup@example.org")


def test_an_unsigned_endpoint_is_off_without_a_secret(settings: Any) -> None:
    for value in ("", "whsec_", "not-prefixed", "whsec_!!!notbase64"):
        settings.UPNEXT_RESEND_WEBHOOK_SECRET = value
        assert post(event("email.complained", ["a@example.org"]), secret=SECRET).status_code == 404


def test_oversized_bodies_are_refused() -> None:
    assert post(b"x" * (64 * 1024 + 1)).status_code == 413


def test_malformed_signed_bodies_are_a_400() -> None:
    assert post(b"not json").status_code == 400
    assert post(json.dumps({"type": "email.bounced"}).encode(), message_id="msg_m").status_code == 400
    assert post(json.dumps([1, 2]).encode(), message_id="msg_n").status_code == 400


def test_a_failure_while_applying_allows_the_providers_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    body = event("email.complained", ["retry@example.org"])

    def boom(*_: Any) -> bool:
        raise RuntimeError("database down")

    monkeypatch.setattr(suppression, "suppress", boom)
    with pytest.raises(RuntimeError):
        post(body, message_id="msg_retry")
    monkeypatch.undo()
    assert post(body, message_id="msg_retry").status_code == 204
    assert suppression.is_suppressed("retry@example.org")


def test_logs_carry_counts_but_no_addresses(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("INFO", logger="upnext.email"):
        post(event("email.complained", ["secret.person@example.org"]), message_id="msg_log")
    assert caplog.records and "secret.person" not in caplog.text and "example.org" not in caplog.text


# --- Resend SMTP configuration checks ---------------------------------------------------------------------
def test_resend_smtp_settings_are_checked() -> None:
    from types import SimpleNamespace

    from notifications.config import problems

    good = SimpleNamespace(
        UPNEXT_EMAIL_BACKEND="smtp",
        UPNEXT_SMTP_HOST="smtp.resend.com",
        UPNEXT_EMAIL_FROM="NextJob Zimbabwe <notifications@nextjob.co.zw>",
        UPNEXT_SMTP_SECURITY="ssl",
        UPNEXT_SMTP_PORT=465,
        UPNEXT_SMTP_USER="resend",
        UPNEXT_SMTP_PASSWORD="re_placeholder",
    )
    assert problems(good, production=True) == []
    wrong_user = SimpleNamespace(**{**vars(good), "UPNEXT_SMTP_USER": "me"})
    assert any("'resend'" in p for p in problems(wrong_user, production=True))
    wrong_port = SimpleNamespace(**{**vars(good), "UPNEXT_SMTP_PORT": 587})
    assert any("465" in p for p in problems(wrong_port, production=True))
    starttls_wrong = SimpleNamespace(**{**vars(good), "UPNEXT_SMTP_SECURITY": "starttls"})
    assert any("587" in p for p in problems(starttls_wrong, production=True))


# --- Interoperability with the Standard Webhooks library that Resend's SDK uses to verify ----------------
# Produced once with standardwebhooks@1.1.1 (npm): Webhook(secret).sign(id, date, body). A signature our code
# reproduces byte for byte is one the provider's own verifier accepts, and the reverse.
KAT_SECRET = "whsec_a25vd24tYW5zd2VyLXRlc3Qta2V5LTAxMjM0NTY3ODk="
KAT_ID, KAT_TS = "msg_kat1", 1760774400
KAT_BODY = (
    b'{"type":"email.bounced","created_at":"2026-10-18T08:00:00.000Z",'
    b'"data":{"to":["a@example.org"],"bounce":{"type":"Permanent"}}}'
)
KAT_SIG = "v1,cixF5Xg2mFZRLhRRsO8xuz0UFQaYZrcRehhwI1/FtYs="


def test_our_signature_equals_the_standard_webhooks_library_output() -> None:
    assert resend_webhook.sign(KAT_SECRET, KAT_ID, str(KAT_TS), KAT_BODY) == KAT_SIG


def test_the_known_answer_is_accepted_inside_the_window_and_refused_outside(settings: Any) -> None:
    settings.UPNEXT_RESEND_WEBHOOK_SECRET = KAT_SECRET
    assert resend_webhook.process(KAT_BODY, KAT_ID, str(KAT_TS), KAT_SIG, now=KAT_TS + 299)["suppressed"] == 1
    assert suppression.is_suppressed("a@example.org")
    for now in (KAT_TS + 301, KAT_TS - 301):  # the tolerance is five minutes in both directions
        with pytest.raises(resend_webhook.WebhookRefused) as refused:
            resend_webhook.process(KAT_BODY, "msg_kat2", str(KAT_TS), KAT_SIG, now=now)
        assert refused.value.status == 401


def test_the_standard_webhooks_header_names_are_accepted_too() -> None:
    body = event("email.complained", ["std@example.org"])
    ts = str(int(time.time()))
    response = Client().post(
        URL,
        data=body,
        content_type="application/json",
        HTTP_WEBHOOK_ID="msg_std",
        HTTP_WEBHOOK_TIMESTAMP=ts,
        HTTP_WEBHOOK_SIGNATURE=resend_webhook.sign(SECRET, "msg_std", ts, body),
    )
    assert response.status_code == 204 and suppression.is_suppressed("std@example.org")


def test_only_v1_signatures_count() -> None:
    body = event("email.complained", ["v2@example.org"])
    ts = str(int(time.time()))
    good = resend_webhook.sign(SECRET, "msg_v2", ts, body).replace("v1,", "v2,")
    assert post(body, message_id="msg_v2", signature=good).status_code == 401
    assert not suppression.is_suppressed("v2@example.org")
