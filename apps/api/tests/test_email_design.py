"""The e-mail design system (D-55): every kind renders from the shared kit, HTML and plain text agree, links and
expiry follow the backend, nothing secret is shown, and the markup stays within what mail clients accept."""

from __future__ import annotations

import html as htmllib
import re
from pathlib import Path
from typing import Any

import pytest
from django.core.management import call_command

from accounts.models import TokenPurpose
from accounts.tokens import TTL
from notifications import content, emailkit, samples
from notifications.emailkit import Brand, EmailContent
from notifications.models import EmailKind

KINDS = [str(k) for k in EmailKind]
VARIANTS = ["normal", "long", "minimal"]
BRAND = Brand(
    name="UPNEXT Careers",
    short="UPNEXT",
    domain="upnext.co.zw",
    base_url=samples.SAMPLE_BASE,
    support_email="info@upnext.co.zw",
    tagline="Jobs and opportunities in Zimbabwe.",
    year=2026,
    asset_base=f"{samples.SAMPLE_BASE}/brand/email",
)


def render(kind: str, variant: str = "normal") -> tuple[EmailContent, str, str]:
    message = content.build(kind, samples.sample_context(kind, variant))  # type: ignore[arg-type]
    return message, emailkit.render_html(message, BRAND), emailkit.render_text(message, BRAND)


def hrefs(markup: str) -> list[str]:
    return [htmllib.unescape(h) for h in re.findall(r'href="([^"]+)"', markup)]


@pytest.mark.parametrize("variant", VARIANTS)
@pytest.mark.parametrize("kind", KINDS)
def test_every_kind_renders_in_every_variant(kind: str, variant: str) -> None:
    message, markup, text = render(kind, variant)
    assert message.subject and "\n" not in message.subject and len(message.subject) <= 150
    assert markup.startswith("<!doctype html>") and markup.count("<table") == markup.count("</table>")
    assert "<h1" in markup and message.preheader
    assert text.strip().endswith("All rights reserved.") and "<" not in text.replace("<3", "")
    # the visible text of every call to action is in both alternatives, and so is its link
    if message.cta:
        assert message.cta.label in markup and message.cta.url in text
        assert message.cta.url in hrefs(markup)
    # no unexpanded template placeholders or Python reprs leak into a message
    body = markup.split("</style>", 1)[1]
    for leak in ("{{", "}}", "None", "[object", "dict_"):
        assert leak not in body and leak not in text


@pytest.mark.parametrize("kind", KINDS)
def test_html_and_text_carry_the_same_links(kind: str) -> None:
    _, markup, text = render(kind)
    for link in hrefs(markup):
        if link.startswith("mailto:"):
            assert link.removeprefix("mailto:") in text
        else:
            assert link.rstrip("/") in text or link in text, link
    for link in re.findall(r"https?://\S+", text):
        assert link.rstrip(".,") in hrefs(markup) or link.rstrip(".,") == BRAND.base_url


@pytest.mark.parametrize("kind", KINDS)
def test_markup_is_email_safe(kind: str) -> None:
    _, markup, _ = render(kind)
    assert not re.search(r"<(script|form|iframe|link|object|embed|video|audio|input|button)\b", markup)
    assert "@import" not in markup and "url(" not in markup and "javascript:" not in markup.lower()
    assert "<style>" in markup and markup.count("<style>") == 1
    assert len(markup.encode()) < 100_000  # Gmail clips messages near 102 KB
    for link in hrefs(markup):
        assert link.startswith(("https://", "mailto:")), link
    images = re.findall(r"<img\b[^>]*>", markup)
    assert 1 <= len(images) <= 2
    for image in images:
        assert " alt=" in image and "width=" in image and "height=" in image
        assert f'src="{BRAND.asset_base}/' in image and ".png" in image
    # tracking pixels: no 1x1 images, no query strings on image URLs
    assert not re.search(r'<img[^>]*(width="1"|height="1"|\?)', markup)
    assert 'lang="en"' in markup and 'role="presentation"' in markup


def test_only_verification_has_an_illustration() -> None:
    for kind in KINDS:
        _, markup, _ = render(kind)
        has = "verify-illustration.png" in markup
        assert has == (kind == EmailKind.EMAIL_VERIFICATION), kind


