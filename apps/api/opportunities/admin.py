"""Editorial CMS in the Django Admin (OQ-16 default, P2-06; ROLE_PERMISSION_MATRIX §5).

Principles
* Nothing here writes state. Every editorial action posts to `opportunities.workflow`, which holds the
  separation-of-duties rules; the admin only presents what a person may attempt and reports refusals.
* Visibility follows the matrix: Contributors see their own work, Editors the review pipeline (not other
  people's drafts), Administrators everything (viewing another person's draft is audited).
* Status is always shown as words (never colour alone).
"""

from __future__ import annotations

import contextvars
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.db.models import Q, QuerySet
from django.http import Http404, HttpRequest, HttpResponse, HttpResponseRedirect, JsonResponse
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join
from django.utils.safestring import SafeString, mark_safe

from access.registry import DEFAULT_REGISTRY, Permission
from accounts.models import User
from audit import services as audit
from catalog import media
from catalog.media import ProcessedImage
from catalog.models import MediaAsset, Organisation
from catalog.text import normalise_name
from catalog.validators import date_only_deadline

from . import admin_forms, slugs, social, workflow
from .errors import PermissionDeniedError, WorkflowError
from .models import (
    ListingStatus,
    Opportunity,
    OpportunitySource,
    OpportunityVersion,
    PublishingEvent,
    VerificationRecord,
    VersionLocation,
    VersionSector,
    VersionSkill,
    VersionState,
)
from .validation import fee_lint_triggers

_request: contextvars.ContextVar[HttpRequest | None] = contextvars.ContextVar("admin_request", default=None)

STATUS_TONES: dict[str, tuple[str, str]] = {
    ListingStatus.DRAFT: ("Draft", "#e9eef5"),
    ListingStatus.IN_REVIEW: ("In review", "#fdf1c7"),
    ListingStatus.APPROVED: ("Approved - ready to publish", "#d9f0dc"),
    ListingStatus.REJECTED: ("Rejected", "#f8d9d9"),
    ListingStatus.PUBLISHED: ("Published", "#cfe3fb"),
    ListingStatus.EXPIRED: ("Expired", "#e6e6e6"),
    ListingStatus.WITHDRAWN: ("Withdrawn", "#e6e6e6"),
    ListingStatus.ARCHIVED: ("Archived", "#e6e6e6"),
}
VERIFICATION_LABELS = {
    "not_verified": "Not verified",
    "source_checked": "Source checked (not confirmed with the issuer)",
    "issuer_verified": "Verified with the issuer",
}


def _user(request: HttpRequest) -> User:
    return request.user  # type: ignore[return-value]


def _can(request: HttpRequest, code: Permission) -> bool:
    user = _user(request)
    return bool(user.is_authenticated and user.has_permission_code(code))


def _is_staff(request: HttpRequest) -> bool:
    user = _user(request)
    return bool(user.is_authenticated and user.is_staff)


def _sees_all_drafts(request: HttpRequest) -> bool:
    return _can(
        request, Permission.AUDIT_READ_ALL
    )  # Administrators only (matrix: drafts, read-only, audited)


def _words(value: str | None) -> str:
    return value.replace("_", " ") if value else "-"


def badge(text: str, colour: str) -> SafeString:
    return format_html(
        '<span style="display:inline-block;padding:1px 6px;border:1px solid #1b2a3a;background:{};color:#1b2a3a">{}</span>',
        colour,
        text,
    )


def status_badge(status: str) -> SafeString:
    label, colour = STATUS_TONES.get(status, (status, "#e9eef5"))
    return badge(label, colour)


class ServiceRefused(Exception):
    def __init__(self, error: WorkflowError) -> None:
        super().__init__(error.message)
        self.error = error


def describe(error: WorkflowError) -> str:
    if error.fields:
        details = "; ".join(f"{path}: {msg}" for path, items in error.fields.items() for _, msg in items)
        return f"{error.message} ({details})"
    return f"{error.message} [{error.code}]"


def _visible_versions(request: HttpRequest) -> QuerySet[OpportunityVersion]:
    user = _user(request)
    base = OpportunityVersion.objects.select_related("opportunity", "organisation", "author")
    if _sees_all_drafts(request):
        return base
    mine = Q(author=user)
    if _can(request, Permission.OPP_REVIEW_APPROVE):
        return base.filter(mine | ~Q(state=VersionState.DRAFT))
    return base.filter(mine)


# --- list filters --------------------------------------------------------------------------------------
class QueueFilter(admin.SimpleListFilter):
    title = "work queue"
    parameter_name = "queue"

    def lookups(self, request: HttpRequest, model_admin: Any) -> list[tuple[str, str]]:
        return [
            ("review", "Awaiting my review"),
            ("ready", "Approved - ready to publish"),
            ("mine", "My drafts and rejected items"),
            ("amendments", "Open amendments"),
        ]

    def queryset(self, request: HttpRequest, queryset: QuerySet[Opportunity]) -> QuerySet[Opportunity] | None:
        user = _user(request)
        value = self.value()
        open_states = [VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED]
        if value == "review":  # excludes what I authored or submitted (the service re-checks the whole chain)
            return queryset.filter(pending_version__state=VersionState.IN_REVIEW).exclude(
                Q(pending_version__author=user)
                | Q(pending_version__submitted_by=user)
                | Q(pending_version__based_on_version__author=user)
            )
        if value == "ready":
            return queryset.filter(pending_version__state=VersionState.APPROVED)
        if value == "mine":
            return queryset.filter(
                pending_version__author=user,
                pending_version__state__in=[VersionState.DRAFT, VersionState.REJECTED],
            )
        if value == "amendments":
            return queryset.filter(
                live_version__isnull=False,
                pending_version__isnull=False,
                pending_version__state__in=open_states,
            )
        return None


class DeadlineFilter(admin.SimpleListFilter):
    title = "deadline"
    parameter_name = "deadline"

    def lookups(self, request: HttpRequest, model_admin: Any) -> list[tuple[str, str]]:
        return [("soon", "Within 7 days"), ("past", "Passed"), ("unknown", "Not stated")]

    def queryset(self, request: HttpRequest, queryset: QuerySet[Opportunity]) -> QuerySet[Opportunity] | None:
        now = timezone.now()
        field = "live_version__deadline_at"
        match self.value():
            case "soon":
                return queryset.filter(**{f"{field}__gt": now, f"{field}__lte": now + timedelta(days=7)})
            case "past":
                return queryset.filter(**{f"{field}__lte": now})
            case "unknown":
                return queryset.filter(live_version__isnull=False, **{f"{field}__isnull": True})
        return None


