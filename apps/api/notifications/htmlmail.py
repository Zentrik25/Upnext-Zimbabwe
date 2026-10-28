"""Accessible HTML alternative built from the plain-text body, so the two can never drift apart.

Flat layout (no images, no tracking pixels, no remote resources, no scripts): a text wordmark (UPNEXT with
CAREERS beneath, black on white), the message paragraphs, and a footer with the one official address.
Everything is HTML-escaped; only bare http(s) URLs become links.
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
        link_style = "color:#000000;text-decoration:underline"
        out.append(
            f'<a href="{escape(url, quote=True)}" style="{link_style}">{escape(url)}</a>{escape(tail)}'
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
    support = (settings.UPNEXT_SUPPORT_EMAIL or settings.UPNEXT_OFFICIAL_EMAIL or "").strip()
    help_line = (
        f' Questions? Write to <a href="mailto:{escape(support, quote=True)}" '
        f'style="color:#000000;text-decoration:underline">{escape(support)}</a>.'
        if support
        else ""
    )
    brand = escape(settings.UPNEXT_BRAND_NAME)
    short = escape(settings.UPNEXT_BRAND_SHORT)
    descriptor = escape(settings.UPNEXT_BRAND_NAME.removeprefix(settings.UPNEXT_BRAND_SHORT).strip() or "")
    body_style = (
        "margin:0;background:#ffffff;color:#101828;font-family:Arial,Helvetica,sans-serif;font-size:16px"
    )
    mark_style = "margin:0;font-size:26px;line-height:1;font-weight:900;letter-spacing:1px;color:#000000"
    sub_style = "margin:4px 0 24px;font-size:10px;line-height:1;letter-spacing:6px;color:#000000"
    foot_style = "margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e7ec;font-size:13px;color:#475467"
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(subject)}</title></head>"
        f'<body style="{body_style}"><div style="max-width:560px;margin:0 auto;padding:24px 16px">'
        f'<p style="{mark_style}">{short}</p>'
        f'<p style="{sub_style}">{descriptor.upper()}</p>'
        f"{rows}"
        f'<p style="{foot_style}">{brand} · Jobs and opportunities in Zimbabwe.{help_line}</p>'
        "</div></body></html>"
    )
