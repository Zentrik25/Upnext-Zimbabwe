"""Accessible HTML alternative built from the plain-text body, so the two can never drift apart.

Flat layout (no images, no tracking pixels, no remote resources, no scripts): a text wordmark, the message
paragraphs, and a footer. Everything is HTML-escaped; only bare http(s) URLs become links.
"""

from __future__ import annotations

import re
from html import escape

from django.conf import settings

_URL = re.compile(r"https?://[^\s<>\"']+")
_TRAILING = ".,;:!?)"


def _linkify(text: str) -> str:
    out: list[str] = []
    last = 0
    for match in _URL.finditer(text):
        url = match.group(0)
        tail = ""
        while url and url[-1] in _TRAILING:
            tail, url = url[-1] + tail, url[:-1]
        out.append(escape(text[last : match.start()]))
        out.append(
            f'<a href="{escape(url, quote=True)}" style="color:#174c83">{escape(url)}</a>{escape(tail)}'
        )
        last = match.end()
    out.append(escape(text[last:]))
    return "".join(out)


def render_html(*, subject: str, body: str) -> str:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]
    rows = "".join(
        f'<p style="margin:0 0 16px;line-height:1.5">{_linkify(p).replace(chr(10), "<br>")}</p>'
        for p in paragraphs
    )
    support = (settings.UPNEXT_SUPPORT_EMAIL or "").strip()
    help_line = (
        f' Questions? Write to <a href="mailto:{escape(support, quote=True)}" style="color:#174c83">'
        f"{escape(support)}</a>."
        if support
        else ""
    )
    body_style = (
        "margin:0;background:#ffffff;color:#18232f;font-family:Arial,Helvetica,sans-serif;font-size:16px"
    )
    mark_style = "margin:0 0 24px;font-size:22px;font-weight:bold"
    foot_style = "margin:24px 0 0;padding-top:16px;border-top:1px solid #dce2e8;font-size:13px;color:#687380"
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(subject)}</title></head>"
        f'<body style="{body_style}"><div style="max-width:560px;margin:0 auto;padding:24px 16px">'
        f'<p style="{mark_style}">nextjob<span style="color:#174c83">.</span></p>'
        f"{rows}"
        f'<p style="{foot_style}">NextJob Zimbabwe · Find what&#39;s next.{help_line}</p>'
        "</div></body></html>"
    )