# --- read-only inlines ----------------------------------------------------------------------------------
class ReadOnlyInline(admin.TabularInline):  # type: ignore[type-arg]
    extra = 0
    can_delete = False
    max_num = 0

    def has_add_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _is_staff(request)


_TRANSITION_LABELS = {
    "T01": "Draft created",
    "T02": "Draft saved",
    "T03": "Submitted for review",
    "T04": "Approved",
    "T05": "Rejected",
    "T06": "Returned for changes",
    "T07": "Published",
    "T09": "Taken down",
    "T10": "Withdrawn",
    "T11": "Expired",
    "T12": "Archived",
    "T13": "Draft discarded",
    "T14": "Reopened for editing",
    "T15": "Amendment started",
}


class PublishingEventInline(ReadOnlyInline):
    model = PublishingEvent
    verbose_name_plural = "History (every transition, oldest first)"
    fields = ("occurred_at", "what", "from_status", "to_status", "actor_name", "reason", "request_id")
    readonly_fields = fields
    ordering = ("occurred_at",)

    @admin.display(description="What happened")
    def what(self, obj: PublishingEvent) -> str:
        return _TRANSITION_LABELS.get(obj.transition, obj.transition)

    @admin.display(description="Who")
    def actor_name(self, obj: PublishingEvent) -> str:
        return "System" if obj.actor_type == "system" or obj.actor is None else obj.actor.display_name


