"""The UPNEXT Careers e-mail design system: one structured message, rendered twice (HTML and plain text).

A message is described once, as an `EmailContent` (heading, paragraphs, one call to action, facts, notices,
listings, links). `render_html` and `render_text` both read that object, so the two alternatives cannot drift
apart and a link, a date or an expiry cannot be in one and not the other.

HTML rules (compatibility over cleverness):

* one column, at most 600 px, built from presentation tables with inline CSS; a small `<style>` block adds the
  phone layout and the dark scheme, and every colour used there also has a legible inline default, so a client
  that strips the block still shows a correct light message;
* the call to action is a "bulletproof" button: a rounded VML shape for Outlook on Windows, an ordinary linked
  block everywhere else, with the link repeated as visible text for clients that block links or images;
* images are limited to the logo and, for verification only, one small illustration, both PNG files on the
  site's own HTTPS origin, with alt text and fixed dimensions. A message is complete without them: the
  header keeps its dark background and the alt text is styled to be readable on it;
* no scripts, forms, iframes, web fonts, remote CSS, tracking pixels or tracked links. Every value that comes
  from a person (names, titles, reasons) is HTML-escaped; only the links the code builds are made clickable.

Colours come from the design tokens (`apps/web/src/design/tokens.json`): purple #533afd, ink #061b31, line
#e5edf5, tint #f1effe, brand dark #1c1e54 for the header. Dark values are the tokens' dark theme.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape

from django.conf import settings

# --- palette (tokens.json) -----------------------------------------------------------------------------
INK = "#061b31"
MUTED = "#5a6a82"  # DEV-05: the corrected slate that passes 4.5:1 on white
LINE = "#e5edf5"
PAGE = "#f6f9fc"
CARD = "#ffffff"
TINT = "#f1effe"
ACCENT = "#533afd"
ON_ACCENT = "#ffffff"
HEADER = "#1c1e54"
HEADER_TEXT = "#d4d7f2"

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
CONTENT_WIDTH = 600
PAD = 40
INNER_WIDTH = CONTENT_WIDTH - 2 * PAD  # 520: the width the Outlook button needs in pixels

LOGO_FILE = "upnext-email-logo.png"  # 444x80 PNG shown at 222x40
ILLUSTRATION_FILE = "verify-illustration.png"  # 480x360 PNG shown at 240x180
ASSET_PATH = "/brand/email/"


# --- content model -------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Cta:
    label: str
    url: str


@dataclass(frozen=True)
class Notice:
    title: str
    body: str = ""


@dataclass(frozen=True)
class Fact:
    label: str
    value: str


@dataclass(frozen=True)
class Link:
    label: str
    url: str


@dataclass(frozen=True)
class Listing:
    title: str
    url: str
    organisation: str = ""
    place: str = ""
    kind: str = ""
    closes: str = ""


@dataclass(frozen=True)
class EmailContent:
    subject: str
    preheader: str
    eyebrow: str
    heading: str
    paragraphs: tuple[str, ...] = ()
    bullets: tuple[str, ...] = ()
    facts: tuple[Fact, ...] = ()
    quote: tuple[str, str] | None = None  # (label, text): words a person wrote, shown set apart
    cta: Cta | None = None
    fallback: bool = False  # repeat the CTA link as visible text
    listings: tuple[Listing, ...] = ()
    closing: tuple[str, ...] = ()  # paragraphs after the CTA and listings
    notices: tuple[Notice, ...] = ()
    links: tuple[Link, ...] = ()  # secondary text links
    illustration: bool = False
    reason: str = ""  # why this message was sent


@dataclass(frozen=True)
class Brand:
    name: str
    short: str
    domain: str
    base_url: str
    support_email: str
    tagline: str
    year: int
    asset_base: str  # where the images live; the site's own origin unless a preview overrides it


def brand_context(*, asset_base: str | None = None, now: datetime | None = None) -> Brand:
    base = str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip("/")
    support = (settings.UPNEXT_SUPPORT_EMAIL or settings.UPNEXT_OFFICIAL_EMAIL or "").strip()
    return Brand(
        name=settings.UPNEXT_BRAND_NAME,
        short=settings.UPNEXT_BRAND_SHORT,
        domain=settings.UPNEXT_BRAND_DOMAIN,
        base_url=base,
        support_email=support or settings.UPNEXT_OFFICIAL_EMAIL,
        tagline="Jobs and opportunities in Zimbabwe.",
        year=(now or datetime.now()).year,
        asset_base=(asset_base if asset_base is not None else base + ASSET_PATH.rstrip("/")).rstrip("/"),
    )


# --- small helpers -------------------------------------------------------------------------------------
def _e(value: str) -> str:
    return escape(value, quote=True)


def _url(value: str) -> str:
    return escape(value, quote=True)


def one_line(value: str, limit: int = 200) -> str:
    """A person's text on one line, without control characters, cut at `limit`."""
    cleaned = " ".join("".join(ch if ch.isprintable() else " " for ch in value).split())
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


