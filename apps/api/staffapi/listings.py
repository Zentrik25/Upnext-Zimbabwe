"""Opportunities for the staff console: list, detail, create, save and every workflow action.

The table and editor read through the same visibility rules Django Admin used (Administrators see every
listing; Editors do not see other people's never-published drafts; Contributors see only listings they took
part in). Writes call the publishing service, which re-checks permission, separation of duties, optimistic
concurrency and writes the history and audit rows.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from django.db.models import Case, F, Q, QuerySet, When
from django.db.models.functions import Lower
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from accounts.models import User
from audit import services as audit
from audit.models import Severity
from catalog import markdown
from catalog.models import Category
from catalog.text import TextError
from employers.models import EmployerListing, OrganisationVerification
from opportunities import workflow
from opportunities.errors import WorkflowError
from opportunities.models import (
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    PublishingEvent,
    ReviewDecision,
    VerificationRecord,
    VersionState,
)
from opportunities.validation import _EMPLOYMENT_RULES, _FORBIDDEN

from .common import (
    StaffView,
    as_uuid,
    bad_body,
    body_of,
    invalid,
    iso,
    not_found,
    paginate,
    refused,
)

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "catalog" / "schemas"
OPEN_STATES = [VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED]
TRANSITION_LABELS = {
    "T01": "Draft created",
    "T02": "Draft saved",
    "T03": "Submitted for review",
    "T04": "Approved",
    "T05": "Rejected",
    "T06": "Returned after approval",
    "T07": "Published",
    "T09": "Taken down",
    "T10": "Withdrawn",
    "T11": "Expired",
    "T12": "Archived",
    "T13": "Draft discarded",
    "T14": "Reopened after rejection",
    "T15": "Amendment started",
    "V01": "Verification recorded",
}
VIEWS = (
    "all", "drafts", "mine", "review", "ready", "employer", "published", "expired", "withdrawn", "archived",
)  # fmt: skip
SORTS = {
    "updated": "updated_at",
    "title": "title_sort",
    "organisation": "org_sort",
    "category": "category__name",
    "status": "status",
    "closing": "closing_sort",
    "author": "author_sort",
}


def current_version(opportunity: Opportunity) -> OpportunityVersion | None:
    return opportunity.pending_version or opportunity.live_version


def visible_to(user: User) -> QuerySet[Opportunity]:
    """Listings this staff member may see at all (same rules as the former Django Admin)."""
    queryset = Opportunity.objects.select_related(
        "category",
        "pending_version__organisation",
        "pending_version__author",
        "live_version__organisation",
        "live_version__author",
    )
    if user.has_permission_code(Permission.AUDIT_READ_ALL):
        return queryset
    if user.has_permission_code(Permission.OPP_REVIEW_APPROVE):
        hidden = Q(pending_version__state=VersionState.DRAFT, live_version__isnull=True) & ~Q(
            pending_version__author=user
        )
        return queryset.exclude(hidden)
    return queryset.filter(
        Q(created_by=user) | Q(pending_version__author=user) | Q(versions__author=user)
    ).distinct()


def _verified_orgs(ids: set[uuid.UUID]) -> set[uuid.UUID]:
    return set(
        OrganisationVerification.objects.filter(organisation_id__in=ids, revoked_at__isnull=True).values_list(
            "organisation_id", flat=True
        )
    )


def _location_label(version: OpportunityVersion) -> str | None:
    primary = version.locations.select_related("location").order_by("-is_primary", "location__name").first()
    return version.location_text or (primary.location.name if primary else None)


def row_of(
    user: User, opportunity: Opportunity, *, verified: set[uuid.UUID], employer_owned: set[uuid.UUID]
) -> dict[str, Any]:
    version = current_version(opportunity)
    assert version is not None
    return {
        "id": str(opportunity.pk),
        "title": version.title or "Untitled draft",
        "organisation": {
            "id": str(version.organisation_id),
            "name": version.organisation.name,
            "verified": version.organisation_id in verified,
        },
        "category": {"code": opportunity.category.code, "name": opportunity.category.name},
        "location": _location_label(version),
        "status": opportunity.status,
        "version_state": version.state,
        "closing": {
            "at": iso(version.deadline_at),
            "timezone": version.deadline_timezone,
            "is_date_only": version.deadline_is_date_only,
        },
        "author": {"id": str(version.author_id), "name": version.author.display_name},
        "authored_by_you": version.author_id == user.pk,
        "employer_owned": opportunity.pk in employer_owned,
        "direct_publication": version.direct_publication,
        "slug": opportunity.slug,
        "row_version": opportunity.row_version,
        "updated_at": iso(opportunity.updated_at),
        "actions": row_actions(user, opportunity),
    }


def row_actions(user: User, opportunity: Opportunity) -> list[str]:
    version = current_version(opportunity)
    actions = workflow.allowed_actions(user, opportunity)
    if (
        version is not None
        and version.state == VersionState.DRAFT
        and version.author_id == user.pk
        and user.has_permission_code(Permission.OPP_DRAFT_EDIT_OWN)
    ):
        actions = ["edit", *actions]
    return actions


class OpportunityListView(StaffView):
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        params = request.query_params
        view = params.get("view", "all")
        if view not in VIEWS:
            return invalid("view", "Unknown list.")
        queryset = visible_to(user).annotate(
            title_sort=Lower(
                Case(
                    When(pending_version__isnull=False, then=F("pending_version__title")),
                    default=F("live_version__title"),
                )
            ),
            org_sort=Lower(
                Case(
                    When(pending_version__isnull=False, then=F("pending_version__organisation__name")),
                    default=F("live_version__organisation__name"),
                )
            ),
            author_sort=Lower(
                Case(
                    When(pending_version__isnull=False, then=F("pending_version__author__display_name")),
                    default=F("live_version__author__display_name"),
                )
            ),
            closing_sort=Case(
                When(pending_version__isnull=False, then=F("pending_version__deadline_at")),
                default=F("live_version__deadline_at"),
            ),
        )
        if view == "all":
            queryset = queryset.exclude(status=ListingStatus.ARCHIVED)
        match view:
            case "drafts":
                queryset = queryset.filter(
                    pending_version__state__in=[VersionState.DRAFT, VersionState.REJECTED]
                )
            case "mine":
                queryset = queryset.filter(
                    pending_version__author=user,
                    pending_version__state__in=[VersionState.DRAFT, VersionState.REJECTED],
                )
            case "review":
                queryset = queryset.filter(pending_version__state=VersionState.IN_REVIEW)
            case "ready":
                queryset = queryset.filter(pending_version__state=VersionState.APPROVED)
            case "employer":
                queryset = queryset.filter(
                    employer_binding__isnull=False,
                    pending_version__state__in=[VersionState.IN_REVIEW, VersionState.APPROVED],
                )
            case "published":
                queryset = queryset.filter(status=ListingStatus.PUBLISHED)
            case "expired":
                queryset = queryset.filter(status=ListingStatus.EXPIRED)
            case "withdrawn":
                queryset = queryset.filter(status=ListingStatus.WITHDRAWN)
            case "archived":
                queryset = queryset.filter(status=ListingStatus.ARCHIVED)
        if wanted := params.get("status"):
            queryset = queryset.filter(status=wanted)
        if category := params.get("category"):
            queryset = queryset.filter(category__code=category)
        if organisation := as_uuid(params.get("organisation")):
            queryset = queryset.filter(
                Q(pending_version__organisation_id=organisation)
                | Q(live_version__organisation_id=organisation)
            )
        if text := params.get("q", "").strip()[:100]:
            queryset = queryset.filter(
                Q(pending_version__title__icontains=text)
                | Q(live_version__title__icontains=text)
                | Q(pending_version__organisation__name__icontains=text)
                | Q(live_version__organisation__name__icontains=text)
                | Q(pending_version__location_text__icontains=text)
                | Q(live_version__location_text__icontains=text)
            )
        sort = params.get("sort", "updated")
        order = SORTS.get(sort)
        if order is None:
            return invalid("sort", "Unknown sort.")
        descending = params.get("dir", "desc" if sort in ("updated", "closing") else "asc") == "desc"
        key = F(order).desc(nulls_last=True) if descending else F(order).asc(nulls_last=True)
        queryset = queryset.order_by(key, "-pk")
        rows, page = paginate(request, queryset)
        employer_owned = set(
            EmployerListing.objects.filter(opportunity_id__in=[o.pk for o in rows]).values_list(
                "opportunity_id", flat=True
            )
        )
        verified = _verified_orgs({v.organisation_id for o in rows if (v := current_version(o))})
        return Response(
            {
                "data": [row_of(user, o, verified=verified, employer_owned=employer_owned) for o in rows],
                "page": page,
                "view": view,
            }
        )


# --- detail -------------------------------------------------------------------------------------
def _money(low: Any, high: Any, currency: str | None, period: str | None) -> dict[str, Any] | None:
    if low is None and high is None:
        return None
    return {
        "min": None if low is None else f"{low:.2f}",
        "max": None if high is None else f"{high:.2f}",
        "currency": currency,
        "period": period,
    }


def content_of(version: OpportunityVersion) -> dict[str, Any]:
    """The revision in the shape the editor sends back (`DraftContent`)."""
    return {
        "organisation_id": str(version.organisation_id),
        "title": version.title,
        "summary": version.summary,
        "description_md": version.description_md,
        "requirements_md": version.requirements_md,
        "locations": [
            {"location_id": str(r.location_id), "name": r.location.name, "is_primary": r.is_primary}
            for r in version.locations.select_related("location").order_by("-is_primary", "location__name")
        ],
        "location_text": version.location_text,
        "geographic_eligibility": version.geographic_eligibility,
        "work_mode": version.work_mode,
        "employment_type": version.employment_type,
        "experience_level": version.experience_level,
        "salary": _money(
            version.salary_min, version.salary_max, version.salary_currency, version.salary_period
        ),
        "funding": _money(
            version.funding_min, version.funding_max, version.funding_currency, version.funding_period
        ),
        "deadline_at": iso(version.deadline_at),
        "deadline_timezone": version.deadline_timezone,
        "deadline_is_date_only": version.deadline_is_date_only,
        "application_method": version.application_method,
        "application_url": version.application_url,
        "application_email": version.application_email,
        "application_instructions": version.application_instructions,
        "reference_number": version.reference_number,
        "contact_details": version.contact_details,
        "skills": [
            {"skill_id": str(r.skill_id), "name": r.skill.name, "is_required": r.is_required}
            for r in version.skills.select_related("skill").order_by("skill__name")
        ],
        "sector_ids": [str(r.sector_id) for r in version.sectors.all()],
        "sources": [
            {
                "kind": s.kind,
                "name": s.name,
                "url": s.url,
                "citation": s.citation,
                "observed_on": s.observed_on.isoformat(),
                "is_primary": s.is_primary,
            }
            for s in version.sources.order_by("-is_primary", "observed_on", "name")
        ],
        "detail": version.detail,
    }


def _person(user: User | None) -> dict[str, str] | None:
    return None if user is None else {"id": str(user.pk), "name": user.display_name}


def detail_of(user: User, opportunity: Opportunity) -> dict[str, Any]:
    version = current_version(opportunity)
    assert version is not None
    employer_owned = EmployerListing.objects.filter(opportunity=opportunity).exists()
    verified = _verified_orgs({version.organisation_id})
    row = row_of(
        user,
        opportunity,
        verified=verified,
        employer_owned={opportunity.pk} if employer_owned else set(),
    )
    events = (
        PublishingEvent.objects.filter(opportunity=opportunity)
        .select_related("actor")
        .order_by("-occurred_at")[:60]
    )
    decisions = (
        ReviewDecision.objects.filter(version__opportunity=opportunity)
        .select_related("decided_by", "version")
        .order_by("-decided_at")[:20]
    )
    verification = (
        VerificationRecord.objects.filter(opportunity=opportunity)
        .select_related("checked_by", "version")
        .order_by("-checked_at")[:20]
    )
    return {
        **row,
        "version": {
            "id": str(version.pk),
            "number": version.version_no,
            "state": version.state,
            "author": _person(version.author),
            "submitted_by": _person(version.submitted_by),
            "approved_by": _person(version.approved_by),
            "published_by": _person(version.published_by),
            "direct_publication": version.direct_publication,
        },
        "content": content_of(version),
        "has_live_version": opportunity.live_version_id is not None,
        "public_path": f"/opportunities/{opportunity.slug}" if opportunity.slug else None,
        "verification": {
            "level": opportunity.verification_level,
            "checked_at": iso(opportunity.verification_checked_at),
            "records": [
                {
                    "id": str(r.pk),
                    "level": r.level,
                    "method": r.method,
                    "outcome": r.outcome,
                    "evidence_note": r.evidence_note,
                    "checked_by": _person(r.checked_by),
                    "checked_at": iso(r.checked_at),
                    "version_no": r.version.version_no,
                }
                for r in verification
            ],
            "can_record": user.has_permission_code(Permission.OPP_VERIFY_RECORD)
            and user.pk not in workflow.chain_author_ids(version),
        },
        "decisions": [
            {
                "decision": d.decision,
                "reason": d.reason,
                "reason_code": d.reason_code,
                "checklist": d.checklist,
                "decided_by": _person(d.decided_by),
                "decided_at": iso(d.decided_at),
                "version_no": d.version.version_no,
            }
            for d in decisions
        ],
        "history": [
            {
                "transition": e.transition,
                "label": TRANSITION_LABELS.get(e.transition, e.transition),
                "from_status": e.from_status,
                "to_status": e.to_status,
                "actor": _person(e.actor) if e.actor_id else {"id": "", "name": "System"},
                "reason": e.reason,
                "at": iso(e.occurred_at),
            }
            for e in events
        ],
    }


def _find(user: User, opportunity_id: uuid.UUID) -> Opportunity | None:
    return visible_to(user).filter(pk=opportunity_id).first()


class OpportunityCollectionView(StaffView):
    required_permission = Permission.OPP_DRAFT_CREATE

    def post(self, request: Request) -> Response:
        data = body_of(request)
        if (
            data is None
            or not isinstance(data.get("content"), dict)
            or not isinstance(data.get("category"), str)
        ):
            return bad_body("Send {category, content}.")
        user = self.user_of(request)
        try:
            opportunity = workflow.create_draft(user, category_code=data["category"], content=data["content"])
        except WorkflowError as exc:
            return refused(exc)
        opportunity = _find(user, opportunity.pk)  # type: ignore[assignment]
        assert opportunity is not None
        return Response(detail_of(user, opportunity), status=status.HTTP_201_CREATED)


class OpportunityDetailView(StaffView):
    def get(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        opportunity = _find(user, opportunity_id)
        if opportunity is None or current_version(opportunity) is None:
            return not_found()
        version = current_version(opportunity)
        if version is not None and version.state == VersionState.DRAFT and version.author_id != user.pk:
            audit.record(
                action="opportunity.view_draft",
                object_type="opportunity",
                object_id=opportunity.pk,
                actor_id=user.pk,
                severity=Severity.PRIVILEGED,
                changes={"reason": "staff read-only access"},
            )
        return Response(detail_of(user, opportunity))

    def patch(self, request: Request, opportunity_id: uuid.UUID) -> Response:
        data = body_of(request)
        if (
            data is None
            or not isinstance(data.get("content"), dict)
            or not isinstance(data.get("row_version"), int)
        ):
            return bad_body("Send {row_version, content}.")
        user = self.user_of(request)
        if _find(user, opportunity_id) is None:
            return not_found()
        try:
            workflow.save_draft(
                user, opportunity_id, expected_row_version=data["row_version"], content=data["content"]
            )
        except WorkflowError as exc:
            return refused(exc)
        opportunity = _find(user, opportunity_id)
        assert opportunity is not None
        return Response(detail_of(user, opportunity))


def _row_version(data: dict[str, Any]) -> int | None:
    value = data.get("row_version")
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _text(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    return value if isinstance(value, str) else ""


def _run_action(
    user: User, name: str, opportunity: Opportunity, data: dict[str, Any], row_version: int
) -> None:
    pk = opportunity.pk
    match name:
        case "submit":
            workflow.submit(
                user,
                pk,
                expected_row_version=row_version,
                duplicate_acknowledgement=data.get("duplicate_acknowledgement"),
            )
        case "approve":
            workflow.approve(
                user, pk, expected_row_version=row_version, checklist=data.get("checklist") or {}
            )
        case "reject":
            workflow.reject(
                user,
                pk,
                expected_row_version=row_version,
                reason_code=_text(data, "reason_code"),
                reason=_text(data, "reason"),
            )
        case "return":
            workflow.return_approved(
                user,
                pk,
                expected_row_version=row_version,
                reason_code=_text(data, "reason_code"),
                reason=_text(data, "reason"),
            )
        case "publish":
            workflow.publish(user, pk, expected_row_version=row_version)
        case "publish_direct":
            workflow.publish_direct(
                user,
                pk,
                expected_row_version=row_version,
                checklist=data.get("checklist") or {},
                duplicate_acknowledgement=data.get("duplicate_acknowledgement"),
            )
        case "withdraw":
            workflow.withdraw(user, pk, expected_row_version=row_version, reason=_text(data, "reason"))
        case "expire":
            workflow.expire(user, pk, expected_row_version=row_version, reason=_text(data, "reason"))
        case "takedown":
            workflow.takedown(
                user,
                pk,
                expected_row_version=row_version,
                reason_code=_text(data, "reason_code"),
                reason=_text(data, "reason"),
            )
        case "archive":
            workflow.archive(user, pk, expected_row_version=row_version)
        case "discard":
            workflow.discard(user, pk, expected_row_version=row_version)
        case "reopen":
            workflow.reopen(user, pk, expected_row_version=row_version)
        case "amend":
            workflow.amend(user, pk, expected_row_version=row_version)
        case "verify":
            version = current_version(opportunity)
            assert version is not None
            workflow.record_verification(
                user,
                pk,
                version_no=version.version_no,
                level=_text(data, "level"),
                method=_text(data, "method"),
                outcome=_text(data, "outcome"),
                evidence_note=_text(data, "evidence_note"),
            )
        case _:  # pragma: no cover - the view checks the name first
            raise AssertionError(name)


ACTION_NAMES = (
    "submit", "approve", "reject", "return", "publish", "publish_direct", "withdraw", "expire", "takedown",
    "archive", "discard", "reopen", "amend", "verify",
)  # fmt: skip


class OpportunityActionView(StaffView):
    def post(self, request: Request, opportunity_id: uuid.UUID, action: str) -> Response:
        if action not in ACTION_NAMES:
            return not_found()
        data = body_of(request)
        if data is None:
            return bad_body()
        row_version = _row_version(data)
        if row_version is None:
            return invalid("row_version", "Send the row_version you were shown.", "required")
        user = self.user_of(request)
        opportunity = _find(user, opportunity_id)
        if opportunity is None:
            return not_found()
        try:
            _run_action(user, action, opportunity, data, row_version)
        except WorkflowError as exc:
            return refused(exc)
        opportunity = _find(user, opportunity_id)
        if opportunity is None or current_version(opportunity) is None:
            return Response({"id": str(opportunity_id), "status": "archived"})
        return Response(detail_of(user, opportunity))


# --- reference data for the editor --------------------------------------------------------------
class PreviewView(StaffView):
    """Renders the two Markdown fields with the public renderer (the preview shows what readers will see)."""

    required_permission = Permission.OPP_DRAFT_EDIT_OWN

    def post(self, request: Request) -> Response:
        data = body_of(request)
        if data is None:
            return bad_body()
        out: dict[str, str | None] = {}
        for source, target in (
            ("description_md", "description_html"),
            ("requirements_md", "requirements_html"),
        ):
            raw = data.get(source)
            if not raw:
                out[target] = None
                continue
            if not isinstance(raw, str) or len(raw) > 20000:
                return invalid(source, "Must be text of at most 20,000 characters.")
            try:
                markdown.check(raw)
            except TextError as exc:
                return invalid(source, str(exc), exc.code)
            out[target] = markdown.render(raw)
        return Response(out)


class CategorySchemaView(StaffView):
    """The category's detail schema (JSON Schema) so the editor can render its extra fields."""

    def get(self, request: Request, code: str) -> Response:
        if not Category.objects.filter(code=code, active=True).exists():
            return not_found()
        path = SCHEMA_DIR / code / "v1.json"
        if not path.is_file():
            return not_found()
        schema = json.loads(path.read_text())
        types = _EMPLOYMENT_RULES.get(code)
        return Response(
            {
                "category": code,
                "required": schema.get("required", []),
                "properties": schema.get("properties", {}),
                # Which shared fields this category accepts (the same rules publication enforces).
                "applicable": {
                    "employment_types": sorted(types) if types else None,
                    "work_mode": code not in _FORBIDDEN["work_mode"],
                    "experience_level": code not in _FORBIDDEN["experience_level"],
                    "salary": code not in _FORBIDDEN["salary"],
                    "funding": code not in _FORBIDDEN["funding"],
                    "deadline_required": code == "tenders",
                },
            }
        )
