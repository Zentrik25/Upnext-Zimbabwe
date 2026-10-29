"""Small read-only staff pages that are not tied to one model."""

from __future__ import annotations

from typing import Any

from django.contrib import admin
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.template.response import TemplateResponse
from django.urls import reverse
from django.views.decorators.cache import never_cache

from access.registry import Permission, Role
from catalog.models import Organisation
from opportunities import health
from opportunities.admin import listings_visible_to, search_listings
from opportunities.models import VersionState
from reports.models import ListingReport


def content_health(request: HttpRequest) -> HttpResponse:
    roles = request.user.active_roles()  # type: ignore[union-attr]
    if Role.EDITOR not in roles and Role.ADMINISTRATOR not in roles:
        return HttpResponse("You do not have access to this page.", status=403)
    data = health.report()
    context = {
        **admin.site.each_context(request),
        "title": "Content health",
        "data": data,
        "per_category": sorted(data["live_per_category"].items()),
        "pipeline": sorted(data["pipeline"].items()),
    }
    return TemplateResponse(request, "admin/content_health.html", context)


SEARCH_MIN = 2
SEARCH_MAX = 80
SEARCH_PER_GROUP = 5


@never_cache
def search(request: HttpRequest) -> HttpResponse:
    """Suggestions for the staff search box: a few listings, organisations and reports the person may already
    open. Reads only. Listings come from the same visibility rule as the list (`listings_visible_to`), and a
    revision that is another person's draft is never matched or shown, so the box cannot reveal what the list
    and the change page would hide."""
    user: Any = request.user
    term = str(request.GET.get("q", "")).strip()[:SEARCH_MAX]
    groups: list[dict[str, Any]] = []
    if len(term) >= SEARCH_MIN:
        listing_hits = _listing_hits(user, term)
        if listing_hits:
            groups.append({"group": "Opportunities", "items": listing_hits})
        if user.has_permission_code(Permission.ORG_CREATE):
            orgs = Organisation.objects.filter(name__icontains=term, merged_into__isnull=True).order_by(
                "name"
            )
            items = [
                {
                    "label": o.name,
                    "hint": "Organisation",
                    "url": reverse("admin:catalog_organisation_change", args=[o.pk]),
                }
                for o in orgs[:SEARCH_PER_GROUP]
            ]
            if items:
                groups.append({"group": "Organisations", "items": items})
        if user.has_permission_code(Permission.REPORT_READ):
            reports = ListingReport.objects.filter(reference__istartswith=term).order_by("-created_at")
            items = [
                {
                    "label": r.reference,
                    "hint": r.get_status_display(),
                    "url": reverse("admin:reports_listingreport_change", args=[r.pk]),
                }
                for r in reports[:SEARCH_PER_GROUP]
            ]
            if items:
                groups.append({"group": "Public reports", "items": items})
    return JsonResponse({"query": term, "groups": groups})


def _listing_hits(user: Any, term: str) -> list[dict[str, str]]:
    hits = search_listings(user, listings_visible_to(user), term).order_by("-updated_at")
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for opp in hits[: SEARCH_PER_GROUP * 3]:
        if str(opp.pk) in seen:
            continue
        seen.add(str(opp.pk))
        version = opp.live_version or opp.pending_version
        if version is None or (
            version.state == VersionState.DRAFT
            and version.author_id != user.pk
            and not user.has_permission_code(Permission.AUDIT_READ_ALL)
        ):
            continue
        out.append(
            {
                "label": (version.title or "Untitled draft")[:90],
                "hint": f"{version.organisation.name} - {opp.get_status_display()}",
                "url": reverse("admin:opportunities_opportunity_change", args=[opp.pk]),
            }
        )
        if len(out) == SEARCH_PER_GROUP:
            break
    return out
