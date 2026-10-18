"""Staff screens for the employer portal (Phase 6A). Nothing here writes state: every decision is posted to
`employers.services`, which holds the rules (separation of duties, evidence, audit) and refuses what is not
allowed. Reviewers see claimant details only because they need them to verify an organisation."""

from __future__ import annotations

import uuid
from typing import Any

from django import forms
from django.contrib import admin, messages
from django.http import Http404, HttpRequest, HttpResponse, HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.html import format_html

from access.registry import Permission
from accounts.models import User
from catalog.models import Organisation
from opportunities.errors import WorkflowError

from . import services
from .models import (
    ClaimStatus,
    EmployerMembership,
    MemberRole,
    OrganisationClaim,
    OrganisationVerification,
    ProfileRevision,
    ProfileState,
    VerificationMethod,
)


def _user(request: HttpRequest) -> User:
    return request.user  # type: ignore[return-value]


def _can(request: HttpRequest, code: Permission) -> bool:
    user = _user(request)
    return bool(user.is_authenticated and user.has_permission_code(code))


def _describe(exc: WorkflowError) -> str:
    if exc.fields:
        return (
            f"{exc.message} ("
            + "; ".join(f"{p}: {m}" for p, items in exc.fields.items() for _, m in items)
            + ")"
        )
    return f"{exc.message} [{exc.code}]"


class ReadOnlyAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    """Visible to people who may review employers; never edited through the generic admin forms."""

    permission_code = Permission.EMPLOYER_REVIEW
    decide_label = ""
    decide_name = "decide"

    def has_module_permission(self, request: HttpRequest) -> bool:
        return _can(request, self.permission_code)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _can(request, self.permission_code)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def decide_link(self, obj: Any) -> str:
        if not self.can_decide(obj):
            return "-"
        url = reverse(
            f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_{self.decide_name}",
            args=[obj.pk],
        )
        return format_html('<a href="{}">{}</a>', url, self.decide_label)

    decide_link.short_description = "Action"  # type: ignore[attr-defined]

    def can_decide(self, obj: Any) -> bool:
        return True

    def get_urls(self) -> list[Any]:
        name = f"{self.model._meta.app_label}_{self.model._meta.model_name}_{self.decide_name}"
        custom = path(
            f"<uuid:pk>/{self.decide_name}/", self.admin_site.admin_view(self.decide_view), name=name
        )
        return [custom, *super().get_urls()]

    # -- subclasses
    def form_class(self, obj: Any) -> type[forms.Form]:
        raise NotImplementedError

    def facts(self, obj: Any) -> list[tuple[str, str]]:
        raise NotImplementedError

    def run(self, user: User, obj: Any, data: dict[str, Any]) -> None:
        raise NotImplementedError

    title_for = "Decide"
    description = ""

    def decide_view(self, request: HttpRequest, pk: uuid.UUID) -> HttpResponse:
        obj = self.get_queryset(request).filter(pk=pk).first()
        if obj is None or not self.has_view_permission(request) or not self.can_decide(obj):
            raise Http404
        list_url = reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_changelist")
        form = self.form_class(obj)(request.POST or None)
        if request.method == "POST" and form.is_valid():
            try:
                self.run(_user(request), obj, form.cleaned_data)
            except WorkflowError as exc:
                messages.error(request, _describe(exc))
            else:
                messages.success(request, "Done.")
                return HttpResponseRedirect(list_url)
        return TemplateResponse(
            request,
            "admin/employers/decision.html",
            {
                **self.admin_site.each_context(request),
                "title": self.title_for,
                "description": self.description,
                "facts": self.facts(obj),
                "form": form,
                "submit_label": self.title_for,
                "list_url": list_url,
                "opts": self.model._meta,
            },
        )


