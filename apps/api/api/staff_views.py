"""Staff API (`/api/v1/staff/`, openapi tag `staff`, D-49): what the Next.js staff workspace calls.

Nothing in this module decides anything. Every state change goes through `opportunities.workflow` (permission,
separation of duties, the exact-revision rule, audit, database triggers); every read starts from
`opportunities.admin.listings_visible_to`, the one definition of which listings a staff member may see. A
request needs a signed-in account with an active staff role *and* the second step (two-step verification) in
the same session; the second step cannot be satisfied through any other endpoint. Unsafe methods are CSRF
protected by the shared session authentication, and writes are throttled per user.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Any, NoReturn, cast

from django import forms
from django.conf import settings
from django.db.models import Count, QuerySet
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from access.registry import DEFAULT_REGISTRY, Permission, Role
from accounts import mfa
from accounts.models import User
from audit import services as audit
from catalog.models import Category, Organisation
from catalog.schemas import load_schema
from core import staff_dashboard
from core.staff_mfa import SESSION_FLAG, mark_verified
from opportunities import health, workflow
from opportunities.errors import WorkflowError
from opportunities.models import (
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    PublishingEvent,
    VerificationLevel,
    VersionState,
)
from opportunities.staff import (
    ACTIONS,
    DEADLINES,
    QUEUES,
    STATUS_TONES,
    TRANSITION_LABELS,
    apply_deadline,
    apply_queue,
    listing_actions,
    listings_scope,
    listings_visible_to,
    search_listings,
)
from opportunities.validation import fee_lint_triggers
from reports.models import ListingReport

from .employer_views import _body, _locations, _money, _refused
from .errors import CodedPermissionDenied, error_response
from .public_views import _iso, detail_of
from .throttles import UserWriteThrottle

PAGE_SIZE = 25
MAX_PAGE_SIZE = 50
SEARCH_MIN, SEARCH_MAX, SEARCH_PER_GROUP = 2, 80, 5

LEVEL_LABELS: dict[str, str] = {
    VerificationLevel.NOT_VERIFIED: "Not verified",
    VerificationLevel.SOURCE_CHECKED: "Source checked (not confirmed with the issuer)",
    VerificationLevel.ISSUER_VERIFIED: "Verified with the issuer",
}
SORTS = {
    "updated": "-updated_at",
    "oldest": "updated_at",
    "title": "pending_version__title",
    "closing": "live_version__deadline_at",
}
# Where the workspace sends the person for each dashboard card and needs-attention row.
KPI_TARGETS = {
    "total": "/workspace/opportunities",
    "published": "/workspace/opportunities?status=published",
    "closing": "/workspace/opportunities?status=published&deadline=soon",
    "drafts": "/workspace/opportunities?status=draft",
    "expired": "/workspace/opportunities?status=expired",
}
ATTENTION_TARGETS = {
    "review": "/workspace/opportunities?queue=review",
    "ready": "/workspace/opportunities?queue=ready",
    "mine": "/workspace/opportunities?queue=mine",
    "closing": "/workspace/opportunities?status=published&deadline=soon",
    "employers": "/workspace/records/claims?status=pending",
    "reports": "/workspace/records/reports?queue=open",
}


# --- access ---------------------------------------------------------------------------------------------
class IsStaffAccount(BasePermission):
    """Signed in with an active staff role (the second step is checked separately)."""

    def has_permission(self, request: Request, view: Any) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)


def mfa_satisfied(request: Request) -> bool:
    return not settings.UPNEXT_STAFF_MFA_REQUIRED or bool(request._request.session.get(SESSION_FLAG))


class IsVerifiedStaff(IsStaffAccount):
    """Staff account that has also passed two-step verification in this session."""

    def has_permission(self, request: Request, view: Any) -> bool:
        return super().has_permission(request, view) and mfa_satisfied(request)


@method_decorator(never_cache, name="dispatch")
class StaffView(APIView):
    permission_classes = [IsVerifiedStaff]
    throttle_classes = [UserWriteThrottle]

    def get_throttles(self) -> list[Any]:
        return super().get_throttles() if self.request.method not in ("GET", "HEAD", "OPTIONS") else []

    def permission_denied(self, request: Request, message: Any = None, code: Any = None) -> NoReturn:
        user: Any = request.user
        if user and user.is_authenticated and user.is_staff and not mfa_satisfied(request):
            raise CodedPermissionDenied("two_step_required")
        super().permission_denied(request, message=message, code=code)
        raise AssertionError("unreachable")  # pragma: no cover

    @staticmethod
    def user_of(request: Request) -> User:
        return cast(User, request.user)


def _not_found() -> Response:
    return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)


def _role_label(user: User) -> str:
    roles = user.active_roles()
    for role in (Role.ADMINISTRATOR, Role.EDITOR, Role.CONTRIBUTOR):
        if role in roles:
            return role.value
    return "staff"


# --- session and two-step --------------------------------------------------------------------------------
@method_decorator(never_cache, name="dispatch")
class SessionView(APIView):
    permission_classes = [IsStaffAccount]

    @extend_schema(
        operation_id="getStaffSession", tags=["staff"], responses=OpenApiResponse(description="Who and how")
    )
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        verified = mfa_satisfied(request)
        body: dict[str, Any] = {
            "user": {
                "id": str(user.pk),
                "name": user.display_name,
                "role": _role_label(user),
                "roles": sorted(user.active_roles()),
            },
            "two_step": {
                "required": settings.UPNEXT_STAFF_MFA_REQUIRED,
                "verified": verified,
                "enrolled": mfa.is_enrolled(user),
            },
            "public_url": settings.UPNEXT_PUBLIC_BASE_URL,
        }
        if verified:
            body["permissions"] = sorted(DEFAULT_REGISTRY.permissions_for(user.active_roles()))
            rows = staff_dashboard.attention(user)
            body["attention"] = [_attention(r) for r in rows]
            tasks = [r for r in rows if r.actionable and r.count > 0]
            body["task_total"] = sum(r.count for r in tasks)
        return Response(body)


@method_decorator(never_cache, name="dispatch")
class TwoStepView(APIView):
    """Enrol or verify the second step for this session (same rules as `/staff/mfa/`)."""

    permission_classes = [IsStaffAccount]
    throttle_classes = [UserWriteThrottle]

    def get_throttles(self) -> list[Any]:
        return super().get_throttles() if self.request.method not in ("GET", "HEAD", "OPTIONS") else []

    @extend_schema(
        operation_id="getStaffTwoStep",
        tags=["staff"],
        responses=OpenApiResponse(description="Enrolment state"),
    )
    def get(self, request: Request) -> Response:
        user = cast(User, request.user)
        if mfa.is_enrolled(user):
            return Response({"enrolling": False, "verified": mfa_satisfied(request)})
        enrolment = mfa.begin_enrolment(user)
        return Response(
            {"enrolling": True, "verified": False, "secret": enrolment.secret, "uri": enrolment.uri}
        )

    @extend_schema(
        operation_id="verifyStaffTwoStep",
        tags=["staff"],
        request=None,
        responses={
            200: OpenApiResponse(description="Verified; recovery codes only when enrolling"),
            400: None,
            429: None,
        },
    )
    def post(self, request: Request) -> Response:
        user = cast(User, request.user)
        data = _body(request) or {}
        code = str(data.get("code", ""))[:32]
        if mfa.blocked(user):
            return error_response("rate_limited", "Too many incorrect codes. Try again in 15 minutes.", 429)
        if not mfa.is_enrolled(user):
            codes = mfa.confirm_enrolment(user, code)
            if codes is None:
                return error_response(
                    "invalid_code",
                    "That code did not match. Check the setup key and your device clock, then try again.",
                    400,
                )
            mark_verified(request._request)
            return Response({"verified": True, "recovery_codes": codes})
        if not mfa.verify(user, code):
            return error_response(
                "invalid_code",
                (
                    "That code is not valid. Each code works once, so wait for the next one on your device, "
                    "or use an unused recovery code. Check that your phone's time is set automatically."
                ),
                400,
            )
        mark_verified(request._request)
        return Response({"verified": True})


# --- shapes ----------------------------------------------------------------------------------------------
def _attention(row: staff_dashboard.Attention) -> dict[str, Any]:
    return {
        "key": row.key,
        "label": row.label,
        "count": row.count,
        "icon": row.icon,
        "actionable": row.actionable,
        "href": ATTENTION_TARGETS.get(row.key, "/workspace"),
    }


def _may_see(user: User, version: OpportunityVersion) -> bool:
    """The same rule as the Django Admin change page: another person's draft is not shown."""
    return (
        version.state != VersionState.DRAFT
        or version.author_id == user.pk
        or user.has_permission_code(Permission.AUDIT_READ_ALL)
    )