def test_dark_scheme_and_phone_layout_are_declared_with_light_defaults() -> None:
    _, markup, _ = render(EmailKind.EMAIL_VERIFICATION)
    assert '<meta name="color-scheme" content="light dark">' in markup
    assert "@media (prefers-color-scheme:dark)" in markup and "@media (max-width:620px)" in markup
    # a client that strips the <style> block still gets a complete light message from inline styles
    body = markup.split("</head>")[1]
    assert (
        "background-color:#ffffff" in body and "color:#061b31" in body and "background-color:#533afd" in body
    )
    # Outlook gets a rounded VML button, other clients a linked block
    assert "<v:roundrect" in markup and "<!--[if !mso]><!-->" in markup


def wcag(foreground: str, background: str) -> float:
    def lum(hex_colour: str) -> float:
        channels = [int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
        lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]

    hi, lo = sorted((lum(foreground), lum(background)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


@pytest.mark.parametrize(
    ("foreground", "background"),
    [
        (emailkit.MUTED, emailkit.CARD),
        (emailkit.MUTED, emailkit.TINT),
        (emailkit.INK, emailkit.CARD),
        (emailkit.INK, emailkit.TINT),
        (emailkit.ON_ACCENT, emailkit.ACCENT),
        (emailkit.ACCENT, emailkit.CARD),
        (emailkit.HEADER_TEXT, emailkit.HEADER),
        ("#ffffff", emailkit.HEADER),
        # dark scheme (tokens.json dark values; button uses the hover value for contrast)
        ("#e8ecf0", "#151634"),
        ("#a3adbf", "#151634"),
        ("#a3adbf", "#1e1f4a"),
        ("#b9b9f9", "#151634"),
        ("#ffffff", "#5a51f5"),
    ],
)
def test_text_colours_meet_wcag_aa(foreground: str, background: str) -> None:
    assert wcag(foreground, background) >= 4.5


# --- the three messages the owner specified ------------------------------------------------------------
def test_verification_message() -> None:
    message, markup, text = render(EmailKind.EMAIL_VERIFICATION)
    assert message.subject == "Verify your email address | UPNEXT Careers"
    assert "Hello Silveroxy," in markup and "Verify email address" in markup
    assert "expires in 24 hours" in markup and "works once" in markup and "safely ignore" in markup
    assert "If the button does not work" in markup
    # the expiry text follows the backend policy, not a typed number
    assert TTL[TokenPurpose.EMAIL_VERIFICATION].total_seconds() == 24 * 3600
    # the token is never shown on its own: outside URLs it appears nowhere, and only once in the plain text
    for alternative in (markup, text):
        without_urls = re.sub(r"https?://[^\s\"'<]+", "", alternative)
        assert samples.PLACEHOLDER_TOKEN not in without_urls
    assert text.count(samples.PLACEHOLDER_TOKEN) == 1


def test_password_reset_message() -> None:
    message, markup, text = render(EmailKind.PASSWORD_RESET)
    assert message.subject == "Reset your password | UPNEXT Careers"
    assert "expires in 60 minutes" in markup and TTL[TokenPurpose.PASSWORD_RESET].total_seconds() == 3600
    assert "Reset password" in markup and "your password has not changed" in markup
    assert "never asks for your password by email" in text


def test_welcome_message_exists_but_nothing_queues_it() -> None:
    message, markup, _ = render(EmailKind.WELCOME)
    assert message.subject == "Welcome to UPNEXT Careers"
    assert "Explore opportunities" in markup and "Complete your profile" in markup
    api = Path(__file__).resolve().parent.parent
    for path in api.rglob("*.py"):
        relative = path.relative_to(api).parts
        if (
            relative[0] in {"tests", "migrations"}
            or "migrations" in relative
            or relative[:1] == ("notifications",)
        ):
            continue
        assert "EmailKind.WELCOME" not in path.read_text(encoding="utf-8"), (
            f"{path}: a welcome e-mail needs the owner's approval before anything sends it"
        )


# --- robustness ----------------------------------------------------------------------------------------
def test_long_names_and_titles_wrap_and_are_capped() -> None:
    message, markup, _ = render(EmailKind.EMPLOYER_LISTING_REJECTED, "long")
    assert len(message.heading) <= 60 and message.heading.endswith(",")
    assert "overflow-wrap:anywhere" in markup and "word-break:break-word" in markup
    alert, alert_markup, _ = render(EmailKind.JOB_ALERT, "long")
    assert samples._LONG_TITLE in alert_markup and "overflow-wrap:anywhere" in alert_markup
    assert len(alert.subject) <= 150


def test_missing_optional_fields_leave_no_empty_labels() -> None:
    _, markup, _ = render(EmailKind.EMPLOYER_LISTING_PUBLISHED, "minimal")
    assert "See it as visitors do" not in markup and "Manage the listing" in markup  # no public page yet
    assert "Deadline" not in markup
    _, markup, _ = render(EmailKind.EMPLOYER_LISTING_REJECTED, "minimal")
    assert "reason our staff gave" not in markup.lower()
    _, markup, _ = render(EmailKind.JOB_ALERT, "minimal")
    assert "See all opportunities" not in markup and "· ·" not in markup and "Hello," in markup


def test_text_is_escaped_in_html_and_literal_in_plain_text() -> None:
    ctx = samples.sample_context(EmailKind.EMPLOYER_LISTING_REJECTED)
    ctx.update(display_name="Tom & <b>Jerry</b>", title="A & B <script>x</script>", reason="<i>no</i> & stop")
    message = content.build(EmailKind.EMPLOYER_LISTING_REJECTED, ctx)
    markup, text = emailkit.render_html(message, BRAND), emailkit.render_text(message, BRAND)
    assert "<script>" not in markup and "<b>" not in markup and "<i>" not in markup
    assert "A &amp; B &lt;script&gt;" in markup
    assert "A & B <script>x</script>" in text and "<i>no</i> & stop" in text


def test_a_subject_from_the_event_is_one_clean_line() -> None:
    ctx = samples.sample_context(EmailKind.EMPLOYER_LISTING_EXPIRED)
    ctx["subject"] = "Line one\r\nBcc: attacker@example.test " + "x" * 400
    subject = content.build(EmailKind.EMPLOYER_LISTING_EXPIRED, ctx).subject
    assert "\n" not in subject and "\r" not in subject and len(subject) <= 150


@pytest.mark.parametrize(
    "kind",
    [k for k in KINDS if k.startswith("employer_") and k != EmailKind.EMPLOYER_LISTING_PUBLISHED],
)
def test_employer_messages_never_claim_verification(kind: str) -> None:
    _, markup, text = render(kind)
    assert "verified" not in (markup + text).lower()


def test_published_message_says_publication_is_not_verification() -> None:
    _, markup, _ = render(EmailKind.EMPLOYER_LISTING_PUBLISHED)
    assert "does not mean" in markup and "has verified the opportunity" in markup


def test_job_alert_respects_consent_and_unsubscribes() -> None:
    _, markup, text = render(EmailKind.JOB_ALERT)
    assert "because you switched on job alerts" in markup
    assert f"{samples.SAMPLE_BASE}/alerts/unsubscribe?token=" in text and "Stop these emails" in markup
    assert markup.count("View opportunity") == 3  # one button per listing, nothing invented


def test_nothing_promises_a_response_time() -> None:
    for kind in KINDS:
        _, markup, text = render(kind)
        for promise in ("within 24 hours", "within 48 hours", "within one", "business day", "immediately"):
            assert promise not in (markup + text).lower(), (kind, promise)


# --- preview tool --------------------------------------------------------------------------------------
def test_preview_command_writes_every_message_and_refuses_production(tmp_path: Path, settings: Any) -> None:
    out = tmp_path / "preview"
    call_command("preview_emails", out=str(out))
    for kind in KINDS:
        for variant in VARIANTS:
            assert (out / f"{kind}.{variant}.html").exists() and (out / f"{kind}.{variant}.txt").exists()
    assert (out / "index.html").exists() and (out / "assets" / emailkit.LOGO_FILE).exists()
    assert samples.PLACEHOLDER_TOKEN in (out / "email_verification.normal.html").read_text()
    from django.core.management.base import CommandError

    settings.UPNEXT_ENVIRONMENT = "production"
    with pytest.raises(CommandError, match="production"):
        call_command("preview_emails", out=str(out))


def test_email_images_exist_and_are_small() -> None:
    folder = Path(__file__).resolve().parents[2] / "web" / "public" / "brand" / "email"
    for name, limit in ((emailkit.LOGO_FILE, 20_000), (emailkit.ILLUSTRATION_FILE, 40_000)):
        data = (folder / name).read_bytes()
        assert data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) <= limit, name