class VerificationInline(ReadOnlyInline):
    model = VerificationRecord
    verbose_name_plural = "Verification records (separate from sources and publication)"
    fields = ("checked_at", "version", "level", "method", "outcome", "checker", "evidence_note")
    readonly_fields = fields
    ordering = ("checked_at",)

    @admin.display(description="Checked by")
    def checker(self, obj: VerificationRecord) -> str:
        return obj.checked_by.display_name


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = (
        "title_display",
        "category",
        "organisation_display",
        "status_display",
        "verification_display",
        "deadline_display",
        "author_display",
        "updated_at",
    )
    list_display_links = ("title_display",)
    list_filter = (QueueFilter, "status", "category", "verification_level", DeadlineFilter, "created_at")
    search_fields = ("slug", "versions__title", "versions__organisation__name", "versions__reference_number")
    search_help_text = "Search by title, organisation, reference number or web address (slug)."
    list_select_related = (
        "category",
        "pending_version__organisation",
        "pending_version__author",
        "live_version__organisation",
        "live_version__author",
    )
    ordering = ("-updated_at",)
    list_per_page = 25
    inlines = [PublishingEventInline, VerificationInline]
    fieldsets = (
        ("Listing", {"fields": ("status_display", "category", "slug_display", "verification_display")}),
        ("What you can do now", {"fields": ("actions_panel",)}),
        ("Revision being worked on", {"fields": ("pending_preview",)}),
        ("Live revision", {"fields": ("live_preview",)}),
        ("Review decisions", {"fields": ("review_history",)}),
    )
    readonly_fields = (
        "status_display",
        "category",
        "slug_display",
        "verification_display",
        "actions_panel",
        "pending_preview",
        "live_preview",
        "review_history",
    )

    # -- permissions (the form never edits state)
    def has_module_permission(self, request: HttpRequest) -> bool:
        return _is_staff(request)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _is_staff(request)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return _can(request, Permission.OPP_DRAFT_CREATE)

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def get_queryset(self, request: HttpRequest) -> QuerySet[Opportunity]:
        user = _user(request)
        qs = (
            super()
            .get_queryset(request)
            .select_related(
                "category",
                "pending_version__organisation",
                "pending_version__author",
                "live_version__organisation",
                "live_version__author",
            )
        )
        if _sees_all_drafts(request):
            return qs
        if _can(request, Permission.OPP_REVIEW_APPROVE):
            hidden_drafts = Q(pending_version__state=VersionState.DRAFT, live_version__isnull=True) & ~Q(
                pending_version__author=user
            )
            return qs.exclude(hidden_drafts)
        return qs.filter(
            Q(created_by=user) | Q(pending_version__author=user) | Q(versions__author=user)
        ).distinct()

    # -- columns
    @admin.display(description="Title", ordering="pending_version__title")
    def title_display(self, obj: Opportunity) -> str:
        version = obj.live_version or obj.pending_version
        return (version.title if version and version.title else "(untitled draft)")[:90]

    @admin.display(description="Organisation")
    def organisation_display(self, obj: Opportunity) -> str:
        version = obj.pending_version or obj.live_version
        return version.organisation.name if version else "-"

    @admin.display(description="Status", ordering="status")
    def status_display(self, obj: Opportunity) -> SafeString:
        extra = ""
        if obj.pending_version and obj.live_version:
            extra = f" + amendment {obj.pending_version.state.replace('_', ' ')}"
        return format_html("{}{}", status_badge(obj.status), extra)

    @admin.display(description="Verification", ordering="verification_level")
    def verification_display(self, obj: Opportunity) -> str:
        return VERIFICATION_LABELS[obj.verification_level]

    @admin.display(description="Deadline", ordering="live_version__deadline_at")
    def deadline_display(self, obj: Opportunity) -> str:
        version = obj.live_version or obj.pending_version
        if not version or not version.deadline_at:
            return "Not stated"
        return version.deadline_at.astimezone(UTC).strftime("%d %b %Y %H:%M UTC")

    @admin.display(description="Author")
    def author_display(self, obj: Opportunity) -> str:
        version = obj.pending_version or obj.live_version
        return version.author.display_name if version else "-"

    @admin.display(description="Public address")
    def slug_display(self, obj: Opportunity) -> str:
        return f"/opportunities/{obj.slug}" if obj.slug else "Assigned at first publication"

    # -- change page panels
    @admin.display(description="Actions")
    def actions_panel(self, obj: Opportunity) -> SafeString | str:
        request = _request.get()
        if request is None:
            return ""
        user = _user(request)
        names = workflow.allowed_actions(user, obj)
        if _can(request, Permission.OPP_VERIFY_RECORD) and (obj.pending_version or obj.live_version):
            names.append("verify")
        version = obj.pending_version
        links: list[tuple[str, str]] = []
        if version and version.state == VersionState.DRAFT and version.author_id == user.pk:
            url = reverse("admin:opportunities_opportunityversion_change", args=[version.pk])
            links.append((url, "Edit the draft"))
        links += [
            (reverse("admin:opportunities_opportunity_action", args=[obj.pk, name]), ACTIONS[name].label)
            for name in names
            if name in ACTIONS
        ]
        if not links:
            return (
                "No actions are available to you on this listing right now. Review and approval need a different "
                "person from whoever wrote or submitted it."
            )
        buttons = format_html_join(" ", '<a class="button" href="{}">{}</a>', links)
        if obj.slug and obj.status in (
            ListingStatus.PUBLISHED, ListingStatus.EXPIRED, ListingStatus.WITHDRAWN
        ):  # fmt: skip
            url = f"{str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip('/')}/opportunities/{obj.slug}"
            buttons = format_html(
                '{} <button type="button" class="button js-copy-link" data-url="{}">Copy public link</button>'
                ' <span class="js-copy-status" role="status"></span>',
                buttons,
                url,
            )
        return buttons

    def _preview(self, version: OpportunityVersion | None, request: HttpRequest | None) -> SafeString | str:
        if version is None:
            return "None"
        if request is not None and not self._may_see(request, version):
            return "A draft by another person is not shown."
        rows = [
            ("Revision", f"{version.version_no} ({version.state.replace('_', ' ')})"),
            ("Title", version.title or "-"),
            ("Organisation", version.organisation.name),
            ("Summary", version.summary or "-"),
            ("Author", version.author.display_name),
            ("Work arrangement / type", f"{_words(version.work_mode)} / {_words(version.employment_type)}"),
            ("Locations", ", ".join(r.location.name + (" (primary)" if r.is_primary else "") for r in version.locations.select_related("location")) or "-"),
            ("Deadline", f"{version.deadline_at:%d %b %Y %H:%M} UTC ({version.deadline_timezone})" if version.deadline_at else "Not stated"),
            ("Application", f"{version.application_method}: {version.application_url or version.application_email or version.application_instructions or '-'}"),
            ("Sources", "; ".join(f"{s.name} [{s.kind}]{' primary' if s.is_primary else ''} checked {s.observed_on}" for s in version.sources.all()) or "-"),
            ("Content fingerprint", bytes(version.content_hash).hex()[:16] if version.content_hash else "Set at submission"),
        ]  # fmt: skip
        link = reverse("admin:opportunities_opportunityversion_change", args=[version.pk])
        table = format_html_join("", "<tr><th>{}</th><td>{}</td></tr>", rows)
        return format_html('<table>{}</table><p><a href="{}">Open the full revision</a></p>', table, link)

    @staticmethod
    def _may_see(request: HttpRequest, version: OpportunityVersion) -> bool:
        return (
            version.state != VersionState.DRAFT
            or version.author_id == _user(request).pk
            or _sees_all_drafts(request)
        )

    @admin.display(description="Revision in progress")
    def pending_preview(self, obj: Opportunity) -> SafeString | str:
        return self._preview(obj.pending_version, _request.get())

    @admin.display(description="Live revision")
    def live_preview(self, obj: Opportunity) -> SafeString | str:
        return self._preview(obj.live_version, None)

    @admin.display(description="Review decisions")
    def review_history(self, obj: Opportunity) -> SafeString | str:
        from .models import ReviewDecision

        rows = [
            (
                d.decided_at.strftime("%d %b %Y %H:%M"),
                f"rev {d.version.version_no}",
                d.decision,
                d.decided_by.display_name,
                d.reason or "",
            )
            for d in ReviewDecision.objects.filter(version__opportunity=obj)
            .select_related("version", "decided_by")
            .order_by("decided_at")
        ]
        if not rows:
            return "None yet"
        body = format_html_join("", "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>", rows)
        return format_html("<table>{}</table>", body)

    # -- views
    def changeform_view(
        self,
        request: HttpRequest,
        object_id: str | None = None,
        form_url: str = "",
        extra_context: Any = None,
    ) -> HttpResponse:
        token = _request.set(request)
        try:
            if object_id is None:
                return self._create_view(request)
            self._audit_draft_view(request, object_id)
            response = super().changeform_view(request, object_id, form_url, extra_context)
            if isinstance(response, TemplateResponse):
                response.render()  # panels read the request while rendering; do it before it is reset
            return response
        finally:
            _request.reset(token)

    def _audit_draft_view(self, request: HttpRequest, object_id: str) -> None:
        opp = self.get_queryset(request).filter(pk=object_id).select_related("pending_version").first()
        version = opp.pending_version if opp else None
        if version and version.state == VersionState.DRAFT and version.author_id != _user(request).pk:
            audit.record(
                action="opportunity.view_draft", object_type="opportunity", object_id=opp.pk if opp else None,
                actor_id=_user(request).pk, severity="privileged", changes={"reason": "support read-only access"},
            )  # fmt: skip

    def _create_view(self, request: HttpRequest) -> HttpResponse:
        if not self.has_add_permission(request):
            raise Http404
        form = admin_forms.CreateDraftForm(request.POST or None, request.FILES or None)
        if request.method == "POST" and form.is_valid():
            data = form.cleaned_data
            try:
                organisation = self._organisation_for(request, data)
                opp = workflow.create_draft(
                    _user(request),
                    category_code=data["category"].code,
                    content={"organisation_id": str(organisation.pk), "title": data["title"]},
                )
            except WorkflowError as exc:
                messages.error(request, describe(exc))
            else:
                messages.success(
                    request, "Draft created. Add the details and sources, then submit it for review."
                )
                return HttpResponseRedirect(
                    reverse("admin:opportunities_opportunityversion_change", args=[opp.pending_version_id])
                )
        context = {
            **self.admin_site.each_context(request),
            "title": "Start a new listing",
            "form": form,
            "action_label": "Create draft",
            "description": "Choose the category (it cannot be changed later) and the issuing organisation.",
            "back_url": reverse("admin:opportunities_opportunity_changelist"),
            "title_text": "New",
            "warnings": [],
            "summary": "",
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "admin/opportunities/transition.html", context)

    @staticmethod
    def _organisation_for(request: HttpRequest, data: dict[str, Any]) -> Organisation:
        """The selected organisation, or a manually entered one. A manual organisation is never marked
        verified (no verification record exists for it); an existing one with the same normalised name is
        reused instead of creating a duplicate. A logo is applied only when the organisation has none."""
        user = _user(request)
        organisation = data.get("organisation")
        if organisation is None:
            name = data["new_organisation_name"].strip()
            if not _can(request, Permission.ORG_CREATE):
                raise PermissionDeniedError()
            organisation = Organisation.objects.filter(
                name_normalized=normalise_name(name), merged_into__isnull=True
            ).first() or Organisation.objects.create(
                name=name, website_url=data.get("new_organisation_website") or None, created_by=user
            )
        if data.get("logo_data") and not organisation.logo_data:
            if not _can(request, Permission.ORG_EDIT):
                raise PermissionDeniedError()
            organisation.logo_data = data["logo_data"]
            organisation.save(update_fields=["logo_data"])
        return organisation

    class Media:
        js = ("opportunities/staff_social.js",)

    def slug_check_view(self, request: HttpRequest) -> JsonResponse:
        """Inline availability check for the address field (D-47). 200 when free, 409 when taken, 400 when the
        address cannot be used at all. Staff only."""
        if not self.has_view_permission(request):
            raise Http404
        slug = (request.GET.get("slug") or "").strip().lower()
        exclude = request.GET.get("exclude") or None
        try:
            exclude_id = uuid.UUID(exclude) if exclude else None
        except ValueError:
            exclude_id = None
        problem = slugs.format_error(slug)
        if problem:
            return JsonResponse(
                {"slug": slug, "available": False, "code": "invalid_format", "message": problem}, status=400
            )
        if slugs.is_taken(slug, exclude_opportunity_id=exclude_id):
            return JsonResponse(
                {"slug": slug, "available": False, "code": "slug_taken", "message": slugs.SLUG_TAKEN_MESSAGE},
                status=409,
            )
        return JsonResponse({"slug": slug, "available": True})

    def get_urls(self) -> list[Any]:
        custom = [
            path(
                "slug-check/",
                self.admin_site.admin_view(self.slug_check_view),
                name="opportunities_opportunity_slug_check",
            ),
            path(
                "<uuid:pk>/action/<slug:action>/",
                self.admin_site.admin_view(self.action_view),
                name="opportunities_opportunity_action",
            ),
        ]
        return custom + super().get_urls()

    def action_view(self, request: HttpRequest, pk: uuid.UUID, action: str) -> HttpResponse:
        token = _request.set(request)
        try:
            return self._action_view(request, pk, action)
        finally:
            _request.reset(token)

    def _action_view(self, request: HttpRequest, pk: uuid.UUID, action: str) -> HttpResponse:
        opp = self.get_queryset(request).filter(pk=pk).first()
        spec = ACTIONS.get(action)
        if opp is None or spec is None or not self.has_view_permission(request):
            raise Http404
        back = reverse("admin:opportunities_opportunity_change", args=[opp.pk])
        available = workflow.allowed_actions(_user(request), opp)
        if action == "verify" and _can(request, Permission.OPP_VERIFY_RECORD):
            available.append("verify")
        if action not in available:
            messages.error(request, "That action is not available to you right now.")
            return HttpResponseRedirect(back)
        initial = {"row_version": opp.row_version}
        extra: dict[str, Any] = {"opportunity": opp} if getattr(spec.form, "needs_opportunity", False) else {}
        form = spec.form(request.POST or None, initial=initial, **extra)
        conflict = False
        if request.method == "POST" and not form.is_valid():
            conflict = any(e.code == "slug_taken" for e in form.errors.as_data().get("slug", []))
        if request.method == "POST" and form.is_valid():
            if form.cleaned_data["row_version"] != opp.row_version:
                messages.error(
                    request, "The listing changed while this page was open; review it and try again."
                )
                return HttpResponseRedirect(back)
            try:
                spec.run(_user(request), opp, form.cleaned_data)
            except WorkflowError as exc:
                if "slug" in (exc.fields or {}) and any(c == "slug_taken" for c, _ in exc.fields["slug"]):
                    form.add_error("slug", slugs.SLUG_TAKEN_MESSAGE)
                    conflict = True
                else:
                    messages.error(request, describe(exc))
            else:
                messages.success(request, f"Done: {spec.label}.")
                return HttpResponseRedirect(back)
        warnings: list[str] = []
        version = opp.pending_version
        if action == "approve" and version is not None and fee_lint_triggers(version):
            warnings.append(
                "The text mentions payments by applicants. Confirm you reviewed it or reject the listing."
            )
        context = {
            **self.admin_site.each_context(request),
            "title": spec.label,
            "form": form,
            "action_label": spec.label,
            "description": spec.description,
            "back_url": back,
            "title_text": self.title_display(opp),
            "warnings": warnings,
            "summary": self.title_display(opp),
            "opts": self.model._meta,
        }
        response = TemplateResponse(request, "admin/opportunities/transition.html", context)
        if conflict:
            response.status_code = 409  # the submission conflicts with an existing address
        return response


