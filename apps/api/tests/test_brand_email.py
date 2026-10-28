"""UPNEXT Careers branding of transactional e-mail (D-42): text and HTML, no former name, one official address."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

import pytest

from accounts import services as account_services
from accounts import tokens
from accounts.models import TokenPurpose, User
from notifications import services as outbox
from notifications.htmlmail import render_html
from notifications.models import EmailKind, EmailOutbox

pytestmark = pytest.mark.django_db

TOKEN_KINDS = {
    EmailKind.EMAIL_VERIFICATION: TokenPurpose.EMAIL_VERIFICATION,
    EmailKind.PASSWORD_RESET: TokenPurpose.PASSWORD_RESET,
    EmailKind.EMAIL_CHANGE_CONFIRM: TokenPurpose.EMAIL_CHANGE,
}


def build(user: User, kind: EmailKind) -> Any:
    token = tokens.issue(user, TOKEN_KINDS[kind]) if kind in TOKEN_KINDS else None
    row = outbox.enqueue(
        kind,
        user,
        user.email,
        token=token,
        context={"display_name": user.display_name, "scheduled_date": "01 January 2027", "days": 14},
    )
    message = outbox.build_message(row)
    assert message is not None
    return message


@pytest.mark.parametrize("kind", list(EmailKind))
def test_every_message_is_branded_and_has_a_safe_html_alternative(
    kind: EmailKind, make_user: Callable[..., User], settings: Any
) -> None:
    settings.UPNEXT_PUBLIC_BASE_URL = "https://upnext.example.test"
    message = build(make_user(display_name="Tom & <b>Jerry</b>"), kind)
    everything = message.subject + message.body + (message.html or "")
    assert "nextjob" not in everything.lower()
    assert "UPNEXT Careers" in message.subject
    assert message.html is not None and message.html.startswith("<!doctype html>")
    assert '<html lang="en">' in message.html and "<title>" in message.html
    # no tracking pixels, remote images, scripts or forms
    assert not re.search(r"<(img|script|form|iframe|link)\b", message.html)
    # user-controlled text is escaped in HTML and left as typed in plain text
    assert "<b>Jerry</b>" not in message.html
    assert "Tom & <b>Jerry</b>" in message.body or "Tom" not in message.body


def test_token_links_use_the_configured_origin_and_html_matches_text(
    make_user: Callable[..., User], settings: Any
) -> None:
    settings.UPNEXT_PUBLIC_BASE_URL = "https://upnext.example.test/"
    message = build(make_user(), EmailKind.PASSWORD_RESET)
    link = re.search(r"https://upnext\.example\.test/reset-password\?token=\S+", message.body)
    assert link is not None
    assert f'href="{link.group(0)}"' in message.html
    assert "marketing" not in message.body.lower()


def test_footer_names_the_one_official_mailbox(settings: Any) -> None:
    html = render_html(subject="S", body="Hello")
    assert 'href="mailto:info@upnext.co.zw"' in html
    assert "UPNEXT" in html and "CAREERS" in html and "Jobs and opportunities in Zimbabwe." in html
    for invented in ("support@", "noreply@", "no-reply@", "careers@", "jobs@"):
        assert invented not in html
    settings.UPNEXT_SUPPORT_EMAIL = ""  # an operator may blank it: the official address is still shown
    assert 'href="mailto:info@upnext.co.zw"' in render_html(subject="S", body="Hello")


def test_sender_and_reply_to_are_the_official_identity(settings: Any) -> None:
    assert settings.UPNEXT_EMAIL_FROM == "UPNEXT Careers <info@upnext.co.zw>"
    assert settings.UPNEXT_EMAIL_REPLY_TO == "info@upnext.co.zw"


def test_links_do_not_swallow_trailing_punctuation_and_text_is_escaped() -> None:
    html = render_html(
        subject="S", body="See https://upnext.example.test/a?x=1&y=2. <script>alert(1)</script>"
    )
    assert 'href="https://upnext.example.test/a?x=1&amp;y=2"' in html
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_cancelling_a_deletion_request_sends_a_notice(make_user: Callable[..., User]) -> None:
    user = make_user()
    account_services.request_deletion(user)
    EmailOutbox.objects.all().delete()
    assert account_services.cancel_deletion(user) is True
    row = EmailOutbox.objects.get()
    assert row.kind == EmailKind.ACCOUNT_DELETION_CANCELLED and row.to_address == user.email