# --- plain text ----------------------------------------------------------------------------------------
def render_text(c: EmailContent, b: Brand) -> str:
    """The plain-text alternative: the same content, nothing HTML-escaped (a name such as "Tom & Jerry" or a
    link's "&" must arrive as typed)."""
    out: list[str] = [c.eyebrow.upper(), "", c.heading]
    for paragraph in c.paragraphs:
        out += ["", paragraph]
    for bullet in c.bullets:
        out.append(f"- {bullet}")
    if c.facts:
        out.append("")
        out += [f"{f.label}: {f.value}" for f in c.facts]
    if c.quote:
        out += ["", f"{c.quote[0]}", *(f"> {line}" for line in c.quote[1].splitlines() or [""])]
    if c.cta:
        out += ["", f"{c.cta.label}:", c.cta.url]
    for number, item in enumerate(c.listings, 1):
        details = " - ".join(x for x in (item.organisation, item.place, item.kind, item.closes) if x)
        out += ["", f"{number}. {item.title}"]
        if details:
            out.append(details)
        out.append(item.url)
    for paragraph in c.closing:
        out += ["", paragraph]
    for notice in c.notices:
        out += ["", f"{notice.title} {notice.body}".strip()]
    if c.links:
        out.append("")
        out += [f"{link.label}: {link.url}" for link in c.links]
    if c.reason:
        out += ["", c.reason]
    out += [
        "",
        "-- ",
        f"{b.name} · {b.tagline}",
        f"Questions? Write to {b.support_email}",
        f"{b.base_url}",
        f"About: {b.base_url}/about · Contact: {b.base_url}/contact",
        f"Privacy: {b.base_url}/privacy · Terms: {b.base_url}/terms",
        f"© {b.year} {b.name}. All rights reserved.",
    ]
    return "\n".join(out) + "\n"


# --- HTML ----------------------------------------------------------------------------------------------
# Class names are styling hooks for the phone layout and dark scheme; the inline style is the light default.
_DARK = {
    "bg-page": "background-color:#0e0f2e",
    "bg-card": "background-color:#151634",
    "bg-tint": "background-color:#1e1f4a",
    "bd": "border-color:#262743",
    "t-ink": "color:#e8ecf0",
    "t-muted": "color:#a3adbf",
    "t-link": "color:#b9b9f9",
    "t-accent": "color:#b9b9f9",
    "bg-accent": "background-color:#5a51f5",
}