# --- action table --------------------------------------------------------------------------------------
class Action:
    def __init__(self, label: str, description: str, form: type[forms.Form], run: Any) -> None:
        self.label, self.description, self.form, self.run = label, description, form, run


def _reason(data: dict[str, Any]) -> str:
    return str(data.get("reason", ""))


def _submit(user: User, opp: Opportunity, data: dict[str, Any]) -> None:
    ack = None
    if data.get("duplicate_of"):
        ack = {"duplicate_of": data["duplicate_of"], "reason": data.get("duplicate_reason", "")}
    workflow.submit(user, opp.pk, expected_row_version=opp.row_version, duplicate_acknowledgement=ack)


def _publish_direct(user: User, opp: Opportunity, data: dict[str, Any]) -> None:
    ack = None
    if data.get("duplicate_of"):
        ack = {"duplicate_of": data["duplicate_of"], "reason": data.get("duplicate_reason", "")}
    workflow.publish_direct(
        user,
        opp.pk,
        expected_row_version=opp.row_version,
        duplicate_acknowledgement=ack,
        applicant_payment_reviewed=bool(data.get("applicant_payment_reviewed")),
    )


def _change_slug(user: User, opp: Opportunity, data: dict[str, Any]) -> None:
    workflow.change_slug(user, opp.pk, new_slug=data["slug"], expected_row_version=opp.row_version)


def _approve(user: User, opp: Opportunity, data: dict[str, Any]) -> None:
    checklist = {
        "source_reviewed": True,
        "duplicates_reviewed": True,
        "content_matches_source": True,
        **({"applicant_payment_reviewed": True} if data.get("applicant_payment_reviewed") else {}),
    }
    workflow.approve(user, opp.pk, expected_row_version=opp.row_version, checklist=checklist)


def _simple(fn_name: str, **extra: str) -> Any:
    def run(user: User, opp: Opportunity, data: dict[str, Any]) -> None:
        kwargs: dict[str, Any] = {name: data[key] for name, key in extra.items()}
        getattr(workflow, fn_name)(user, opp.pk, expected_row_version=opp.row_version, **kwargs)

    return run


