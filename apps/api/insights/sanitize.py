"""Server-side sanitising of article bodies (D-78).

The editor sends HTML; nothing it sends is trusted. Every save passes the body through `nh3` (the Rust
`ammonia`
sanitiser) with a short allow-list of semantic elements, so stored and served HTML can contain only these
tags and
attributes, links only to https, mailto or same-site addresses, and images only from the Media Library or
https.
Scripts, styles, event handlers, iframes, forms and `javascript:` URLs are removed. The public page renders
this
stored HTML; it never renders anything the browser sent without it passing through here first.
"""

from __future__ import annotations

import math
import re

import nh3

TAGS = {
    "p",
    "br",
    "h2",
    "h3",
    "strong",
    "em",
    "u",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}
ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title", "width", "height"},
    "th": {"colspan", "rowspan", "scope"},
    "td": {"colspan", "rowspan"},
}
URL_SCHEMES = {"https", "mailto"}
# Remove these together with their contents (not just the tags).
STRIP_WITH_CONTENT = {
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "noscript",
    "template",
    "textarea",
    "select",
}

_SPACE = re.compile(r"\s+")
# Editors produce `<b>`/`<i>` in some browsers; keep the meaning before sanitising drops unknown tags.
_ALIASES = (
    (re.compile(r"<(/?)b(\s|>)", re.I), r"<\1strong\2"),
    (re.compile(r"<(/?)i(\s|>)", re.I), r"<\1em\2"),
)
# Any heading level other than 2 or 3 becomes the nearest allowed level (the page owns the only <h1>).
_HEADING = re.compile(r"<(/?)h([1-6])(\s|>)", re.I)
_EMPTY_P = re.compile(r"<p>\s*(<br\s*/?>)?\s*</p>")


def _attribute_filter(tag: str, attribute: str, value: str) -> str | None:
    if attribute in ("width", "height"):
        return value if value.isdigit() and 0 < int(value) <= 4000 else None
    if attribute in ("colspan", "rowspan"):
        return value if value.isdigit() and 0 < int(value) <= 20 else None
    if attribute == "scope":
        return value if value in ("row", "col") else None
    if tag == "img" and attribute == "src":
        # Pictures from the Media Library (same site) or https only; never data: or http:.
        return value if value.startswith(("https://", "/media/")) else None
    return value


def _heading_level(match: re.Match[str]) -> str:
    level = 2 if match.group(2) in ("1", "2") else 3
    return f"<{match.group(1)}h{level}{match.group(3)}"


def clean_body(html: str | None) -> str:
    """The stored form of an article body: allow-listed, link-safe HTML with no empty paragraphs."""
    if not html:
        return ""
    text = html
    for pattern, replacement in _ALIASES:
        text = pattern.sub(replacement, text)
    text = _HEADING.sub(_heading_level, text)
    cleaned = nh3.clean(
        text,
        tags=TAGS,
        clean_content_tags=STRIP_WITH_CONTENT,
        attributes=ATTRIBUTES,
        attribute_filter=_attribute_filter,
        url_schemes=URL_SCHEMES,
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
    cleaned = _EMPTY_P.sub("", cleaned).strip()
    return cleaned


def plain_text(html: str | None) -> str:
    """The words of an HTML fragment, one space between them (for search, reading time and summaries)."""
    if not html:
        return ""
    spaced = re.sub(r"<(br|/p|/h[23]|/li|/td|/th|/blockquote)[^>]*>", " ", html, flags=re.I)
    return _SPACE.sub(" ", nh3.clean(spaced, tags=set())).strip().replace("&amp;", "&")


def reading_minutes(text: str) -> int:
    """Minutes to read at 200 words a minute, at least one. Shown to readers; never a target."""
    words = len(text.split())
    return max(1, math.ceil(words / 200))


_TAG_LIKE = re.compile(r"<\s*/?\s*[a-zA-Z!?]")


def has_markup(value: str) -> bool:
    """True when a plain-text field contains something that looks like an HTML tag. Plain fields are always
    rendered as text (never as HTML), so this is about keeping stored text clean, not about escaping."""
    return bool(_TAG_LIKE.search(value))
