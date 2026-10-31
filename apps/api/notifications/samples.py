"""Synthetic data for previewing and testing every message. Nothing here is real: the people, organisations
and listings are invented, the links point at the reserved `.example` origin, and the "token" in a link is an
obvious placeholder that no `AuthToken` row backs, so no sample can be used to sign in or reset anything.
"""

from __future__ import annotations

from typing import Any, Literal

from django.conf import settings

from .content import Context
from .models import EmailKind

Variant = Literal["normal", "long", "minimal"]

SAMPLE_BASE = "https://upnext.example"
PLACEHOLDER_TOKEN = "SAMPLE-PLACEHOLDER-NOT-A-REAL-TOKEN"  # noqa: S105

_LONG_NAME = "Tendai Rutendo Nyasha Chikwanha-Mutasa-Moyo of the Highfield Community Trust Harare"
_LONG_TITLE = (
    "Senior Monitoring, Evaluation, Accountability and Learning Officer (Regional Programme, "
    "Southern Africa, Fixed Term Contract with Possible Extension)"
)
_LONG_ORG = "The Zimbabwe National Chamber of Commerce and Industry Regional Development Programme Office"


def _alert_items(variant: Variant) -> list[dict[str, str]]:
    if variant == "minimal":
        return [
            {
                "title": "Data Entry Clerk",
                "organisation": "",
                "place": "",
                "closes": "",
                "path": "/opportunities/x",
            }
        ]
    title = _LONG_TITLE if variant == "long" else "Civil Engineer"
    org = _LONG_ORG if variant == "long" else "Mutare City Council"
    return [
        {
            "title": title,
            "organisation": org,
            "place": "Mutare",
            "closes": "Closes 14 Jan 2027",
            "kind": "Jobs",
        },
        {
            "title": "Graduate Trainee Programme",
            "organisation": "Econet Wireless Zimbabwe",
            "place": "Harare",
            "closes": "Closes 30 Nov 2026",
            "kind": "Internships",
        },
        {
            "title": "Chevening Scholarships 2027/28",
            "organisation": "British Embassy Harare",
            "place": "Location not stated",
            "closes": "No closing date stated",
            "kind": "Scholarships",
        },
    ]


def sample_context(kind: str, variant: Variant = "normal") -> Context:
    """Everything a template can read for `kind`, as `services.build_message` would hand it over."""
    name = {"normal": "Silveroxy", "long": _LONG_NAME, "minimal": ""}[variant]
    long = variant == "long"
    minimal = variant == "minimal"
    title = _LONG_TITLE if long else "Civil Engineer"
    org = _LONG_ORG if long else "Mutare City Council"
    ctx: dict[str, Any] = {
        "display_name": name,
        "base_url": SAMPLE_BASE,
        "brand_name": settings.UPNEXT_BRAND_NAME,
        "brand_short": settings.UPNEXT_BRAND_SHORT,
        "contact_email": settings.UPNEXT_OFFICIAL_EMAIL,
        "link": None,
    }
    if kind in (EmailKind.EMAIL_VERIFICATION, EmailKind.EMAIL_CHANGE_CONFIRM):
        extra = "&change=1" if kind == EmailKind.EMAIL_CHANGE_CONFIRM else ""
        ctx["link"] = f"{SAMPLE_BASE}/verify-email?token={PLACEHOLDER_TOKEN}{extra}"
    elif kind == EmailKind.PASSWORD_RESET:
        ctx["link"] = f"{SAMPLE_BASE}/reset-password?token={PLACEHOLDER_TOKEN}"
    elif kind == EmailKind.ACCOUNT_DELETION_NOTICE:
        ctx.update(scheduled_date="30 November 2026", days=30)
    elif kind == EmailKind.JOB_ALERT:
        items = [
            {**i, "url": f"{SAMPLE_BASE}{i.get('path', '/opportunities/sample')}"}
            for i in _alert_items(variant)
        ]
        ctx.update(
            headline="3 new opportunities matching your alert."
            if not minimal
            else "1 new opportunity matching your alert.",
            frequency="weekly",
            items=items if not minimal else items[:1],
            more_count=0 if minimal else 4,
            search_url=f"{SAMPLE_BASE}/opportunities?sort=newest",
            manage_url=f"{SAMPLE_BASE}/alerts",
            unsubscribe_url=f"{SAMPLE_BASE}/alerts/unsubscribe?token={PLACEHOLDER_TOKEN}",
        )
        if minimal:
            ctx["items"][0]["url"] = f"{SAMPLE_BASE}/opportunities/data-entry-clerk"
    elif str(kind).startswith("employer_"):
        ctx.update(
            organisation_name=org,
            title=title,
            amendment=False,
            dashboard_url=f"{SAMPLE_BASE}/employer",
            listing_url=f"{SAMPLE_BASE}/employer/listings/00000000-0000-0000-0000-000000000000",
            public_url="" if minimal else f"{SAMPLE_BASE}/opportunities/civil-engineer",
            reason=""
            if minimal
            else "The closing date has already passed.\nPlease give a future date and resubmit.",
            deadline_text="" if minimal else "14 January 2027",
            days_left=7,
        )
    return ctx


SAMPLE_KINDS: tuple[str, ...] = tuple(str(k) for k in EmailKind)