def _style_block() -> str:
    dark = "".join(
        f".{name}{{{rule.replace(';', ' !important;') + ' !important'}}}" for name, rule in _DARK.items()
    )
    dark_outlook = "".join(f"[data-ogsc] .{name}{{{rule + ' !important'}}}" for name, rule in _DARK.items())
    return (
        "<style>"
        ":root{color-scheme:light dark;supported-color-schemes:light dark}"
        "body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}"
        "img{-ms-interpolation-mode:bicubic}"
        "a{overflow-wrap:anywhere}"
        f"@media (max-width:620px){{"
        ".container{width:100%!important;max-width:100%!important}"
        ".px{padding-left:20px!important;padding-right:20px!important}"
        ".outer{padding:0!important}"
        ".h1{font-size:26px!important;line-height:32px!important}"
        ".lead{font-size:16px!important;line-height:25px!important}"
        ".stack{display:block!important;width:100%!important}"
        ".hide-m{display:none!important;max-height:0!important;overflow:hidden!important}"
        ".full-m{width:100%!important}"
        "}"
        f"@media (prefers-color-scheme:dark){{{dark}.header-img{{opacity:1}}}}"
        f"{dark_outlook}"
        "</style>"
    )


def _p(
    text: str, *, size: int = 16, line: int = 26, color: str = MUTED, cls: str = "t-muted", extra: str = ""
) -> str:
    return (
        f'<p class="{cls}" style="margin:0 0 16px;font-family:{FONT};font-size:{size}px;line-height:{line}px;'
        f'color:{color};overflow-wrap:anywhere;word-break:break-word;{extra}">{_e(text)}</p>'
    )


def _button(label: str, url: str, *, width: int = INNER_WIDTH, height: int = 52) -> str:
    """Bulletproof button: VML rounded rectangle for Outlook on Windows, a linked block elsewhere."""
    safe_label, safe_url = _e(label), _url(url)
    return (
        "<!--[if mso]>"
        f'<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" '
        f'xmlns:w="urn:schemas-microsoft-com:office:word" '
        f'href="{safe_url}" style="height:{height}px;v-text-anchor:middle;width:{width}px" arcsize="8%" '
        f'stroke="f" fillcolor="{ACCENT}"><w:anchorlock/>'
        f'<center style="color:{ON_ACCENT};font-family:Arial,sans-serif;font-size:17px;font-weight:bold">'
        f"{safe_label}</center></v:roundrect><![endif]-->"
        "<!--[if !mso]><!-->"
        f'<a href="{safe_url}" class="bg-accent" target="_blank" style="display:block;box-sizing:border-box;'
        f"background-color:{ACCENT};border-radius:6px;color:{ON_ACCENT};font-family:{FONT};font-size:17px;"
        f'font-weight:600;line-height:24px;padding:14px 20px;text-align:center;text-decoration:none">'
        f"{safe_label}&nbsp;&rarr;</a>"
        "<!--<![endif]-->"
    )


def _small_button(label: str, url: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
        f'<td class="bg-accent" bgcolor="{ACCENT}" style="border-radius:6px;background-color:{ACCENT}">'
        f'<a href="{_url(url)}" target="_blank" style="display:inline-block;padding:10px 18px;'
        f"font-family:{FONT};font-size:15px;font-weight:600;line-height:20px;color:{ON_ACCENT};"
        f'text-decoration:none">{_e(label)}</a></td></tr></table>'
    )


def _notice(n: Notice) -> str:
    body = (
        f'<p class="t-muted" style="margin:4px 0 0;font-family:{FONT};font-size:15px;line-height:23px;'
        f'color:{MUTED}">{_e(n.body)}</p>'
        if n.body
        else ""
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:0 0 12px"><tr>'
        f'<td width="4" class="bg-accent" bgcolor="{ACCENT}" style="width:4px;background-color:{ACCENT};'
        f'border-radius:4px 0 0 4px;font-size:0;line-height:0">&nbsp;</td>'
        f'<td class="bg-tint" bgcolor="{TINT}" style="background-color:{TINT};border-radius:0 8px 8px 0;'
        f'padding:14px 18px"><p class="t-ink" '
        f'style="margin:0;font-family:{FONT};font-size:16px;line-height:24px;'
        f'font-weight:700;color:{INK};overflow-wrap:anywhere">{_e(n.title)}</p>{body}</td></tr></table>'
    )


