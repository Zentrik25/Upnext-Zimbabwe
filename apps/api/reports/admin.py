"""Staff moderation of public reports (M2), in the existing Django Admin.

Nothing here writes state directly. Every action is posted to `reports.moderation`, which holds the rules
(permissions, separation of duties, the editorial workflow for listing actions, audit) and refuses what is
not allowed. A report never changes a listing by itself.
"""

from __future__ import annotations

import uuid
from typing import Any

from django import forms
from django.contrib import admin, messages
from django.db.models import Case, Count, IntegerField, QuerySet, Value, When
from django.db.models.expressions import Combinable
from django.http import Http404, HttpRequest, HttpResponse, HttpResponseNotAllowed, HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.timesince import timesince

from access.registry import Permission
from accounts.models import User
from opportunities.errors import WorkflowError

from . import moderation
from .models import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    ListingReport,
    ReportEvent,
    ReportStatus,
)
from .staff import ACTIONS, available_actions


def _user(request: HttpRequest) -> User:
    return request.user  # type: ignore[return-value]


def _can(request: HttpRequest, code: Permission) -> bool:
    user = _user(request)
    return bool(user.is_authenticated and user.has_permission_code(code))


def _describe(exc: WorkflowError) -> str:
    if exc.fields:
        detail = "; ".join(f"{p}: {m}" for p, items in exc.fields.items() for _, m in items)
        return f"{exc.message} ({detail})"
    return f"{exc.message} [{exc.code}]"


# --- forms (one per action; every one carries the version the staff member was looking at) ---------------
# --- list filters ----------------------------------------------------------------------------------------
class QueueFilter(admin.SimpleListFilter):
    title = "work queue"
    parameter_name = "queue"

    def lookups(self, request: HttpRequest, model_admin: Any) -> list[tuple[str, str]]:
        return [
            ("new", "New (not yet taken)"),
            ("mine", "Assigned to me"),
            ("escalated", "Escalated"),
            ("open", "All open"),
            ("closed", "Closed"),
        ]

    def queryset(
        self, request: HttpRequest, queryset: QuerySet[ListingReport]
    ) -> QuerySet[ListingReport] | None:
        value = self.value()
        if value == "new":
            return queryset.filter(status=ReportStatus.OPEN)
        if value == "mine":
            return queryset.filter(assigned_to=_user(request), status__in=OPEN_STATUSES)
        if value == "escalated":
            return queryset.filter(status=ReportStatus.ESCALATED)
        if value == "open":
            return queryset.filter(status__in=OPEN_STATUSES)
        if value == "closed":
            return queryset.filter(status__in=CLOSED_STATUSES)
        return None


class RepeatFilter(admin.SimpleListFilter):
    title = "same listing"
    parameter_name = "repeat"

    def lookups(self, request: HttpRequest, model_admin: Any) -> list[tuple[str, str]]:
        return [("yes", "Listing has several open reports")]

    def queryset(
        self, request: HttpRequest, queryset: QuerySet[ListingReport]
    ) -> QuerySet[ListingReport] | None:
        if self.value() != "yes":
            return None
        busy = (
            ListingReport.objects.filter(status__in=OPEN_STATUSES)
            .values("opportunity")
            .annotate(n=Count("id"))
            .filter(n__gt=1)
            .values("opportunity")
        )
        return queryset.filter(opportunity__in=busy, status__in=OPEN_STATUSES)


class ReportEventInline(admin.TabularInline):  # type: ignore[type-arg]
    model = ReportEvent
    extra = 0
    can_delete = False
    fields = ("created_at", "action", "actor", "from_status", "to_status", "note")
    readonly_fields = fields

    def has_add_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False