def _verify(user: User, opp: Opportunity, data: dict[str, Any]) -> None:
    workflow.record_verification(
        user, opp.pk, version_no=data["version_no"], level=data["level"], method=data["method"],
        outcome=data["outcome"], evidence_note=data["evidence_note"],
    )  # fmt: skip


ACTIONS: dict[str, Action] = {
    "submit": Action("Submit for review", "Freezes this revision and sends it to the review queue. After this it cannot be edited.", admin_forms.SubmitForm, _submit),
    "publish_direct": Action("Publish now", "Publish your own draft of a staff-created listing immediately, with no second approver. The publisher, time, source and exact revision are recorded. Employer submissions cannot be published this way.", admin_forms.DirectPublishForm, _publish_direct),
    "approve": Action("Approve", "Approve this exact revision. Anyone who wrote or submitted it cannot do this.", admin_forms.ApproveForm, _approve),
    "reject": Action("Reject", "Return the revision to its author with reasons.", admin_forms.ReasonCodeForm, _simple("reject", reason_code="reason_code", reason="reason")),
    "return": Action("Return (withdraw approval)", "Void the approval and send the revision back with reasons.", admin_forms.ReasonCodeForm, _simple("return_approved", reason_code="reason_code", reason="reason")),
    "publish": Action("Publish", "Publish this revision. It must have been approved, unchanged, by another person.", admin_forms.ConfirmForm, _simple("publish")),
    "withdraw": Action("Withdraw", "The issuer withdrew the opportunity. It stays readable, marked withdrawn.", admin_forms.ReasonForm, _simple("withdraw", reason="reason")),
    "expire": Action("Mark as expired", "Close the listing ahead of, or without, its deadline.", admin_forms.ReasonForm, _simple("expire", reason="reason")),
    "archive": Action("Archive", "Housekeeping: archive an expired or withdrawn listing.", admin_forms.ConfirmForm, _simple("archive")),
    "takedown": Action("Take down", "Remove the listing from public view immediately. Keep the record.", admin_forms.TakedownForm, _simple("takedown", reason_code="reason_code", reason="reason")),
    "discard": Action("Discard", "Abandon this draft or rejected revision.", admin_forms.ConfirmForm, _simple("discard")),
    "reopen": Action("Reopen as a new draft", "Start a new draft from the rejected revision.", admin_forms.ConfirmForm, _simple("reopen")),
    "amend": Action("Start an amendment", "Create a new draft from the live revision. The public keeps seeing the live one until the amendment is approved and published.", admin_forms.ConfirmForm, _simple("amend")),
    "change_slug": Action("Change web address", "Give the listing a new slug. The old address stays reserved and redirects permanently to the new one, so shared links keep working.", admin_forms.ChangeSlugForm, _change_slug),
    "verify": Action("Record verification", "Record a check of the content. Verification is separate from the source and from publication.", admin_forms.VerificationForm, _verify),
}  # fmt: skip


# --- revisions: drafts are edited here, everything else is read-only ------------------------------------
class DraftChildInline(admin.TabularInline):  # type: ignore[type-arg]
    """Rows of a revision: editable only by the draft's author, otherwise read-only (the database agrees)."""

    def _may_edit(self, request: HttpRequest, obj: OpportunityVersion | None) -> bool:
        return (
            obj is not None
            and obj.state == VersionState.DRAFT
            and obj.author_id == _user(request).pk
            and _can(request, Permission.OPP_DRAFT_EDIT_OWN)
        )

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _is_staff(request)

    def has_add_permission(self, request: HttpRequest, obj: OpportunityVersion | None = None) -> bool:
        return self._may_edit(request, obj)

    def has_change_permission(self, request: HttpRequest, obj: OpportunityVersion | None = None) -> bool:
        return self._may_edit(request, obj)

    def has_delete_permission(self, request: HttpRequest, obj: OpportunityVersion | None = None) -> bool:
        return self._may_edit(request, obj)


class LocationInline(DraftChildInline):
    model = VersionLocation
    extra = 1
    verbose_name_plural = "Locations (one primary)"
    autocomplete_fields = ("location",)


class SkillInline(DraftChildInline):
    model = VersionSkill
    extra = 0
    autocomplete_fields = ("skill",)


class SectorInline(DraftChildInline):
    model = VersionSector
    extra = 0
    autocomplete_fields = ("sector",)


class SourceInline(DraftChildInline):
    model = OpportunitySource
    extra = 1
    fields = ("kind", "name", "url", "citation", "observed_on", "is_primary")
    verbose_name_plural = "Sources (provenance: where the information came from; one primary)"


FORM_ONLY_FIELDS = (
    "featured_image_file", "remove_featured_image", "social_image_source", "social_image_file", "crop_social",
)  # fmt: skip