def _facts(facts: tuple[Fact, ...]) -> str:
    rows = "".join(
        f'<tr><td class="t-muted bd" valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid '
        f"{LINE};"
        f'font-family:{FONT};font-size:14px;line-height:20px;color:{MUTED};width:38%">{_e(f.label)}</td>'
        f'<td class="t-ink bd" valign="top" style="padding:10px 0;border-bottom:1px solid {LINE};'
        f"font-family:{FONT};font-size:15px;line-height:21px;color:{INK};font-weight:600;"
        f'overflow-wrap:anywhere;word-break:break-word">{_e(f.value)}</td></tr>'
        for f in facts
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:0 0 20px;border-top:1px solid {LINE}" class="bd">{rows}</table>'
    )


def _quote(label: str, text: str) -> str:
    lines = "<br>".join(_e(line) for line in text.splitlines())
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:0 0 20px">'
        f'<tr><td width="4" bgcolor="{LINE}" class="bd" style="width:4px;background-color:{LINE}">&nbsp;</td>'
        f'<td style="padding:6px 0 6px 16px"><p class="t-muted" style="margin:0 0 4px;font-family:{FONT};'
        f"font-size:13px;line-height:18px;color:{MUTED};text-transform:uppercase;"
        f'letter-spacing:1px">{_e(label)}</p>'
        f'<p class="t-ink" style="margin:0;font-family:{FONT};font-size:16px;line-height:25px;color:{INK};'
        f'overflow-wrap:anywhere;word-break:break-word">{lines}</p></td></tr></table>'
    )


def _listing(item: Listing) -> str:
    meta = [(x) for x in (item.organisation, item.place) if x]
    meta2 = [(x) for x in (item.kind, item.closes) if x]
    line1 = (
        f'<p class="t-muted" style="margin:4px 0 0;font-family:{FONT};font-size:15px;line-height:22px;'
        f'color:{MUTED};overflow-wrap:anywhere">{_e(" · ".join(meta))}</p>'
        if meta
        else ""
    )
    line2 = (
        f'<p class="t-muted" style="margin:2px 0 0;font-family:{FONT};font-size:14px;line-height:21px;'
        f'color:{MUTED}">{_e(" · ".join(meta2))}</p>'
        if meta2
        else ""
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bd" '
        f'style="margin:0 0 12px;border:1px solid {LINE};border-radius:8px"><tr><td style="padding:16px '
        f'18px">'
        f'<p style="margin:0;font-family:{FONT};font-size:17px;line-height:25px;font-weight:700;'
        f'overflow-wrap:anywhere;word-break:break-word"><a href="{_url(item.url)}" class="t-ink" '
        f'style="color:{INK};text-decoration:none">{_e(item.title)}</a></p>{line1}{line2}'
        f'<div style="padding-top:14px">{_small_button("View opportunity", item.url)}</div>'
        f"</td></tr></table>"
    )


def _fallback(url: str) -> str:
    return (
        f'<p class="t-muted" style="margin:14px 0 0;font-family:{FONT};font-size:13px;line-height:20px;'
        f'color:{MUTED}">If the button does not work, copy and paste this link into your browser:</p>'
        f'<p style="margin:4px 0 0;font-family:{FONT};font-size:13px;line-height:20px;word-break:break-all;'
        f'overflow-wrap:anywhere"><a href="{_url(url)}" class="t-link" style="color:{ACCENT};'
        f'text-decoration:underline">{_e(url)}</a></p>'
    )


def _link_row(links: tuple[Link, ...]) -> str:
    parts = " &nbsp;·&nbsp; ".join(
        f'<a href="{_url(link.url)}" class="t-link" style="color:{ACCENT};text-decoration:underline">'
        f"{_e(link.label)}</a>"
        for link in links
    )
    return f'<p style="margin:8px 0 0;font-family:{FONT};font-size:15px;line-height:24px">{parts}</p>'