@admin.register(ListingReport)
class ListingReportAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    """Report queue and case page. Read-only: changes happen only through the action forms."""

    change_form_template = "admin/reports/report_detail.html"
    list_display = ("reference", "listing", "reason", "state", "repeats", "assignee", "age")
    list_display_links = ("reference",)
    list_filter = (QueueFilter, "status", "reason", RepeatFilter)
    search_fields = ("reference", "opportunity__slug", "live_version__title", "details")
    list_select_related = ("opportunity", "live_version", "assigned_to")
    list_per_page = 50
    date_hierarchy = None
    readonly_fields = ()

    # -- access
    def has_module_permission(self, request: HttpRequest) -> bool:
        return _can(request, Permission.REPORT_READ)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _can(request, Permission.REPORT_READ)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    # -- queue: escalated first, then new, then investigating, then oldest first; closed last
    def get_queryset(self, request: HttpRequest) -> QuerySet[ListingReport]:
        rank = Case(
            When(status=ReportStatus.ESCALATED, then=Value(0)),
            When(status=ReportStatus.OPEN, then=Value(1)),
            When(status=ReportStatus.INVESTIGATING, then=Value(2)),
            default=Value(3),
            output_field=IntegerField(),
        )
        queryset: QuerySet[ListingReport] = self.model._default_manager.get_queryset()
        return queryset.annotate(_rank=rank).order_by("_rank", "created_at")

    def get_ordering(self, request: HttpRequest) -> list[str | Combinable]:
        return ["_rank", "created_at"]

    @admin.display(description="Listing", ordering="opportunity__slug")
    def listing(self, obj: ListingReport) -> str:
        title = obj.live_version.title if obj.live_version else obj.opportunity.slug or "(no title)"
        return title[:70]

    @admin.display(description="Status", ordering="_rank")
    def state(self, obj: ListingReport) -> str:
        return obj.get_status_display()

    @admin.display(description="Repeats")
    def repeats(self, obj: ListingReport) -> int:
        return obj.duplicate_count

    @admin.display(description="Assigned to")
    def assignee(self, obj: ListingReport) -> str:
        return obj.assigned_to.display_name if obj.assigned_to else "-"

    @admin.display(description="Age", ordering="created_at")
    def age(self, obj: ListingReport) -> str:
        from django.utils import timezone

        return timesince(obj.created_at, timezone.now()).split(",")[0]

    # -- case page and actions
    def get_urls(self) -> list[Any]:
        opts = self.model._meta
        custom = path(
            "<uuid:pk>/action/<slug:action>/",
            self.admin_site.admin_view(self.action_view),
            name=f"{opts.app_label}_{opts.model_name}_action",
        )
        return [custom, *super().get_urls()]

    def _context(
        self, request: HttpRequest, report: ListingReport, forms_by_action: dict[str, forms.Form]
    ) -> dict[str, Any]:
        opp = report.opportunity
        others = (
            ListingReport.objects.filter(opportunity=opp)
            .exclude(pk=report.pk)
            .order_by("-created_at")
            .values("pk", "reference", "reason", "status", "created_at")[:20]
        )
        evidence = report.evidence_url if (report.evidence_url or "").startswith("https://") else ""
        return {
            **self.admin_site.each_context(request),
            "title": f"Report {report.reference}",
            "opts": self.model._meta,
            "report": report,
            "listing_obj": opp,
            "listing_title": report.live_version.title if report.live_version else "",
            "listing_admin_url": reverse("admin:opportunities_opportunity_change", args=[opp.pk])
            if _user(request).is_staff
            else "",
            "public_url": f"/opportunities/{opp.slug}" if opp.slug else "",
            "evidence_url": evidence,
            "others": [
                {**o, "url": reverse("admin:reports_listingreport_change", args=[o["pk"]])} for o in others
            ],
            "events": report.events.select_related("actor"),
            "participant": moderation.is_participant(_user(request), opp),
            "forms": [
                {
                    "name": name,
                    "action": ACTIONS[name],
                    "form": form,
                    "url": reverse("admin:reports_listingreport_action", args=[report.pk, name]),
                }
                for name, form in forms_by_action.items()
            ],
            "list_url": reverse("admin:reports_listingreport_changelist"),
            "has_view_permission": True,
        }

    def _fresh_forms(
        self, request: HttpRequest, report: ListingReport, bound: dict[str, forms.Form] | None = None
    ) -> dict[str, forms.Form]:
        out: dict[str, forms.Form] = {}
        for name in available_actions(_user(request), report):
            out[name] = (bound or {}).get(name) or ACTIONS[name].form(
                initial={"row_version": report.row_version}
            )
        return out

    def change_view(
        self, request: HttpRequest, object_id: str, form_url: str = "", extra_context: Any = None
    ) -> HttpResponse:
        if request.method not in ("GET", "HEAD"):
            return HttpResponseNotAllowed(["GET", "HEAD"])
        report = (
            self.get_queryset(request)
            .select_related("opportunity", "live_version")
            .filter(pk=object_id)
            .first()
        )
        if report is None or not self.has_view_permission(request, report):
            raise Http404
        return TemplateResponse(
            request,
            self.change_form_template,
            self._context(request, report, self._fresh_forms(request, report)),
        )

    def action_view(self, request: HttpRequest, pk: uuid.UUID, action: str) -> HttpResponse:
        report = (
            self.get_queryset(request).select_related("opportunity", "live_version").filter(pk=pk).first()
        )
        if report is None or not self.has_view_permission(request, report) or action not in ACTIONS:
            raise Http404
        detail = reverse("admin:reports_listingreport_change", args=[report.pk])
        if request.method != "POST":
            return HttpResponseRedirect(detail)
        chosen = ACTIONS[action]
        form = chosen.form(request.POST)
        if form.is_valid():
            try:
                chosen.run(_user(request), report, form.cleaned_data)
            except WorkflowError as exc:
                messages.error(request, _describe(exc))
                return HttpResponseRedirect(detail)
            messages.success(request, f"{chosen.label}: done.")
            return HttpResponseRedirect(detail)
        # invalid: show the case page again with this form's errors inline
        report.refresh_from_db()
        bound = {action: form}
        shown = self._fresh_forms(request, report, bound)
        shown.setdefault(action, form)
        response = TemplateResponse(request, self.change_form_template, self._context(request, report, shown))
        response.status_code = 400
        return response
