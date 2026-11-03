"""Validators, text normalisation, the Markdown subset and the category detail schemas."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from catalog import markdown
from catalog.models import DetailSchema
from catalog.schemas import SCHEMA_DIR, load_schema, schema_sha256, validate_detail
from catalog.text import TextError, clean_multiline, clean_single_line, normalise_name
from catalog.validators import (
    check_deadline,
    date_only_deadline,
    make_slug,
    parse_amount,
    validate_currency,
    validate_email,
    validate_timezone,
    validate_url,
)
from opportunities import demo
from tests.factories import ensure_reference_data

CATEGORIES = ["jobs", "internships", "graduate-programmes", "scholarships", "tenders", "grants"]


# --- text ------------------------------------------------------------------------------------------
def test_single_line_text_is_nfc_trimmed_and_collapsed() -> None:
    assert clean_single_line("  Café   Manager \n ") == "Café Manager"
    assert clean_single_line("a" + chr(0xA0) + "b") == "a b"


@pytest.mark.parametrize("bad", ["a\x00b", "a\x07b", "a\x7fb", "x\ud800y"])
def test_control_characters_and_surrogates_are_rejected(bad: str) -> None:
    with pytest.raises(TextError):
        clean_single_line(bad)
    with pytest.raises(TextError):
        clean_multiline(bad)


def test_multiline_text_keeps_newlines_only() -> None:
    assert clean_multiline("a\r\nb\rc ") == "a\nb\nc"
    with pytest.raises(TextError):
        clean_multiline("a\tb")


def test_names_compare_case_and_width_insensitively() -> None:
    assert normalise_name("  EXAMPLE   Power ") == normalise_name("example power")


# --- URLs -------------------------------------------------------------------------------------------
def test_url_is_normalised() -> None:
    assert (
        validate_url("HTTPS://Careers.Example.ORG:443/jobs?utm_source=x&id=7&fbclid=y#frag")
        == "https://careers.example.org/jobs?id=7"
    )
    assert validate_url("https://example.org") == "https://example.org/"
    assert validate_url("https://bücher.example.org/a").startswith("https://xn--")


@pytest.mark.parametrize(
    ("url", "code"),
    [
        ("http://example.org", "disallowed_scheme"),
        ("javascript:alert(1)", "disallowed_scheme"),
        ("data:text/html,<script>", "disallowed_scheme"),
        ("file:///etc/passwd", "disallowed_scheme"),
        ("ftp://example.org", "disallowed_scheme"),
        ("mailto:a@example.org", "disallowed_scheme"),
        ("https://user:pw@example.org/", "invalid_url"),
        ("https://127.0.0.1/", "invalid_url"),
        ("https://[::1]/", "invalid_url"),
        ("https://localhost/", "invalid_url"),
        ("https://intranet.local/", "invalid_url"),
        ("https://example.org:8443/", "invalid_url"),
        ("https://nodot/", "invalid_url"),
        ("https://exa mple.org/", "invalid_url"),
        ("https:///path", "invalid_url"),
        ("", "invalid_url"),
        ("https://example.org/" + "a" * 2100, "invalid_url"),
    ],
)
def test_unsafe_urls_are_rejected(url: str, code: str) -> None:
    with pytest.raises(TextError) as excinfo:
        validate_url(url)
    assert excinfo.value.code == code


def test_email_timezone_currency_and_amounts() -> None:
    assert validate_email("Jobs@Example.ORG") == "Jobs@example.org"
    for bad in [
        "no-at",
        "a@b",
        "a b@example.org",
        "a@@example.org",
        "x" * 65 + "@example.org",
        "a..b@example.org",
    ]:
        with pytest.raises(TextError):
            validate_email(bad)
    assert validate_timezone("Africa/Harare") == "Africa/Harare"
    with pytest.raises(TextError):
        validate_timezone("Mars/Base")
    assert validate_currency("USD") == "USD" and validate_currency("ZWG") == "ZWG"
    with pytest.raises(TextError):  # legacy dollar and unlisted currencies are not accepted (OQ-22 default)
        validate_currency("ZWL")
    assert str(parse_amount("700")) == "700.00" and str(parse_amount("12.5")) == "12.50"
    for bad in ["-1", "1.234", "abc", "1" * 13, "NaN"]:
        with pytest.raises(TextError):
            parse_amount(bad)
    with pytest.raises(TextError):
        parse_amount(1.5)  # floats are refused: money is never floating point


def test_deadline_rules_and_date_only_semantics() -> None:
    now = datetime(2026, 10, 17, 12, tzinfo=UTC)
    check_deadline(now + timedelta(days=1), now)
    for bad in (now - timedelta(seconds=1), now, now + timedelta(days=3 * 366 + 1)):
        with pytest.raises(TextError):
            check_deadline(bad, now)
    with pytest.raises(TextError):
        check_deadline(datetime(2027, 1, 1), now)  # naive
    end = date_only_deadline(date(2026, 12, 31), "Africa/Harare")  # end of day at UTC+2
    assert end == datetime(2026, 12, 31, 21, 59, 59, tzinfo=UTC)


def test_slug_format_and_alphabet() -> None:
    slug = make_slug("Graduate Électrical Engineer — Harare!!")
    assert slug.startswith("graduate-electrical-engineer-harare-")
    assert len(slug) <= 80 and slug == slug.lower()
    suffix = slug.rsplit("-", 1)[1]
    assert len(suffix) == 6 and not set(suffix) & set("ilo01")
    assert make_slug("Same title") != make_slug("Same title")
    assert len(make_slug("word " * 40)) <= 80
    assert make_slug("!!!").startswith("opportunity-")


# --- Markdown subset ----------------------------------------------------------------------------------
def test_markdown_renders_the_allowed_subset() -> None:
    html = markdown.render(
        "### Duties\n- **Bold** and *italic* and `code`\n- [Apply](https://example.org/a?x=1&y=2)\n\n1. one\n2. two\n\n> quoted\n\nline1\nline2"
    )
    assert "<h3>Duties</h3>" in html
    assert "<ul><li><strong>Bold</strong> and <em>italic</em> and <code>code</code></li>" in html
    assert (
        'href="https://example.org/a?x=1&amp;y=2"' in html
        and 'rel="noopener noreferrer nofollow ugc"' in html
    )
    assert "<ol><li>one</li><li>two</li></ol>" in html
    assert "<blockquote><p>quoted</p></blockquote>" in html
    assert "<p>line1<br>line2</p>" in html


XSS_CORPUS = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "<svg/onload=alert(1)>",
    "[x](javascript:alert(1))",
    '[x](https://example.org" onmouseover="alert(1))',
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "![img](https://example.org/a.png)",
    "<iframe src='https://evil.example'></iframe>",
    "<a href='https://evil.example'>x</a>",
    "**<b onclick=x>y</b>**",
    "&lt;script&gt;",
    "`<script>`",
]


@pytest.mark.parametrize("payload", XSS_CORPUS)
def test_markdown_output_never_contains_active_html(payload: str) -> None:
    html = markdown.render(payload)
    lowered = html.lower()
    # Only these tags may ever appear, and only <a> may carry attributes (href/rel/target).
    tags = re.findall(r"<(/?)([a-z0-9]+)([^>]*)>", lowered)
    allowed = {"p", "br", "h3", "h4", "h5", "ul", "ol", "li", "strong", "em", "code", "a", "blockquote"}
    assert {name for _, name, _ in tags} <= allowed
    for closing, name, attrs in tags:
        if name != "a" or closing:
            assert attrs.strip() == "", (name, attrs)
        else:
            assert set(re.findall(r"\s([a-z-]+)=", attrs)) <= {"href", "rel", "target"}
    for href in re.findall(r'href="([^"]*)"', html):
        assert href.startswith("https://") and '"' not in href


@pytest.mark.parametrize(
    "payload",
    [
        "<script>x</script>",
        "<b>x</b>",
        "![i](https://example.org/a.png)",
        "| a | b |\n|---|---|\n| 1 | 2 |",
        "<!-- c -->",
    ],
)
def test_markdown_validation_rejects_forbidden_constructs(payload: str) -> None:
    with pytest.raises(TextError) as excinfo:
        markdown.check(payload)
    assert excinfo.value.code == "markdown_disallowed"


def test_markdown_link_limits_and_targets() -> None:
    many = "\n".join(f"[l{i}](https://example.org/{i})" for i in range(21))
    with pytest.raises(TextError):
        markdown.check(many)
    with pytest.raises(TextError):
        markdown.check("[x](http://example.org)")
    markdown.check("[ok](https://example.org/ok)")


# --- category schemas -----------------------------------------------------------------------------------
@pytest.mark.parametrize("code", CATEGORIES)
def test_every_category_schema_is_valid_and_strict(code: str) -> None:
    schema = load_schema(code, 1)
    assert schema["$schema"].endswith("2020-12/schema") and schema["additionalProperties"] is False


@pytest.mark.parametrize("name", demo.EXAMPLE_NAMES)
def test_all_twelve_examples_validate(name: str) -> None:
    category = demo.load_example(name)["category"]
    detail = demo.load_example(name)["detail"]
    assert validate_detail(category, 1, detail) == {}


def test_negative_cases_are_rejected(repo_root: Path) -> None:
    cases = json.loads((repo_root / "docs/engineering/schemas-draft/negative-cases.json").read_text())
    assert cases
    for case in cases:
        errors = validate_detail(case["category"], 1, case["detail"])
        if case["expected"] == "invalid":
            assert errors, case["reason"]


def test_cross_field_rules() -> None:
    assert validate_detail(
        "grants", 1, {"funder": "Example Fund", "applicant_types": ["ngo_pvo"], "cofunding_percent": 10}
    )
    ok = validate_detail(
        "grants",
        1,
        {
            "funder": "Example Fund",
            "applicant_types": ["ngo_pvo"],
            "cofunding_required": True,
            "cofunding_percent": 10,
        },
    )
    assert ok == {}
    assert validate_detail("jobs", 1, {"vacancies": 0})
    assert validate_detail("jobs", 1, "not an object")
    errors = validate_detail(
        "tenders",
        1,
        {
            "procuring_entity": "Example",
            "procurement_reference": "R1",
            "tender_fee": {"amount": "20.00", "currency": "ZWL"},
        },
    )
    assert "detail.tender_fee.currency" in errors


@pytest.mark.django_db
def test_active_schema_files_match_the_recorded_hashes() -> None:
    """Editing an active schema in place would silently change what published listings were validated with."""
    ensure_reference_data()
    for row in DetailSchema.objects.select_related("category").filter(status="active"):
        assert bytes(row.schema_sha256) == schema_sha256(row.category.code, row.version), row.category.code
        assert hashlib.sha256(
            (SCHEMA_DIR / row.category.code / f"v{row.version}.json").read_bytes()
        ).digest() == bytes(row.schema_sha256)
    assert DetailSchema.objects.filter(status="active").count() == 6