# --- claims ---
class ClaimDecisionForm(forms.Form):
    decision = forms.ChoiceField(
        choices=[("approve", "Approve"), ("reject", "Reject")], widget=forms.RadioSelect
    )
    reason = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        max_length=2000,
        help_text="Required (10 characters or more) when rejecting.",
    )
    organisation = forms.ModelChoiceField(
        queryset=Organisation.objects.filter(merged_into__isnull=True),
        required=False,
        help_text=(
            "Choose an existing organisation. Leave empty to create a new one with the claimed name "
            "(check for duplicates first)."
        ),
    )
    role = forms.ChoiceField(choices=MemberRole.choices, initial=MemberRole.OWNER, required=False)
    method = forms.ChoiceField(
        choices=[("", "---"), *VerificationMethod.choices],
        required=False,
        help_text="How you verified the organisation. Required when it is not yet verified.",
    )
    evidence_note = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        max_length=2000,
        help_text=(
            "What you saw or did (10 characters or more). Required when it is not yet verified. "
            "Do not paste documents."
        ),
    )


@admin.register(OrganisationClaim)
class OrganisationClaimAdmin(ReadOnlyAdmin):
    decide_label = "Decide"
    title_for = "Decide organisation claim"
    description = (
        "Approving gives the claimant authority to post for the organisation and records how it was "
        "verified. You cannot decide your own claim."
    )
    list_display = ("organisation_name", "claimant", "status", "created_at", "decide_link")
    list_filter = ("status",)
    search_fields = ("organisation_name",)
    ordering = ("status", "-created_at")
    list_select_related = ("user", "organisation")
    readonly_fields = (
        "user",
        "organisation",
        "organisation_name",
        "website_url",
        "registration_number",
        "role_title",
        "evidence_note",
        "status",
        "created_at",
        "decided_by",
        "decided_at",
        "decision_reason",
    )

    def claimant(self, obj: OrganisationClaim) -> str:
        return f"{obj.user.display_name} <{obj.user.email}>"

    def can_decide(self, obj: OrganisationClaim) -> bool:
        return obj.status == ClaimStatus.PENDING

    def form_class(self, obj: OrganisationClaim) -> type[forms.Form]:
        return ClaimDecisionForm

    def facts(self, obj: OrganisationClaim) -> list[tuple[str, str]]:
        return [
            ("Claimant", self.claimant(obj)),
            ("Organisation", obj.organisation.name if obj.organisation else f"{obj.organisation_name} (new)"),
            ("Website", obj.website_url or "-"),
            ("Registration number", obj.registration_number or "-"),
            ("Role", obj.role_title),
            ("Evidence offered", obj.evidence_note),
        ]

    def run(self, user: User, obj: OrganisationClaim, data: dict[str, Any]) -> None:
        chosen: Organisation | None = data.get("organisation")
        services.decide_claim(
            user,
            obj.pk,
            approve=data["decision"] == "approve",
            reason=data.get("reason"),
            organisation_id=chosen.pk if chosen else None,
            method=data.get("method") or None,
            evidence_note=data.get("evidence_note"),
            role=data.get("role") or MemberRole.OWNER,
        )


# --- company profile revisions ---
class ProfileDecisionForm(forms.Form):
    decision = forms.ChoiceField(
        choices=[("approve", "Approve"), ("reject", "Reject")], widget=forms.RadioSelect
    )
    reason = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        max_length=2000,
        help_text="Required (10 characters or more) when rejecting. Shown to the employer.",
    )