def _actions(user: User, opp: Opportunity) -> list[dict[str, str]]:
    return [{"name": name, "label": label} for name, label in listing_actions(user, opp)]


def _row(user: User, opp: Opportunity) -> dict[str, Any]:
    version = opp.live_version or opp.pending_version
    shown = version if version is not None and _may_see(user, version) else None
    pending = opp.pending_version
    label, tone = STATUS_TONES.get(opp.status, (opp.status, "neutral"))
    who = None
    if pending is not None and _may_see(user, pending):
        submitter = pending.submitted_by or pending.author
        who = submitter.display_name if submitter else None
    return {
        "id": str(opp.pk),
        "title": staff_dashboard._title(shown),
        "organisation": shown.organisation.name if shown else None,
        "location": staff_dashboard.primary_location(shown) if shown else "-",
        "category": {"code": opp.category.code, "name": opp.category.name},
        "closing": _iso(shown.deadline_at) if shown else None,
        "status": opp.status,
        "status_label": label,
        "status_tone": tone,
        "version_state": pending.state if pending else None,
        "verification": opp.verification_level,
        "verification_label": LEVEL_LABELS.get(opp.verification_level, opp.verification_level),
        "submitted_by": who,
        "submitted_at": _iso(pending.submitted_at) if pending and _may_see(user, pending) else None,
        "updated_at": _iso(opp.updated_at),
        "row_version": opp.row_version,
        "actions": _actions(user, opp),
    }