class VersionForm(forms.ModelForm):  # type: ignore[type-arg]
    """The revision editor. Image uploads are validated here (real content, size, pixels) and turned into
    stored assets when the draft is saved through the publishing service."""

    featured_image_file = forms.FileField(
        required=False,
        label="Upload or replace",
        help_text="JPEG, PNG or WebP, up to 5 MB. Shown at the top of the public page.",
        widget=forms.ClearableFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}),
    )
    remove_featured_image = forms.BooleanField(required=False, label="Remove the featured image")
    social_image_source = forms.ChoiceField(
        required=False,
        label="Link-preview image",
        choices=[("featured", "Use the featured image"), ("custom", "Upload a custom social image")],
        widget=forms.RadioSelect,
    )
    social_image_file = forms.FileField(
        required=False,
        label="Upload or replace the social image",
        help_text="Recommended 1200 x 630 pixels (1.91:1). JPEG, PNG or WebP, up to 5 MB.",
        widget=forms.ClearableFileInput(attrs={"accept": "image/jpeg,image/png,image/webp"}),
    )
    crop_social = forms.BooleanField(
        required=False,
        label="Crop the social image to 1200 x 630 (centre)",
        help_text="Only when you tick this is the picture cropped; otherwise it is kept as uploaded.",
    )
    deadline_date = forms.DateField(required=False, widget=forms.DateInput(attrs={"type": "date"}))
    deadline_time = forms.TimeField(
        required=False,
        widget=forms.TimeInput(attrs={"type": "time"}),
        help_text="Ignored for date-only deadlines.",
    )

    class Meta:
        model = OpportunityVersion
        fields = (
            "organisation", "title", "summary", "description_md", "responsibilities_md", "requirements_md",
            "seo_title", "seo_description", "slug_request", "og_title", "og_description",
            "featured_image_alt", "social_image_alt", "location_text", "geographic_eligibility", "work_mode", "employment_type", "experience_level", "salary_min",
            "salary_max", "salary_currency", "salary_period", "funding_min", "funding_max",
            "funding_currency", "funding_period", "deadline_timezone", "deadline_is_date_only",
            "application_method", "application_url", "application_email", "application_instructions",
            "reference_number", "contact_details", "detail",
        )  # fmt: skip
        labels = {
            "slug_request": "Web address (slug)",
            "seo_title": "SEO title",
            "seo_description": "SEO meta description",
            "og_title": "Open Graph title",
            "og_description": "Open Graph description",
            "featured_image_alt": "Featured image alt text",
            "social_image_alt": "Social image alt text",
        }
        help_texts = {
            "slug_request": "Lower-case letters, digits and hyphens, 8-80 characters. Unique; fixed at first publication, "
            "changeable later with a permanent redirect from the old address.",
            "seo_title": "Up to 70 characters. Blank: the page title is built from the job title and organisation.",
            "seo_description": "Up to 160 characters. Blank: the summary is used.",
            "og_title": "Up to 95 characters. Blank: the suggestion shown is used and follows later edits.",
            "og_description": "Up to 200 characters. Blank: the suggestion shown is used and follows later edits.",
            "featured_image_alt": "Describe the picture for people who cannot see it. Required to publish.",
            "social_image_alt": "Describe the sharing image. Required when a separate image is used.",
        }  # fmt: skip

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        instance = kwargs.get("instance")
        if (
            "deadline_date" in self.fields
            and instance is not None
            and instance.deadline_at
            and instance.deadline_timezone
        ):
            local = instance.deadline_at.astimezone(ZoneInfo(instance.deadline_timezone))
            self.fields["deadline_date"].initial = local.date()
            self.fields["deadline_time"].initial = local.time().replace(second=0, microsecond=0)
        if "detail" in self.fields:  # read-only revisions exclude their fields from the form
            self.fields["detail"].required = False  # an empty object is valid when the schema allows it
        if "deadline_timezone" in self.fields:
            self.fields[
                "deadline_timezone"
            ].help_text = "IANA name, e.g. Africa/Harare. The time below is in this zone."
        if "social_image_source" in self.fields and instance is not None:
            self.fields["social_image_source"].initial = "custom" if instance.social_image_id else "featured"
        self.featured_upload: ProcessedImage | None = None
        self.social_upload: ProcessedImage | None = None

    def clean_slug_request(self) -> str | None:
        value = (self.cleaned_data.get("slug_request") or "").strip().lower() or None
        if value is None:
            return None
        problem = slugs.format_error(value)
        if problem:
            raise forms.ValidationError(problem, code="invalid_format")
        instance = self.instance
        own = instance.opportunity_id if instance is not None and instance.pk else None
        if slugs.is_taken(value, exclude_opportunity_id=own):
            raise forms.ValidationError(slugs.SLUG_TAKEN_MESSAGE, code="slug_taken")
        return value

    def clean(self) -> dict[str, Any]:
        data = super().clean() or {}
        for field, remember, crop in (
            ("featured_image_file", "featured_upload", False),
            ("social_image_file", "social_upload", bool(data.get("crop_social"))),
        ):
            upload = data.get(field)
            if not upload:
                continue
            try:
                setattr(self, remember, media.process(upload.read(), crop_to_social=crop))
            except media.ImageError as exc:
                self.add_error(field, str(exc))
        if data.get("social_image_source") == "custom":
            has_existing = bool(self.instance and self.instance.social_image_id)
            if self.social_upload is None and not has_existing and "social_image_file" not in self.errors:
                self.add_error("social_image_file", "Upload a social image, or choose the featured image.")
        return data