@admin.register(ProfileRevision)
class ProfileRevisionAdmin(ReadOnlyAdmin):
    decide_label = "Review"
    title_for = "Review company profile"
    description = (
        "Profile text is public once approved. Check it is plain, accurate and about this organisation."
    )
    list_display = ("organisation", "version_no", "state", "submitted_at", "decide_link")
    list_filter = ("state",)
    ordering = ("state", "-submitted_at")
    list_select_related = ("profile__organisation",)
    readonly_fields = (
        "profile",
        "version_no",
        "state",
        "tagline",
        "about",
        "sector",
        "size_band",
        "founded_year",
        "location_text",
        "submitted_by",
        "submitted_at",
        "decided_by",
        "decided_at",
        "decision_reason",
    )

    def organisation(self, obj: ProfileRevision) -> str:
        return obj.profile.organisation.name

    def can_decide(self, obj: ProfileRevision) -> bool:
        return obj.state == ProfileState.PENDING

    def form_class(self, obj: ProfileRevision) -> type[forms.Form]:
        return ProfileDecisionForm

    def facts(self, obj: ProfileRevision) -> list[tuple[str, str]]:
        return [
            ("Organisation", self.organisation(obj)),
            ("Tagline", obj.tagline or "-"),
            ("About", obj.about),
            ("Sector", obj.sector.name if obj.sector else "-"),
            ("Size", obj.size_band or "-"),
            ("Founded", str(obj.founded_year or "-")),
            ("Location", obj.location_text or "-"),
        ]

    def run(self, user: User, obj: ProfileRevision, data: dict[str, Any]) -> None:
        services.decide_profile_revision(
            user, obj.pk, approve=data["decision"] == "approve", reason=data.get("reason")
        )


# --- verification and membership: view, and revoke ---
class RevokeForm(forms.Form):
    reason = forms.CharField(widget=forms.Textarea(attrs={"rows": 3}), min_length=10, max_length=2000)


@admin.register(OrganisationVerification)
class OrganisationVerificationAdmin(ReadOnlyAdmin):
    permission_code = Permission.EMPLOYER_REVIEW
    decide_name = "revoke"
    decide_label = "Revoke"
    title_for = "Revoke organisation verification"
    description = (
        "Only Administrators can revoke (others are refused and the attempt is audited). Members can no "
        "longer submit listings or profile changes and the public profile is hidden. Published listings "
        "are not changed; take those down separately if needed."
    )
    list_display = ("organisation", "method", "verified_by", "verified_at", "revoked_at", "decide_link")
    list_filter = ("method",)
    list_select_related = ("organisation", "verified_by")
    readonly_fields = (
        "organisation",
        "claim",
        "method",
        "evidence_note",
        "verified_by",
        "verified_at",
        "revoked_by",
        "revoked_at",
        "revoked_reason",
    )

    def can_decide(self, obj: OrganisationVerification) -> bool:
        return obj.revoked_at is None

    def form_class(self, obj: OrganisationVerification) -> type[forms.Form]:
        return RevokeForm

    def facts(self, obj: OrganisationVerification) -> list[tuple[str, str]]:
        return [
            ("Organisation", obj.organisation.name),
            ("Method", obj.get_method_display()),
            ("Evidence", obj.evidence_note),
            ("Verified by", str(obj.verified_by_id)),
        ]

    def run(self, user: User, obj: OrganisationVerification, data: dict[str, Any]) -> None:
        services.revoke_verification(user, obj.organisation_id, reason=data["reason"])


@admin.register(EmployerMembership)
class EmployerMembershipAdmin(ReadOnlyAdmin):
    decide_name = "revoke"
    decide_label = "Revoke"
    title_for = "Revoke employer membership"
    description = "The person immediately loses authority to act for the organisation."
    list_display = ("member", "organisation", "role", "granted_at", "revoked_at", "decide_link")
    list_filter = ("role",)
    list_select_related = ("user", "organisation")
    readonly_fields = (
        "user",
        "organisation",
        "role",
        "claim",
        "granted_by",
        "granted_at",
        "revoked_by",
        "revoked_at",
        "revoked_reason",
    )

    def member(self, obj: EmployerMembership) -> str:
        return f"{obj.user.display_name} <{obj.user.email}>"

    def can_decide(self, obj: EmployerMembership) -> bool:
        return obj.revoked_at is None

    def form_class(self, obj: EmployerMembership) -> type[forms.Form]:
        return RevokeForm

    def facts(self, obj: EmployerMembership) -> list[tuple[str, str]]:
        return [("Member", self.member(obj)), ("Organisation", obj.organisation.name), ("Role", obj.role)]

    def run(self, user: User, obj: EmployerMembership, data: dict[str, Any]) -> None:
        services.revoke_membership(user, obj.pk, reason=data["reason"])