def _paginate(request: Request, queryset: QuerySet[Any]) -> tuple[list[Any], dict[str, int]]:
    try:
        page = max(1, int(request.query_params.get("page", 1)))
        size = min(MAX_PAGE_SIZE, max(1, int(request.query_params.get("page_size", PAGE_SIZE))))
    except ValueError:
        page, size = 1, PAGE_SIZE
    total = queryset.count()
    items = list(queryset[(page - 1) * size : page * size])
    return items, {"page": page, "page_size": size, "total": total, "pages": max(1, -(-total // size))}


# --- dashboard -------------------------------------------------------------------------------------------
class DashboardView(StaffView):
    @extend_schema(
        operation_id="getStaffDashboard",
        tags=["staff"],
        responses=OpenApiResponse(description="Dashboard figures"),
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        listings = (
            listings_visible_to(user)
            .prefetch_related("pending_version__locations__location", "live_version__locations__location")
            .order_by("-updated_at")[: staff_dashboard.LATEST_ROWS]
        )
        return Response(
            {
                "kpis": [
                    {**asdict(k), "href": KPI_TARGETS.get(k.key, "/workspace")}
                    for k in staff_dashboard.kpis(user)
                ],
                "attention": [_attention(r) for r in staff_dashboard.attention(user)],
                "activity": [
                    {
                        "subject": a.subject,
                        "verb": a.verb,
                        "actor": a.actor,
                        "when": _iso(a.when),
                        "href": f"/workspace/opportunities/{a.opportunity_id}",
                    }
                    for a in staff_dashboard.recent_activity(user)
                ],
                "listings": [_row(user, o) for o in listings],
            }
        )


# --- opportunities -----------------------------------------------------------------------------------------
class OpportunityListView(StaffView):
    @extend_schema(
        operation_id="listStaffOpportunities",
        tags=["staff"],
        responses=OpenApiResponse(description="Visible listings with filters, tab counts and paging"),
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        params = request.query_params
        qs = listings_visible_to(user)
        state = params.get("status", "")
        if state in ListingStatus.values:
            qs = qs.filter(status=state)
        queue = params.get("queue", "")
        if queue in QUEUES:
            qs = apply_queue(qs, user, queue) or qs
        deadline = params.get("deadline", "")
        if deadline in DEADLINES:
            qs = apply_deadline(qs, deadline) or qs
        if params.get("category"):
            qs = qs.filter(category__code=params["category"])
        if params.get("verification") in VerificationLevel.values:
            qs = qs.filter(verification_level=params["verification"])
        term = params.get("q", "").strip()[:SEARCH_MAX]
        if term:
            qs = search_listings(user, qs, term)
        qs = qs.prefetch_related("pending_version__locations__location", "live_version__locations__location")
        qs = qs.order_by(SORTS.get(params.get("sort", ""), "-updated_at"), "-pk")
        if term:
            qs = qs.distinct()
        items, page = _paginate(request, qs)
        counts = dict(listings_scope(user).values_list("status").annotate(n=Count("pk")))
        return Response(
            {
                "data": [_row(user, o) for o in items],
                "page": page,
                "counts": {
                    "all": sum(counts.values()),
                    **{k: counts.get(k, 0) for k in ListingStatus.values},
                },
            }
        )

    @extend_schema(
        operation_id="createStaffDraft",
        tags=["staff"],
        request=None,
        responses={201: OpenApiResponse(description="The new draft"), 400: None, 403: None},
    )
    def post(self, request: Request) -> Response:
        user = self.user_of(request)
        data = _body(request)
        if data is None or not all(
            isinstance(data.get(k), str) for k in ("category", "organisation_id", "title")
        ):
            return error_response("validation_failed", "Send category, organisation_id and title.", 400)
        try:
            opp = workflow.create_draft(
                user,
                category_code=data["category"],
                content={"organisation_id": data["organisation_id"], "title": data["title"]},
            )
        except WorkflowError as exc:
            return _refused(exc)
        return Response(self._detail(user, opp.pk), status=status.HTTP_201_CREATED)

    @staticmethod
    def _detail(user: User, pk: uuid.UUID) -> dict[str, Any]:
        opp = listings_visible_to(user).get(pk=pk)
        return _detail(user, opp)


def _form_fields(form_class: type[forms.BaseForm]) -> list[dict[str, Any]]:
    out = []
    for name, field in form_class().fields.items():
        if name == "row_version":
            continue
        if isinstance(field, forms.ModelChoiceField):
            kind = "reference"  # a record picked by search (organisations, locations), never listed whole
        elif isinstance(field, forms.BooleanField):
            kind = "boolean"
        elif isinstance(field, forms.ChoiceField):
            kind = "choice"
        elif isinstance(field, forms.IntegerField):
            kind = "integer"
        elif isinstance(field.widget, forms.Textarea):
            kind = "textarea"
        else:
            kind = "text"
        lookup = None
        if isinstance(field, forms.ModelChoiceField):
            lookup = {"organisation": "organisations", "location": "locations"}.get(
                field.queryset.model._meta.model_name or ""  # type: ignore[union-attr]
            )
        out.append(
            {
                "name": name,
                "label": str(field.label or name.replace("_", " ").capitalize()),
                "kind": kind,
                "lookup": lookup,
                "required": field.required,
                "help": str(field.help_text or ""),
                "choices": [
                    {"value": str(v), "label": str(label)} for v, label in getattr(field, "choices", [])
                ]
                if kind == "choice"
                else None,
                "min_length": getattr(field, "min_length", None),
            }
        )
    return out


def _version(user: User, version: OpportunityVersion | None) -> dict[str, Any] | None:
    if version is None:
        return None
    if not _may_see(user, version):
        return {"hidden": True, "state": version.state, "message": "A draft by another person is not shown."}
    return {
        "hidden": False,
        "id": str(version.pk),
        "version_no": version.version_no,
        "state": version.state,
        "author": version.author.display_name,
        "submitted_by": version.submitted_by.display_name if version.submitted_by else None,
        "submitted_at": _iso(version.submitted_at),
        "approved_by": version.approved_by.display_name if version.approved_by else None,
        "approved_at": _iso(version.approved_at),
        "fingerprint": bytes(version.content_hash).hex()[:16] if version.content_hash else None,
        "organisation": {"id": str(version.organisation_id), "name": version.organisation.name},
        "content": {
            "title": version.title,
            "summary": version.summary,
            "description_md": version.description_md,
            "requirements_md": version.requirements_md,
            "locations": _locations(version),
            "location_text": version.location_text,
            "geographic_eligibility": version.geographic_eligibility,
            "work_mode": version.work_mode,
            "employment_type": version.employment_type,
            "experience_level": version.experience_level,
            "salary": _money(
                version.salary_min, version.salary_max, version.salary_currency, version.salary_period
            ),
            "salary_text": version.salary_text,
            "funding": _money(
                version.funding_min, version.funding_max, version.funding_currency, version.funding_period
            ),
            "deadline_at": _iso(version.deadline_at),
            "deadline_timezone": version.deadline_timezone,
            "deadline_is_date_only": version.deadline_is_date_only,
            "application_method": version.application_method,
            "application_url": version.application_url,
            "application_email": version.application_email,
            "application_email_subject": version.application_email_subject,
            "application_instructions": version.application_instructions,
            "reference_number": version.reference_number,
            "contact_details": version.contact_details,
            "skills": [
                {"skill_id": str(r.skill_id), "name": r.skill.name, "is_required": r.is_required}
                for r in version.skills.select_related("skill")
            ],
            "sector_ids": [str(r.sector_id) for r in version.sectors.all()],
            "sectors": [
                {"id": str(r.sector_id), "name": r.sector.name}
                for r in version.sectors.select_related("sector")
            ],
            "sources": [
                {
                    "kind": s.kind,
                    "name": s.name,
                    "url": s.url,
                    "citation": s.citation,
                    "observed_on": s.observed_on.isoformat(),
                    "is_primary": s.is_primary,
                }
                for s in version.sources.all()
            ],
            "detail": version.detail,
            "slug": version.slug_hint,
            "seo_title": version.seo_title,
            "seo_description": version.seo_description,
            "og_title": version.og_title,
            "og_description": version.og_description,
        },
    }


def _detail(user: User, opp: Opportunity) -> dict[str, Any]:
    pending = _version(user, opp.pending_version)
    live = _version(user, opp.live_version)
    shown = opp.live_version or opp.pending_version
    visible = shown is not None and _may_see(user, shown)
    events = opp.events.select_related("actor", "version").all()
    history = [
        {
            "what": TRANSITION_LABELS.get(e.transition, e.transition),
            "from_status": e.from_status,
            "to_status": e.to_status,
            "actor": "System" if e.actor_type == "system" or e.actor is None else e.actor.display_name,
            "reason": e.reason,
            "at": _iso(e.occurred_at),
        }
        for e in events
    ]
    verifications = [
        {
            "version_no": v.version.version_no,
            "level": v.level,
            "method": v.method,
            "outcome": v.outcome,
            "evidence_note": v.evidence_note,
            "checked_by": v.checked_by.display_name,
            "checked_at": _iso(v.checked_at),
        }
        for v in opp.verifications.select_related("version", "checked_by").order_by("checked_at")
    ]
    actions = []
    warnings: list[str] = []
    for name, label in listing_actions(user, opp):
        spec = ACTIONS.get(name)
        actions.append(
            {
                "name": name,
                "label": label,
                "description": spec.description if spec else "Edit the draft in the editor.",
                "fields": _form_fields(spec.form) if spec else [],
            }
        )
    if opp.pending_version is not None and visible and fee_lint_triggers(opp.pending_version):
        warnings.append(
            "The text mentions payments by applicants. Confirm you reviewed it or reject the listing."
        )
    return {
        **_row(user, opp),
        "slug": opp.slug,
        "public_path": f"/opportunities/{opp.slug}" if opp.slug else None,
        "pending": pending,
        "live": live,
        "history": history if visible else [],
        "verifications": verifications if visible else [],
        "actions": actions,
        "warnings": warnings,
        "can_edit": any(a["name"] == "edit" for a in actions),
    }


def _visible_listing(user: User, opportunity_id: uuid.UUID) -> Opportunity | None:
    return (
        listings_visible_to(user)
        .prefetch_related("pending_version__locations__location", "live_version__locations__location")
        .filter(pk=opportunity_id)
        .first()
    )


class OpportunityDetailView(StaffView):
    @extend_schema(
        operation_id="getStaffOpportunity",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Listing"), 404: None},
    )
    def get(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        opp = _visible_listing(user, opportunity_id)
        if opp is None:
            return _not_found()
        version = opp.pending_version
        if version is not None and version.state == VersionState.DRAFT and version.author_id != user.pk:
            audit.record(  # an Administrator reading another person's draft is support access, and is audited
                action="opportunity.view_draft",
                object_type="opportunity",
                object_id=opp.pk,
                actor_id=user.pk,
                severity="privileged",
                changes={"reason": "support read-only access"},
            )
        return Response(_detail(user, opp))


class PreviewView(StaffView):
    """How the open draft (or the live revision) will read to the public, in the public API's own shape, so
    the staff preview is the public page. Read only; a draft is shown only to those who may see it."""

    @extend_schema(
        operation_id="previewStaffOpportunity",
        tags=["staff"],
        responses={200: OpenApiResponse(description="The public shape of the revision"), 404: None},
    )
    def get(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        opp = _visible_listing(user, opportunity_id)
        if opp is None:
            return _not_found()
        version = next(
            (v for v in (opp.pending_version, opp.live_version) if v is not None and _may_see(user, v)), None
        )
        if version is None:
            return _not_found()
        return Response(detail_of(version, timezone.now(), preview=True))


class SaveDraftView(StaffView):
    @extend_schema(
        operation_id="saveStaffDraft",
        tags=["staff"],
        request=None,
        responses={
            200: OpenApiResponse(description="The saved draft"),
            400: None,
            403: None,
            404: None,
            409: None,
        },
    )
    def patch(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        data = _body(request)
        if (
            data is None
            or not isinstance(data.get("content"), dict)
            or not isinstance(data.get("row_version"), int)
        ):
            return error_response(
                "validation_failed", "Send content and the row_version you were shown.", 400
            )
        if _visible_listing(user, opportunity_id) is None:
            return _not_found()
        try:
            workflow.save_draft(
                user, opportunity_id, expected_row_version=data["row_version"], content=data["content"]
            )
        except WorkflowError as exc:
            return _refused(exc)
        opp = _visible_listing(user, opportunity_id)
        assert opp is not None
        return Response(_detail(user, opp))


class ActionView(StaffView):
    @extend_schema(
        operation_id="runStaffAction",
        tags=["staff"],
        request=None,
        responses={
            200: OpenApiResponse(description="The listing after the action"),
            400: None,
            403: None,
            404: None,
            409: None,
        },
    )
    def post(self, request: Request, opportunity_id: uuid.UUID, action: str) -> Response:
        user = self.user_of(request)
        opp = _visible_listing(user, opportunity_id)
        spec = ACTIONS.get(action)
        if opp is None or spec is None:
            return _not_found()
        available = {name for name, _ in listing_actions(user, opp)}
        if action not in available:
            return error_response("action_unavailable", "That action is not available to you right now.", 403)
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        form = spec.form(data)
        if not form.is_valid():
            fields = {
                name: [{"code": e.get("code", "invalid"), "message": e["message"]} for e in errors]
                for name, errors in form.errors.get_json_data().items()
            }
            return error_response("validation_failed", "The request is invalid.", 400, fields)
        if form.cleaned_data["row_version"] != opp.row_version:
            return error_response(
                "state_conflict",
                "The listing changed while this page was open; review it and try again.",
                409,
            )
        try:
            spec.run(user, opp, form.cleaned_data)
        except WorkflowError as exc:
            return _refused(exc)
        fresh = _visible_listing(user, opportunity_id)
        assert fresh is not None
        return Response(_detail(user, fresh))


# --- activity, search, lookups -------------------------------------------------------------------------
class ActivityView(StaffView):
    @extend_schema(
        operation_id="listStaffActivity", tags=["staff"], responses=OpenApiResponse(description="Transitions")
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        visible = listings_scope(user).values("pk")
        qs = (
            PublishingEvent.objects.filter(opportunity__in=visible)
            .select_related("actor", "version", "opportunity")
            .order_by("-occurred_at", "-pk")
        )
        items, page = _paginate(request, qs)
        return Response(
            {
                "data": [
                    {
                        "what": TRANSITION_LABELS.get(e.transition, e.transition),
                        "listing_id": str(e.opportunity_id),
                        "listing": staff_dashboard._title(e.version),
                        "from_status": e.from_status,
                        "to_status": e.to_status,
                        "actor": "System"
                        if e.actor_type == "system" or e.actor is None
                        else e.actor.display_name,
                        "at": _iso(e.occurred_at),
                    }
                    for e in items
                ],
                "page": page,
            }
        )


class SearchView(StaffView):
    @extend_schema(
        operation_id="searchStaff",
        tags=["staff"],
        responses=OpenApiResponse(description="Grouped suggestions"),
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        term = str(request.query_params.get("q", "")).strip()[:SEARCH_MAX]
        groups: list[dict[str, Any]] = []
        if len(term) >= SEARCH_MIN:
            hits = search_listings(user, listings_visible_to(user), term).order_by("-updated_at").distinct()
            items = []
            for opp in hits[: SEARCH_PER_GROUP * 3]:
                version = opp.live_version or opp.pending_version
                if version is None or not _may_see(user, version):
                    continue
                items.append(
                    {
                        "label": (version.title or "Untitled draft")[:90],
                        "hint": f"{version.organisation.name} - {opp.get_status_display()}",
                        "href": f"/workspace/opportunities/{opp.pk}",
                    }
                )
                if len(items) == SEARCH_PER_GROUP:
                    break
            if items:
                groups.append({"group": "Opportunities", "items": items})
            if user.has_permission_code(Permission.ORG_CREATE):
                orgs = Organisation.objects.filter(name__icontains=term, merged_into__isnull=True).order_by(
                    "name"
                )
                items = [
                    {
                        "label": o.name,
                        "hint": "Organisation",
                        "href": f"/workspace/manage/organisations/{o.pk}",
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
                        "href": f"/workspace/records/reports/{r.pk}",
                    }
                    for r in reports[:SEARCH_PER_GROUP]
                ]
                if items:
                    groups.append({"group": "Public reports", "items": items})
        return Response({"query": term, "groups": groups})


class CategoryListView(StaffView):
    @extend_schema(
        operation_id="listStaffCategories",
        tags=["staff"],
        responses=OpenApiResponse(description="Categories with their active detail schema"),
    )
    def get(self, request: Request) -> Response:
        out = []
        for cat in Category.objects.filter(active=True).order_by("sort_order", "code"):
            schema = cat.detail_schemas.filter(status="active").first()
            fields: list[dict[str, Any]] = []
            required: list[str] = []
            if schema is not None:
                loaded = load_schema(cat.code, schema.version)
                required = list(loaded.get("required", []))
                for key, prop in loaded.get("properties", {}).items():
                    items = prop.get("items", {})
                    fields.append(
                        {
                            "name": key,
                            "type": prop.get("type"),
                            "format": prop.get("format"),
                            "enum": prop.get("enum"),
                            "item_enum": items.get("enum"),
                            "item_type": items.get("type"),
                            "max_length": prop.get("maxLength"),
                            "required": key in required,
                        }
                    )
            out.append({"code": cat.code, "name": cat.name, "detail_fields": fields})
        return Response({"data": out})


class OrganisationListView(StaffView):
    @extend_schema(
        operation_id="listStaffOrganisations",
        tags=["staff"],
        responses=OpenApiResponse(description="Organisations by name"),
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not user.has_permission_code(Permission.ORG_CREATE):
            return Response({"data": []})
        term = str(request.query_params.get("q", "")).strip()[:SEARCH_MAX]
        qs = Organisation.objects.filter(merged_into__isnull=True)
        if term:
            qs = qs.filter(name__icontains=term)
        return Response({"data": [{"id": str(o.pk), "name": o.name} for o in qs.order_by("name")[:20]]})


class ContentHealthView(StaffView):
    @extend_schema(
        operation_id="getStaffContentHealth",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Launch target and freshness figures"), 403: None},
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not user.has_permission_code(Permission.OPP_REVIEW_APPROVE):  # editors and administrators
            return error_response("permission_denied", "You do not have access to this page.", 403)
        data = health.report()
        data["live_per_category"] = [
            {"code": code, "live": n} for code, n in sorted(data["live_per_category"].items())
        ]
        data["pipeline"] = [{"status": k, "count": v} for k, v in sorted(data["pipeline"].items())]
        return Response(data)
