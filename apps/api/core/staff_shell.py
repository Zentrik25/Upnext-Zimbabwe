"""The staff page shell: sidebar, bell menu, signed-in person, public-site link.

Built once per request from what the person may already open: a link appears only if Django Admin lists the
model for them (`available_apps`, which asks each ModelAdmin's own permission methods) or the permission code
that guards the page is held. Hiding a link is a convenience; every page and action re-checks on the server.
The shell is withheld on the sign-in and two-step pages and until the second step has passed, so no count or
name is shown to someone who has only a password.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qsl, urlsplit

from django.conf import settings
from django.http import HttpRequest
from django.urls import reverse

from access.registry import Permission, Role
from accounts.models import User
from core import staff_dashboard
from core.staff_mfa import OPEN_PATHS, SESSION_FLAG

CACHE_ATTR = "_staff_attention"
ROLE_ORDER = (Role.ADMINISTRATOR, Role.EDITOR, Role.CONTRIBUTOR)


@dataclass
class NavItem:
    label: str
    href: str
    icon: str
    active: bool = False
    badge: int = 0


@dataclass
class NavGroup:
    title: str
    items: list[NavItem] = field(default_factory=list)


def shell_enabled(request: HttpRequest) -> bool:
    user: Any = getattr(request, "user", None)
    if not request.path.startswith("/staff/") or request.path.startswith(OPEN_PATHS):
        return False
    if user is None or not user.is_authenticated or not user.is_staff:
        return False
    return not (settings.UPNEXT_STAFF_MFA_REQUIRED and not request.session.get(SESSION_FLAG))


def attention_for(request: HttpRequest) -> list[staff_dashboard.Attention]:
    """The needs-attention rows, computed once per request (sidebar, bell and dashboard share them)."""
    cached: list[staff_dashboard.Attention] | None = getattr(request, CACHE_ATTR, None)
    if cached is None:
        user: User = request.user  # type: ignore[assignment]
        cached = staff_dashboard.attention(user)
        setattr(request, CACHE_ATTR, cached)
    return cached


def _initials(name: str) -> str:
    parts = [p for p in name.replace("-", " ").split() if p]
    if not parts:
        return "?"
    return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()


def _role_label(user: User) -> str:
    roles = user.active_roles()
    for role in ROLE_ORDER:
        if role in roles:
            return f"Staff {role.value.title()}" if role != Role.ADMINISTRATOR else "Administrator"
    return "Staff"


def _model_urls(available_apps: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    """{"app_label.modelname": {"url": ..., "add": ...}} for the models Django Admin lists for this person."""
    out: dict[str, dict[str, str]] = {}
    for app in available_apps:
        for model in app.get("models", []):
            key = f"{app['app_label']}.{model['object_name'].lower()}"
            out[key] = {"url": model.get("admin_url") or "", "add": model.get("add_url") or ""}
    return out


def _query(href: str) -> dict[str, str]:
    return dict(parse_qsl(urlsplit(href).query))


def _item_active(request: HttpRequest, href: str, *, exact: bool = False, bare: bool = False) -> bool:
    """`exact`: the path must match and every query parameter of `href` must be present with the same value.
    `bare`: the path matches (any sub-page) and the list is not narrowed by a queue or status filter."""
    path = urlsplit(href).path
    if exact:
        wanted = _query(href)
        return request.path == path and all(request.GET.get(k) == v for k, v in wanted.items())
    if bare:
        narrowed = any(k in request.GET for k in ("queue", "status__exact", "deadline"))
        return (
            request.path.startswith(path)
            and not request.path.endswith("/add/")
            and not (request.path == path and narrowed)
        )
    return request.path.startswith(path)


def build(request: HttpRequest, available_apps: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not shell_enabled(request):
        return None
    user: User = request.user  # type: ignore[assignment]
    urls = _model_urls(available_apps)
    rows = {row.key: row for row in attention_for(request)}

    def count(key: str) -> int:
        return rows[key].count if key in rows else 0

    opp = urls.get("opportunities.opportunity", {})
    opp_url = opp.get("url") or reverse("admin:opportunities_opportunity_changelist")
    groups: list[NavGroup] = []

    def add(group: NavGroup, label: str, href: str | None, icon: str, **kwargs: Any) -> None:
        if not href:
            return
        active = _item_active(request, href, exact=kwargs.pop("exact", False), bare=kwargs.pop("bare", False))
        group.items.append(NavItem(label, href, icon, active, kwargs.pop("badge", 0)))

    home = NavGroup("")
    home.items.append(
        NavItem("Dashboard", reverse("admin:index"), "home", request.path == reverse("admin:index"))
    )
    groups.append(home)

    opps = NavGroup("Opportunities")
    add(opps, "All opportunities", opp_url, "briefcase", bare=True)
    if user.has_permission_code(Permission.OPP_DRAFT_CREATE):
        add(opps, "Create opportunity", opp.get("add"), "plus", exact=True)
    add(opps, "Drafts", f"{opp_url}?status__exact=draft", "file", exact=True)
    add(opps, "Published", f"{opp_url}?status__exact=published", "send", exact=True)
    add(opps, "Expired", f"{opp_url}?status__exact=expired", "clock", exact=True)
    groups.append(opps)

    editorial = NavGroup("Editorial")
    if user.has_permission_code(Permission.OPP_REVIEW_APPROVE):
        add(editorial, "Review queue", f"{opp_url}?queue=review", "inbox", exact=True, badge=count("review"))
    if user.has_permission_code(Permission.OPP_PUBLISH):
        add(
            editorial, "Ready to publish", f"{opp_url}?queue=ready", "check", exact=True, badge=count("ready")
        )
    claims = urls.get("employers.organisationclaim", {}).get("url")
    add(editorial, "Employer submissions", claims, "users", badge=count("employers"))
    add(editorial, "Employer profiles", urls.get("employers.profilerevision", {}).get("url"), "building")
    add(editorial, "Organisations", urls.get("catalog.organisation", {}).get("url"), "grid")
    add(
        editorial,
        "Public reports",
        urls.get("reports.listingreport", {}).get("url"),
        "flag",
        badge=count("reports"),
    )
    groups.append(editorial)

    content = NavGroup("Content")
    add(content, "Categories", urls.get("catalog.category", {}).get("url"), "layers")
    add(content, "Locations", urls.get("catalog.location", {}).get("url"), "pin")
    add(content, "Sectors", urls.get("catalog.sector", {}).get("url"), "tag")
    add(content, "Skills", urls.get("catalog.skill", {}).get("url"), "tag")
    groups.append(content)

    reports = NavGroup("Reports")
    if user.has_permission_code(
        Permission.OPP_REVIEW_APPROVE
    ):  # editors and administrators (as the page itself)
        add(reports, "Content health", reverse("staff-content-health"), "chart")
    add(reports, "Activity log", urls.get("opportunities.publishingevent", {}).get("url"), "activity")
    add(reports, "Audit log", urls.get("audit.auditevent", {}).get("url"), "shield")
    groups.append(reports)

    settings_group = NavGroup("Settings")
    add(settings_group, "Users", urls.get("accounts.user", {}).get("url"), "user")
    add(settings_group, "Staff roles", urls.get("accounts.staffroleassignment", {}).get("url"), "key")
    add(settings_group, "Outgoing e-mail", urls.get("notifications.emailoutbox", {}).get("url"), "mail")
    groups.append(settings_group)

    tasks = [row for row in rows.values() if row.actionable and row.count > 0]
    name = user.display_name
    return {
        "groups": [g for g in groups if g.items],
        "tasks": tasks,
        "task_total": sum(row.count for row in tasks),
        "user_name": name,
        "user_first_name": name.split()[0] if name.split() else name,
        "user_initials": _initials(name),
        "user_role": _role_label(user),
        "public_url": settings.UPNEXT_PUBLIC_BASE_URL,
        "can_create": user.has_permission_code(Permission.OPP_DRAFT_CREATE) and bool(opp.get("add")),
        "create_url": opp.get("add", ""),
        "search_url": opp_url,
    }