def _header(b: Brand) -> str:
    logo = (
        f'<img class="header-img" src="{_url(b.asset_base)}/{LOGO_FILE}" width="222" height="40" '
        f'alt="{_e(b.name)}" style="display:block;border:0;outline:none;text-decoration:none;width:222px;'
        f'height:40px;color:#ffffff;font-family:{FONT};font-size:24px;line-height:40px;font-weight:800">'
    )
    return (
        f'<tr><td class="px" bgcolor="{HEADER}" style="background-color:{HEADER};padding:32px {PAD}px 28px;'
        f'border-radius:12px 12px 0 0">'
        f'<a href="{_url(b.base_url)}" target="_blank" style="text-decoration:none;color:#ffffff">{logo}</a>'
        f'<p style="margin:12px 0 0;font-family:{FONT};font-size:16px;line-height:24px;color:{HEADER_TEXT}">'
        f"{_e(b.tagline)}</p></td></tr>"
    )


def _footer(b: Brand) -> str:
    def link(label: str, path: str) -> str:
        return (
            f'<a href="{_url(b.base_url + path)}" class="t-muted" '
            f'style="color:{MUTED};text-decoration:underline">'
            f"{label}</a>"
        )

    nav = " &nbsp;|&nbsp; ".join(
        [
            link("About", "/about"),
            link("Contact", "/contact"),
            link("Privacy", "/privacy"),
            link("Terms", "/terms"),
        ]
    )
    mail = _e(b.support_email)
    return (
        f'<tr><td class="px bd" style="padding:24px {PAD}px 0;border-top:1px solid {LINE}">'
        f'<p class="t-ink" '
        f'style="margin:0;font-family:{FONT};font-size:14px;line-height:20px;font-weight:700;'
        f'letter-spacing:1px;color:{INK}">{_e(b.name.upper())}</p>'
        f'<p class="t-muted" style="margin:4px 0 0;font-family:{FONT};font-size:14px;line-height:22px;'
        f'color:{MUTED}">{_e(b.tagline)} Questions? Write to '
        f'<a href="mailto:{mail}" class="t-link" '
        f'style="color:{ACCENT};text-decoration:underline">{mail}</a>. '
        f'<a href="{_url(b.base_url)}" class="t-link" style="color:{ACCENT};text-decoration:underline">'
        f"{_e(b.domain)}</a></p></td></tr>"
        f'<tr><td class="px" align="center" style="padding:16px {PAD}px 28px">'
        f'<p style="margin:0;font-family:{FONT};font-size:13px;line-height:22px">{nav}</p>'
        f'<p class="t-muted" style="margin:8px 0 0;font-family:{FONT};font-size:12px;line-height:18px;'
        f'color:{MUTED}">© {b.year} {_e(b.name)}. All rights reserved.</p></td></tr>'
    )