@admin.register(OpportunityVersion)
class OpportunityVersionAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    form = VersionForm
    inlines = [LocationInline, SkillInline, SectorInline, SourceInline]
    fieldsets = (
        ("Status", {"fields": ("state_display", "author_display", "fingerprint")}),
        ("What and who", {"fields": ("organisation", "title", "summary", "description_md", "responsibilities_md", "requirements_md")}),
        ("Featured image (required before a new listing is published)", {"fields": ("featured_image_current", "featured_image_file", "remove_featured_image", "featured_image_alt")}),
        ("Social & SEO", {"fields": ("slug_request", "canonical_preview", "seo_title", "seo_description", "og_title", "og_description", "social_image_source", "social_image_current", "social_image_file", "crop_social", "social_image_alt")}),
        ("Where and when", {"fields": ("location_text", "geographic_eligibility", "work_mode", "employment_type", "experience_level")}),
        ("Pay or funding (leave blank when not stated; never estimated)", {"fields": (("salary_min", "salary_max", "salary_currency", "salary_period"), ("funding_min", "funding_max", "funding_currency", "funding_period"))}),
        ("Deadline (leave blank when not stated)", {"fields": ("deadline_date", "deadline_time", "deadline_timezone", "deadline_is_date_only")}),
        ("How to apply (applications happen on the issuer's channel)", {"fields": ("application_method", "application_url", "application_email", "application_instructions", "reference_number", "contact_details")}),
        ("Category details (validated against the category schema)", {"fields": ("detail",)}),
    )  # fmt: skip
    readonly_fields = (
        "state_display", "author_display", "fingerprint", "featured_image_current", "social_image_current",
        "canonical_preview",
    )  # fmt: skip
    autocomplete_fields = ("organisation",)

    class Media:
        js = ("opportunities/staff_social.js",)
        css = {"all": ("opportunities/staff_social.css",)}

    def get_model_perms(self, request: HttpRequest) -> dict[str, bool]:
        return {}  # reached from listings, not listed on the index

    def has_module_permission(self, request: HttpRequest) -> bool:
        return _is_staff(request)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _is_staff(request)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: OpportunityVersion | None = None) -> bool:
        if obj is None:
            return _can(request, Permission.OPP_DRAFT_EDIT_OWN)
        return (
            obj.state == VersionState.DRAFT
            and obj.author_id == _user(request).pk
            and _can(request, Permission.OPP_DRAFT_EDIT_OWN)
        )

    def get_queryset(self, request: HttpRequest) -> QuerySet[OpportunityVersion]:
        return _visible_versions(request)

    @admin.display(description="State")
    def state_display(self, obj: OpportunityVersion) -> str:
        return f"Revision {obj.version_no}: {obj.state.replace('_', ' ')}" + (
            "  (frozen: a change needs a new revision and a new review)"
            if obj.state != VersionState.DRAFT
            else ""
        )

    @admin.display(description="Author")
    def author_display(self, obj: OpportunityVersion) -> str:
        return obj.author.display_name

    @admin.display(description="Content fingerprint")
    def fingerprint(self, obj: OpportunityVersion) -> str:
        return bytes(obj.content_hash).hex()[:16] if obj.content_hash else "Set when submitted"

    def _read_only(self, request: HttpRequest, obj: OpportunityVersion | None) -> bool:
        return obj is not None and not self.has_change_permission(request, obj)

    def get_readonly_fields(self, request: HttpRequest, obj: OpportunityVersion | None = None) -> Any:
        base = tuple(self.readonly_fields)
        if self._read_only(request, obj):
            fields = tuple(f for f in VersionForm.Meta.fields if f != "deadline_timezone")
            return base + fields + ("deadline_display",)
        return base

    def get_fieldsets(self, request: HttpRequest, obj: OpportunityVersion | None = None) -> Any:
        if not self._read_only(request, obj):
            return super().get_fieldsets(request, obj)
        out = []
        for title, options in self.fieldsets:
            fields = [
                f
                for f in options["fields"]
                if f not in ("deadline_date", "deadline_time", "deadline_timezone", "deadline_is_date_only")
                and f not in FORM_ONLY_FIELDS
            ]
            if title.startswith("Deadline"):
                fields = ["deadline_display"]
            out.append((title, {**options, "fields": fields}))
        return out

    @staticmethod
    def _image_html(asset: MediaAsset | None, alt: str | None, empty: str) -> SafeString | str:
        if asset is None:
            return empty
        import base64

        uri = f"data:{asset.content_type};base64,{base64.b64encode(bytes(asset.data)).decode('ascii')}"
        warnings = social.warnings_for(asset)
        extra = format_html_join("", '<li class="warning">{}</li>', [(w,) for w in warnings])
        return format_html(
            '<div class="social-image-current"><img src="{}" alt="{}" width="240">'
            "<p>{} x {} pixels, {} KB, {}</p><ul>{}</ul></div>",
            uri, alt or "", asset.width, asset.height, round(asset.size / 1024), asset.content_type, extra,
        )  # fmt: skip

    @admin.display(description="Current featured image")
    def featured_image_current(self, obj: OpportunityVersion | None) -> SafeString | str:
        asset = obj.featured_image if obj is not None and obj.pk else None
        return self._image_html(
            asset, obj.featured_image_alt if obj else None, "No image yet. Drafts may be saved without one."
        )

    @admin.display(description="Current social sharing image")
    def social_image_current(self, obj: OpportunityVersion | None) -> SafeString | str:
        if obj is None or not obj.pk:
            return "Not set: the featured image is shared."
        if obj.social_image is None:
            return "Not set: the featured image is shared."
        return self._image_html(obj.social_image, obj.social_image_alt, "")

    @admin.display(description="Canonical URL")
    def canonical_preview(self, obj: OpportunityVersion | None) -> SafeString:
        base = str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip("/")
        slug = ""
        if obj is not None and obj.pk:
            slug = obj.opportunity.slug or obj.slug_request or ""
        return format_html(
            '<code class="js-canonical" data-base="{}/opportunities/">{}/opportunities/{}</code>',
            base, base, slug or "(set at publication)",
        )  # fmt: skip

    @admin.display(description="Deadline")
    def deadline_display(self, obj: OpportunityVersion) -> str:
        if obj.deadline_at is None:
            return "Not stated"
        zone = obj.deadline_timezone or "UTC"
        local = obj.deadline_at.astimezone(ZoneInfo(zone))
        suffix = " (date only: end of day)" if obj.deadline_is_date_only else ""
        return f"{local:%d %b %Y %H:%M} {zone}{suffix}"

    def changeform_view(
        self,
        request: HttpRequest,
        object_id: str | None = None,
        form_url: str = "",
        extra_context: Any = None,
    ) -> HttpResponse:
        if object_id is None:
            raise Http404
        version = self.get_queryset(request).filter(pk=object_id).first()
        if (
            version is not None
            and version.state == VersionState.DRAFT
            and version.author_id != _user(request).pk
            and request.method == "GET"
        ):
            audit.record(
                action="opportunity.view_draft", object_type="opportunity", object_id=version.opportunity_id,
                actor_id=_user(request).pk, severity="privileged", changes={"reason": "support read-only access"},
            )  # fmt: skip
        extra = {**(extra_context or {}), "social_config": self._social_config(request, version)}
        try:
            response = super().changeform_view(request, object_id, form_url, extra)
        except ServiceRefused as refused:
            fields = refused.error.fields or {}
            if any(c == "slug_taken" for c, _ in fields.get("slug_request", [])):
                messages.error(request, slugs.SLUG_TAKEN_MESSAGE)
                return HttpResponse(slugs.SLUG_TAKEN_MESSAGE, status=409, content_type="text/plain")
            messages.error(request, describe(refused.error))
            return HttpResponseRedirect(request.path)
        context = getattr(response, "context_data", None) or {}
        adminform = context.get("adminform")
        if request.method == "POST" and adminform is not None:
            codes = [e.code for e in adminform.form.errors.as_data().get("slug_request", [])]
            if "slug_taken" in codes:
                response.status_code = 409  # a conflicting address is a conflict, not a malformed request
        return response

    def _social_config(self, request: HttpRequest, version: OpportunityVersion | None) -> dict[str, Any]:
        """Data for the Social & SEO panel (read by staff_social.js through a JSON script element)."""
        import base64

        def uri(asset: MediaAsset | None) -> str | None:
            if asset is None:
                return None
            return f"data:{asset.content_type};base64,{base64.b64encode(bytes(asset.data)).decode('ascii')}"

        base = str(settings.UPNEXT_PUBLIC_BASE_URL).rstrip("/")
        return {
            "baseUrl": base,
            "domain": settings.UPNEXT_BRAND_DOMAIN,
            "brand": settings.UPNEXT_BRAND_NAME,
            "checkUrl": reverse("admin:opportunities_opportunity_slug_check"),
            "opportunityId": str(version.opportunity_id) if version else None,
            "currentSlug": version.opportunity.slug if version else None,
            "category": version.opportunity.category.code if version else None,
            "featuredUri": uri(version.featured_image) if version else None,
            "socialUri": uri(version.social_image) if version else None,
            "jobCategories": sorted(social.JOB_CATEGORIES),
            "titleMax": social.TITLE_MAX,
            "descriptionMax": social.DESCRIPTION_MAX,
        }

    def save_model(self, request: HttpRequest, obj: OpportunityVersion, form: Any, change: bool) -> None:
        """Deliberately empty: persistence happens in `save_related` through the publishing service."""

    def save_related(self, request: HttpRequest, form: Any, formsets: list[Any], change: bool) -> None:
        version: OpportunityVersion = form.instance
        data = form.cleaned_data
        content = self._content(data, formsets, form, request)
        opportunity = Opportunity.objects.get(pk=version.opportunity_id)
        try:
            workflow.save_draft(
                _user(request), opportunity.pk, expected_row_version=opportunity.row_version, content=content
            )
        except WorkflowError as exc:
            raise ServiceRefused(exc) from exc

    def construct_change_message(
        self, request: HttpRequest, form: Any, formsets: Any, add: bool = False
    ) -> Any:
        return "Draft saved through the publishing service."  # inline rows are replaced as a whole

    def response_change(self, request: HttpRequest, obj: OpportunityVersion) -> HttpResponse:
        return HttpResponseRedirect(
            reverse("admin:opportunities_opportunity_change", args=[obj.opportunity_id])
        )

    @staticmethod
    def _money(
        low: Any, high: Any, currency: str, period: str | None, with_period: bool
    ) -> dict[str, Any] | None:
        if low is None and high is None and not currency:
            return None
        out: dict[str, Any] = {
            "min": None if low is None else str(low),
            "max": None if high is None else str(high),
            "currency": currency or None,
        }
        if with_period:
            out["period"] = period or None
        return out

    def _content(
        self, data: dict[str, Any], formsets: list[Any], form: Any = None, request: HttpRequest | None = None
    ) -> dict[str, Any]:
        def text(key: str) -> str | None:
            value = data.get(key)
            return value if value not in ("", None) else None

        deadline_at = None
        if data.get("deadline_date"):
            zone = data.get("deadline_timezone") or "Africa/Harare"
            if data.get("deadline_is_date_only"):
                deadline_at = date_only_deadline(data["deadline_date"], zone).isoformat()
            else:
                clock = data.get("deadline_time") or time(23, 59)
                deadline_at = datetime.combine(
                    data["deadline_date"], clock, tzinfo=ZoneInfo(zone)
                ).isoformat()
        locations, skills, sectors, sources = formsets
        content: dict[str, Any] = {
            "organisation_id": str(data["organisation"].pk),
            "title": data["title"],
            "summary": data["summary"],
            "description_md": data["description_md"],
            "responsibilities_md": text("responsibilities_md"),
            "requirements_md": text("requirements_md"),
            "seo_title": text("seo_title"),
            "seo_description": text("seo_description"),
            "slug_request": text("slug_request"),
            "og_title": text("og_title"),
            "og_description": text("og_description"),
            **self._images(data, form, request),
            "location_text": text("location_text"),
            "geographic_eligibility": text("geographic_eligibility"),
            "work_mode": text("work_mode"),
            "employment_type": text("employment_type"),
            "experience_level": text("experience_level"),
            "salary": self._money(data.get("salary_min"), data.get("salary_max"), data.get("salary_currency", ""), data.get("salary_period"), True),
            "funding": self._money(data.get("funding_min"), data.get("funding_max"), data.get("funding_currency", ""), data.get("funding_period"), True),
            "deadline_at": deadline_at,
            "deadline_timezone": text("deadline_timezone") if deadline_at else None,
            "deadline_is_date_only": bool(data.get("deadline_is_date_only")) and deadline_at is not None,
            "application_method": data["application_method"],
            "application_url": text("application_url"),
            "application_email": text("application_email"),
            "application_instructions": text("application_instructions"),
            "reference_number": text("reference_number"),
            "contact_details": text("contact_details"),
            "detail": data.get("detail") or {},
            "locations": [
                {"location_id": str(f.cleaned_data["location"].pk), "is_primary": bool(f.cleaned_data.get("is_primary"))}
                for f in locations.forms if self._live_row(f)
            ],
            "skills": [
                {"skill_id": str(f.cleaned_data["skill"].pk), "is_required": bool(f.cleaned_data.get("is_required"))}
                for f in skills.forms if self._live_row(f)
            ],
            "sector_ids": [str(f.cleaned_data["sector"].pk) for f in sectors.forms if self._live_row(f)],
            "sources": [
                {
                    "kind": f.cleaned_data["kind"], "name": f.cleaned_data["name"],
                    "url": f.cleaned_data.get("url") or None, "citation": f.cleaned_data.get("citation") or None,
                    "observed_on": f.cleaned_data["observed_on"].isoformat(),
                    "is_primary": bool(f.cleaned_data.get("is_primary")),
                }
                for f in sources.forms if self._live_row(f)
            ],
        }  # fmt: skip
        return content

    @staticmethod
    def _asset(request: HttpRequest, image: ProcessedImage) -> MediaAsset:
        asset, _ = MediaAsset.objects.get_or_create(
            sha256=image.sha256,
            defaults={
                "content_type": image.content_type,
                "width": image.width,
                "height": image.height,
                "data": image.data,
                "created_by": _user(request),
            },
        )
        return asset

    def _images(self, data: dict[str, Any], form: Any, request: HttpRequest | None) -> dict[str, Any]:
        """Image references for the draft: a new upload, the one already attached, or none. A social image is
        kept only while 'custom' is chosen; otherwise the featured image is what gets shared."""
        if form is None or request is None:
            return {}
        version: OpportunityVersion = form.instance

        def alt(key: str) -> str | None:
            value = (data.get(key) or "").strip()
            return value or None

        if form.featured_upload is not None:
            featured: MediaAsset | None = self._asset(request, form.featured_upload)
        elif data.get("remove_featured_image"):
            featured = None
        else:
            featured = version.featured_image
        source = data.get("social_image_source") or ("custom" if version.social_image_id else "featured")
        if source == "custom":
            social_asset = (
                self._asset(request, form.social_upload)
                if form.social_upload is not None
                else version.social_image
            )
        else:
            social_asset = None
        return {
            "featured_image_id": str(featured.pk) if featured else None,
            "featured_image_alt": alt("featured_image_alt") if featured else None,
            "social_image_id": str(social_asset.pk) if social_asset else None,
            "social_image_alt": alt("social_image_alt") if social_asset else None,
        }

    @staticmethod
    def _live_row(form: Any) -> bool:
        cleaned: dict[str, Any] | None = getattr(form, "cleaned_data", None)
        if not cleaned or cleaned.get("DELETE"):
            return False
        return form.instance.pk is not None or bool(form.has_changed())


__all__ = ["DEFAULT_REGISTRY", "OpportunityAdmin", "OpportunityVersionAdmin", "mark_safe"]
