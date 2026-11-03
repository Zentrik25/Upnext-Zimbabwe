"""Escape-first renderer for the approved Markdown subset (VALIDATION_SPEC §5, P2-10).

Every piece of text is HTML-escaped *before* any markup is added, and only the tags below are ever
emitted, so author input cannot introduce HTML, attributes, scripts or event handlers. Allowed:
paragraphs, line breaks, headings h3-h5, bold, italic, ordered/unordered lists, blockquote, https
links and inline code. Raw HTML, images and tables are rejected at validation time (`check`).
"""

from __future__ import annotations

import html
import re

from .text import TextError
from .validators import validate_url

MAX_LINKS = 20
_RAW_HTML = re.compile(r"<\s*/?\s*[A-Za-z!?]")
_IMAGE = re.compile(r"!\[[^\]]*\]\(")
_TABLE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$", re.MULTILINE)
_LINK = re.compile(r"\[([^\]\n]{1,200})\]\(([^\s)]{1,2048})\)")
_CODE = re.compile(r"`([^`\n]+)`")
_BOLD = re.compile(r"(\*\*|__)(?=\S)(.+?)(?<=\S)\1")
_ITALIC = re.compile(
    r"(?<![\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_]+?)(?<=\S)_(?![\w_])"
)
_HEADING = re.compile(r"^(#{3,5})\s+(.+)$")
_UL = re.compile(r"^[-*]\s+(.+)$")
_OL = re.compile(r"^\d{1,3}[.)]\s+(.+)$")
_REL = "noopener noreferrer nofollow ugc"


def check(source: str) -> None:
    """Reject what the subset forbids, with the `markdown_disallowed` code."""
    if _RAW_HTML.search(source):
        raise TextError("markdown_disallowed", "Raw HTML is not allowed.")
    if _IMAGE.search(source):
        raise TextError("markdown_disallowed", "Images are not allowed.")
    if _TABLE.search(source):
        raise TextError("markdown_disallowed", "Tables are not allowed.")
    links = _LINK.findall(source)
    if len(links) > MAX_LINKS:
        raise TextError("markdown_disallowed", f"At most {MAX_LINKS} links are allowed.")
    for _, target in links:
        try:
            validate_url(target, field_name="Link")
        except TextError:
            raise TextError("markdown_disallowed", "Links must be valid https URLs.") from None


def _emphasis(escaped: str) -> str:
    escaped = _BOLD.sub(lambda m: f"<strong>{m.group(2)}</strong>", escaped)
    return _ITALIC.sub(lambda m: f"<em>{m.group(1) or m.group(2)}</em>", escaped)


def _inline_no_links(text: str) -> str:
    out: list[str] = []
    pos = 0
    for match in _CODE.finditer(text):
        out.append(_emphasis(html.escape(text[pos : match.start()], quote=True)))
        out.append(f"<code>{html.escape(match.group(1), quote=True)}</code>")
        pos = match.end()
    out.append(_emphasis(html.escape(text[pos:], quote=True)))
    return "".join(out)


def _inline(text: str) -> str:
    out: list[str] = []
    pos = 0
    for match in _LINK.finditer(text):
        try:
            url = validate_url(match.group(2), field_name="Link")
        except TextError:  # invalid targets are shown as plain text, never as links
            continue
        out.append(_inline_no_links(text[pos : match.start()]))
        out.append(
            f'<a href="{html.escape(url, quote=True)}" rel="{_REL}" target="_blank">'
            f"{_inline_no_links(match.group(1))}</a>"
        )
        pos = match.end()
    out.append(_inline_no_links(text[pos:]))
    return "".join(out)


def render(source: str) -> str:
    """Render already-validated Markdown to sanitised HTML."""
    lines = source.replace("\r\n", "\n").split("\n")
    blocks: list[str] = []
    para: list[str] = []
    items: list[str] = []
    list_tag = ""
    quote: list[str] = []

    def flush() -> None:
        nonlocal list_tag
        if para:
            blocks.append("<p>" + "<br>".join(_inline(line) for line in para) + "</p>")
            para.clear()
        if items:
            blocks.append(
                f"<{list_tag}>" + "".join(f"<li>{_inline(i)}</li>" for i in items) + f"</{list_tag}>"
            )
            items.clear()
            list_tag = ""
        if quote:
            blocks.append(
                "<blockquote><p>" + "<br>".join(_inline(line) for line in quote) + "</p></blockquote>"
            )
            quote.clear()

    for raw in lines:
        line = raw.strip()
        if not line:
            flush()
            continue
        heading = _HEADING.match(line)
        ul, ol = _UL.match(line), _OL.match(line)
        if heading:
            flush()
            level = len(heading.group(1))
            blocks.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
        elif ul or ol:
            tag = "ul" if ul else "ol"
            if items and tag != list_tag:
                flush()
            if para or quote:
                flush()
            list_tag = tag
            items.append((ul or ol).group(1))  # type: ignore[union-attr]
        elif line.startswith(">"):
            if para or items:
                flush()
            quote.append(line[1:].strip())
        else:
            if items or quote:
                flush()
            para.append(line)
    flush()
    return "".join(blocks)