def _body(c: EmailContent, b: Brand) -> str:
    lead = "".join(
        f'<p class="lead t-muted" style="margin:0 0 16px;font-family:{FONT};font-size:17px;line-height:27px;'
        f'color:{MUTED};overflow-wrap:anywhere;word-break:break-word">{_e(text)}</p>'
        for text in c.paragraphs
    )
    bullets = (
        f'<ul style="margin:0 0 16px;padding:0 0 0 22px;font-family:{FONT};font-size:16px;line-height:26px;'
        f'color:{MUTED}" class="t-muted">'
        + "".join(f'<li style="margin:0 0 6px">{_e(x)}</li>' for x in c.bullets)
        + "</ul>"
        if c.bullets
        else ""
    )
    title_block = (
        f'<p class="t-accent" style="margin:0 0 12px;font-family:{FONT};font-size:13px;line-height:18px;'
        f'font-weight:700;letter-spacing:2px;text-transform:uppercase;color:{ACCENT}">{_e(c.eyebrow)}</p>'
        f'<h1 class="h1 t-ink" style="margin:0 0 16px;font-family:{FONT};font-size:34px;line-height:40px;'
        f'font-weight:800;color:{INK};overflow-wrap:anywhere;word-break:break-word">{_e(c.heading)}</h1>'
    )
    if c.illustration:
        art = (
            f'<img src="{_url(b.asset_base)}/{ILLUSTRATION_FILE}" width="200" height="150" alt="" '
            f'style="display:block;border:0;width:200px;height:150px">'
        )
        intro = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td class="stack" valign="top" style="padding-right:12px">{title_block}{lead}</td>'
            f'<td class="stack hide-m" width="200" valign="middle" align="right" '
            f'style="width:200px">{art}</td>'
            "</tr></table>"
        )
    else:
        intro = title_block + lead
    parts = [intro, bullets]
    if c.facts:
        parts.append(_facts(c.facts))
    if c.quote:
        parts.append(_quote(*c.quote))
    if c.cta:
        parts.append(f'<div style="margin:8px 0 0">{_button(c.cta.label, c.cta.url)}</div>')
        if c.fallback:
            parts.append(_fallback(c.cta.url))
        parts.append('<div style="height:24px;line-height:24px;font-size:0">&nbsp;</div>')
    parts.extend(_listing(item) for item in c.listings)
    if c.listings:
        parts.append('<div style="height:8px;line-height:8px;font-size:0">&nbsp;</div>')
    parts.extend(_p(text, size=15, line=24) for text in c.closing)
    parts.extend(_notice(n) for n in c.notices)
    if c.links:
        parts.append(_link_row(c.links))
    if c.reason:
        parts.append(_p(c.reason, size=13, line=20, extra="margin-top:16px"))
    inner = "".join(parts)
    return (
        f'<tr><td class="px bg-card" bgcolor="{CARD}" '
        f'style="background-color:{CARD};padding:36px {PAD}px 28px">{inner}</td></tr>'
    )


def render_html(c: EmailContent, b: Brand) -> str:
    preheader = _e(one_line(c.preheader, 150))
    filler = "&#847;&zwnj;&nbsp;" * 40  # keeps the first lines of the body out of the inbox preview
    return (
        '<!doctype html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" '
        'xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
        '<meta name="x-apple-disable-message-reformatting">'
        '<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">'
        '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" '
        'content="light dark">'
        f"<title>{_e(c.subject)}</title>"
        "<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>"
        "</o:OfficeDocumentSettings></xml></noscript><![endif]-->"
        f"{_style_block()}</head>"
        f'<body class="bg-page" style="margin:0;padding:0;background-color:{PAGE};word-spacing:normal">'
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;'
        f'color:{PAGE}">{preheader}{filler}</div>'
        f'<div role="article" aria-roledescription="email" aria-label="{_e(c.subject)}" lang="en" dir="ltr">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-page" '
        f'bgcolor="{PAGE}" style="background-color:{PAGE}"><tr><td align="center" class="outer" '
        f'style="padding:24px 12px">'
        f'<!--[if mso]><table role="presentation" width="{CONTENT_WIDTH}" align="center" cellpadding="0" '
        f'cellspacing="0"><tr><td><![endif]-->'
        f'<table role="presentation" class="container bg-card" width="100%" cellpadding="0" cellspacing="0" '
        f'border="0" '
        f'style="width:100%;max-width:{CONTENT_WIDTH}px;background-color:{CARD};border-radius:12px;'
        f'border:1px solid {LINE}">'
        f"{_header(b)}{_body(c, b)}{_footer(b)}"
        "</table>"
        "<!--[if mso]></td></tr></table><![endif]-->"
        "</td></tr></table></div></body></html>"
    )
