"""Organisations, employer claims, public reports, staff accounts and the audit log."""

from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission, Role
from accounts import mfa
from accounts.models import AccountStatus, StaffRoleAssignment, User
from api.errors import error_response
from audit import services as audit
from audit.models import AuditEvent
from catalog.models import Organisation
from catalog.text import TextError, clean_single_line, normalise_name
from catalog.validators import validate_url
from employers import services as employer_services
from employers.models import EmployerMembership, OrganisationClaim, OrganisationVerification
from opportunities import workflow
from opportunities.errors import NotFoundError, WorkflowError
from opportunities.models import OpportunityVersion, VersionState
from reports import moderation
from reports.models import OPEN_STATUSES, ListingReport, ReportEvent, ReportStatus

from .common import (
    StaffView,
    as_uuid,
    bad_body,
    body_of,
    int_param,
    invalid,
    iso,
    not_found,
    paginate,
    refused,
)

# --- organisations --------------------------------------------------------------------------------


def _verification_of(organisation_id: uuid.UUID) -> OrganisationVerification | None:
    return OrganisationVerification.objects.filter(
        organisation_id=organisation_id, revoked_at__isnull=True
    ).first()


def org_row(
    organisation: Organisation, verification: OrganisationVerification | None, listings: int
) -> dict[str, Any]:
    """`verified` is true only for an organisation whose ownership staff confirmed through an employer claim.
    A name typed in by staff is never verified, whatever they enter (D-35)."""
    return {
        "id": str(organisation.pk),
        "name": organisation.name,
        "website_url": organisation.website_url,
        "verified": verification is not None,
        "verification": None
        if verification is None
        else {"method": verification.method, "verified_at": iso(verification.verified_at)},
        "origin": "verified_employer" if verification is not None else "entered_by_staff",
        "listings": listings,
        "created_at": iso(organisation.created_at),
        "row_version": organisation.row_version,
    }


def _clean_org(
    data: dict[str, Any], *, partial: bool
) -> tuple[dict[str, Any], dict[str, list[dict[str, str]]]]:
    out: dict[str, Any] = {}
    errors: dict[str, list[dict[str, str]]] = {}
    if "name" in data or not partial:
        try:
            name = clean_single_line(str(data.get("name", "")))
        except TextError as exc:
            errors["name"] = [{"code": exc.code, "message": str(exc)}]
        else:
            if not 2 <= len(name) <= 200:
                errors["name"] = [{"code": "too_short", "message": "Use 2 to 200 characters."}]
            out["name"] = name
    if "website_url" in data:
        raw = data["website_url"]
        if raw in (None, ""):
            out["website_url"] = None
        else:
            try:
                out["website_url"] = validate_url(str(raw), field_name="Website")
            except TextError as exc:
                errors["website_url"] = [{"code": exc.code, "message": str(exc)}]
    return out, errors


class OrganisationListView(StaffView):
    required_permission = Permission.ORG_CREATE

    def get(self, request: Request) -> Response:
        params = request.query_params
        queryset = Organisation.objects.filter(merged_into__isnull=True)
        if text := params.get("q", "").strip()[:100]:
            queryset = queryset.filter(name_normalized__contains=normalise_name(text))
        is_verified = Exists(
            OrganisationVerification.objects.filter(organisation=OuterRef("pk"), revoked_at__isnull=True)
        )
        if params.get("origin") == "verified_employer":
            queryset = queryset.filter(is_verified)
        elif params.get("origin") == "entered_by_staff":
            queryset = queryset.filter(~is_verified)
        queryset = queryset.annotate(listing_count=Count("versions__opportunity", distinct=True)).order_by(
            "name"
        )
        rows, page = paginate(request, queryset)
        verified = {
            v.organisation_id: v
            for v in OrganisationVerification.objects.filter(
                organisation_id__in=[o.pk for o in rows], revoked_at__isnull=True
            )
        }
        return Response(
            {"data": [org_row(o, verified.get(o.pk), o.listing_count) for o in rows], "page": page}
        )

    def post(self, request: Request) -> Response:
        data = body_of(request)
        if data is None:
            return bad_body()
        cleaned, errors = _clean_org(data, partial=False)
        if errors:
            return error_response("validation_failed", "The organisation is not valid.", 400, errors)
        user = self.user_of(request)
        existing = Organisation.objects.filter(name_normalized=normalise_name(cleaned["name"])).first()
        if existing is not None and data.get("allow_duplicate") is not True:
            return error_response(
                "duplicate_organisation",
                f"An organisation called “{existing.name}” already exists. Select it instead.",
                409,
                {"name": [{"code": "duplicate", "message": str(existing.pk)}]},
            )
        with transaction.atomic():
            organisation = Organisation.objects.create(created_by=user, **cleaned)
            audit.record(
                action="organisation.create",
                object_type="organisation",
                object_id=organisation.pk,
                actor_id=user.pk,
                changes={"fields": sorted(cleaned), "via": "staff_console"},
            )
        return Response(org_row(organisation, None, 0), status=status.HTTP_201_CREATED)


class OrganisationDetailView(StaffView):
    required_permission = Permission.ORG_CREATE

    def get(self, request: Request, organisation_id: uuid.UUID) -> Response:
        organisation = Organisation.objects.filter(pk=organisation_id).first()
        if organisation is None:
            return not_found()
        listings = (
            OpportunityVersion.objects.filter(organisation=organisation)
            .values("opportunity")
            .distinct()
            .count()
        )
        return Response(org_row(organisation, _verification_of(organisation.pk), listings))

    def patch(self, request: Request, organisation_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        if not user.has_permission_code(Permission.ORG_EDIT):
            return error_response("permission_denied", "You may not edit organisations.", 403)
        data = body_of(request)
        if data is None or not isinstance(data.get("row_version"), int):
            return bad_body("Send {row_version, name?, website_url?}.")
        cleaned, errors = _clean_org(data, partial=True)
        if errors:
            return error_response("validation_failed", "The organisation is not valid.", 400, errors)
        with transaction.atomic():
            organisation = Organisation.objects.select_for_update().filter(pk=organisation_id).first()
            if organisation is None:
                return not_found()
            if organisation.row_version != data["row_version"]:
                return error_response(
                    "state_conflict", "The organisation changed; reload and try again.", 409
                )
            changed = sorted(k for k, v in cleaned.items() if getattr(organisation, k) != v)
            for key, value in cleaned.items():
                setattr(organisation, key, value)
            organisation.row_version += 1
            organisation.save()
            audit.record(
                action="organisation.update",
                object_type="organisation",
                object_id=organisation.pk,
                actor_id=user.pk,
                changes={"fields": changed, "via": "staff_console"},
            )
            if "name" in changed:
                workflow.refresh_search_vectors_for_organisation(organisation)
        return Response(org_row(organisation, _verification_of(organisation.pk), 0))


# --- employer claims ------------------------------------------------------------------------------
def claim_row(claim: OrganisationClaim) -> dict[str, Any]:
    return {
        "id": str(claim.pk),
        "claimant": {"id": str(claim.user_id), "name": claim.user.display_name},
        "organisation_name": claim.organisation_name,
        "organisation_id": str(claim.organisation_id) if claim.organisation_id else None,
        "website_url": claim.website_url,
        "registration_number": claim.registration_number,
        "role_title": claim.role_title,
        "evidence_note": claim.evidence_note,
        "status": claim.status,
        "created_at": iso(claim.created_at),
        "decided_at": iso(claim.decided_at),
        "decision_reason": claim.decision_reason,
        "already_verified": claim.organisation_id is not None
        and _verification_of(claim.organisation_id) is not None,
    }


class ClaimListView(StaffView):
    required_permission = Permission.EMPLOYER_REVIEW

    def get(self, request: Request) -> Response:
        wanted = request.query_params.get("status", "pending")
        queryset = OrganisationClaim.objects.select_related("user").order_by("created_at")
        if wanted != "all":
            queryset = queryset.filter(status=wanted)
        rows, page = paginate(request, queryset)
        return Response({"data": [claim_row(c) for c in rows], "page": page})


class ClaimDecisionView(StaffView):
    required_permission = Permission.EMPLOYER_REVIEW

    def post(self, request: Request, claim_id: uuid.UUID) -> Response:
        data = body_of(request)
        if data is None or not isinstance(data.get("approve"), bool):
            return bad_body("Send {approve: true|false, ...}.")
        user = self.user_of(request)
        try:
            employer_services.decide_claim(
                user,
                claim_id,
                approve=data["approve"],
                reason=data.get("reason"),
                organisation_id=data.get("organisation_id"),
                method=data.get("method"),
                evidence_note=data.get("evidence_note"),
                role=str(data.get("role") or "owner"),
            )
        except WorkflowError as exc:
            return refused(exc)
        claim = OrganisationClaim.objects.select_related("user").get(pk=claim_id)
        return Response(claim_row(claim))


# --- public reports -------------------------------------------------------------------------------
def report_row(report: ListingReport) -> dict[str, Any]:
    version = report.live_version
    return {
        "id": str(report.pk),
        "reference": report.reference,
        "reason": report.reason,
        "reason_label": report.get_reason_display(),
        "status": report.status,
        "resolution": report.resolution,
        "opportunity": {
            "id": str(report.opportunity_id),
            "title": version.title if version else "",
            "slug": report.opportunity.slug,
        },
        "duplicate_count": report.duplicate_count,
        "assigned_to": report.assigned_to.display_name if report.assigned_to else None,
        "created_at": iso(report.created_at),
        "row_version": report.row_version,
    }


class ReportListView(StaffView):
    required_permission = Permission.REPORT_READ

    def get(self, request: Request) -> Response:
        wanted = request.query_params.get("status", "open")
        queryset = ListingReport.objects.select_related("opportunity", "live_version", "assigned_to")
        if wanted == "open":
            queryset = queryset.filter(status__in=OPEN_STATUSES)
        elif wanted == "closed":
            queryset = queryset.exclude(status__in=OPEN_STATUSES)
        elif wanted in ReportStatus.values:
            queryset = queryset.filter(status=wanted)
        rows, page = paginate(request, queryset.order_by("created_at"))
        return Response({"data": [report_row(r) for r in rows], "page": page})


class ReportDetailView(StaffView):
    required_permission = Permission.REPORT_READ

    def get(self, request: Request, report_id: uuid.UUID) -> Response:
        report = (
            ListingReport.objects.select_related("opportunity", "live_version", "assigned_to")
            .filter(pk=report_id)
            .first()
        )
        if report is None:
            return not_found()
        user = self.user_of(request)
        events = ReportEvent.objects.filter(report=report).select_related("actor")
        return Response(
            {
                **report_row(report),
                "details": report.details,
                "evidence_url": report.evidence_url,
                "contact_email": report.contact_email,
                "is_participant": moderation.is_participant(user, report.opportunity),
                "events": [
                    {
                        "action": e.action,
                        "label": e.get_action_display(),
                        "actor": e.actor.display_name if e.actor else "Reporter",
                        "from_status": e.from_status,
                        "to_status": e.to_status,
                        "note": e.note,
                        "at": iso(e.created_at),
                    }
                    for e in events
                ],
            }
        )


class ReportActionView(StaffView):
    required_permission = Permission.REPORT_READ

    def post(self, request: Request, report_id: uuid.UUID, action: str) -> Response:
        data = body_of(request)
        if data is None or not isinstance(data.get("row_version"), int):
            return bad_body("Send {row_version, ...}.")
        user = self.user_of(request)
        version = data["row_version"]
        try:
            match action:
                case "investigate":
                    moderation.investigate(user, report_id, expected_row_version=version)
                case "note":
                    moderation.add_note(user, report_id, expected_row_version=version, note=data.get("note"))
                case "escalate":
                    moderation.escalate(user, report_id, expected_row_version=version, note=data.get("note"))
                case "resolve":
                    moderation.resolve(
                        user, report_id, expected_row_version=version,
                        resolution=str(data.get("resolution", "")), note=data.get("note"),
                    )  # fmt: skip
                case "dismiss":
                    moderation.dismiss(
                        user, report_id, expected_row_version=version,
                        resolution=str(data.get("resolution", "")), note=data.get("note"),
                    )  # fmt: skip
                case "reopen":
                    moderation.reopen(user, report_id, expected_row_version=version, note=data.get("note"))
                case "listing":
                    moderation.act_on_listing(
                        user, report_id, expected_row_version=version,
                        action=str(data.get("listing_action", "")), reason=data.get("note"),
                        reason_code=str(data.get("reason_code") or "other"),
                    )  # fmt: skip
                case _:
                    return not_found()
        except NotFoundError:
            return not_found()
        except WorkflowError as exc:
            return refused(exc)
        return ReportDetailView().get(request, report_id)


# --- staff accounts -------------------------------------------------------------------------------
MANAGEABLE_ROLES = (
    Role.CONTRIBUTOR,
    Role.EDITOR,
)  # Administrator grants wait for OQ-13 (second-admin confirmation)


def staff_row(user: User) -> dict[str, Any]:
    roles = sorted(user.active_roles())
    return {
        "id": str(user.pk),
        "email": user.email,
        "display_name": user.display_name,
        "status": user.status,
        "roles": roles,
        "two_step_enrolled": mfa.is_enrolled(user),
        "created_at": iso(user.created_at),
    }


class UserListView(StaffView):
    required_permission = Permission.USER_ROLE_GRANT

    def get(self, request: Request) -> Response:
        holders = StaffRoleAssignment.objects.filter(revoked_at__isnull=True).values("user")
        queryset = User.objects.filter(pk__in=holders)
        if text := request.query_params.get("q", "").strip()[:100]:
            queryset = queryset.filter(Q(display_name__icontains=text) | Q(email__icontains=text))
        rows, page = paginate(request, queryset.order_by("display_name"))
        return Response(
            {"data": [staff_row(u) for u in rows], "page": page, "manageable_roles": list(MANAGEABLE_ROLES)}
        )


class UserActionView(StaffView):
    required_permission = Permission.USER_ROLE_GRANT

    def post(self, request: Request, user_id: uuid.UUID, action: str) -> Response:
        data = body_of(request)
        if data is None:
            return bad_body()
        actor = self.user_of(request)
        reason = str(data.get("reason", "")).strip()
        if len(reason) < 10 or len(reason) > 500:
            return invalid("reason", "Give a reason of 10 to 500 characters.", "too_short")
        target = User.objects.filter(pk=user_id).first()
        if target is None:
            return not_found()
        if target.pk == actor.pk:
            return error_response("separation_of_duties", "You cannot change your own access.", 403)
        if action in ("grant", "revoke"):
            role = str(data.get("role", ""))
            if role not in MANAGEABLE_ROLES:
                return invalid("role", "Only Contributor and Editor can be managed here.", "invalid_choice")
            with transaction.atomic():
                active = StaffRoleAssignment.objects.filter(user=target, role=role, revoked_at__isnull=True)
                if action == "grant":
                    if target.status != AccountStatus.ACTIVE:
                        return error_response("account_unavailable", "The account is not active.", 409)
                    if active.exists():
                        return error_response("already_held", "The person already holds that role.", 409)
                    StaffRoleAssignment.objects.create(
                        user=target, role=role, granted_by=actor, reason=reason
                    )
                else:
                    row = active.first()
                    if row is None:
                        return error_response("not_held", "The person does not hold that role.", 409)
                    row.revoked_at, row.revoked_by = timezone.now(), actor
                    row.save()
                audit.record(
                    action=f"role.{action}",
                    object_type="user",
                    object_id=target.pk,
                    actor_id=actor.pk,
                    severity="privileged",
                    changes={"role": role, "reason": reason, "via": "staff_console"},
                )
            target.refresh_roles()
        elif action == "reset-two-step":
            if not mfa.reset(target, actor=actor, reason=reason):
                return error_response("not_enrolled", "That person has no two-step device to reset.", 409)
        else:
            return not_found()
        return Response(staff_row(target))


# --- audit log ------------------------------------------------------------------------------------
class AuditListView(StaffView):
    required_permission = Permission.AUDIT_READ_ALL

    def get(self, request: Request) -> Response:
        params = request.query_params
        queryset = AuditEvent.objects.all()
        if action := params.get("action", "").strip()[:64]:
            queryset = queryset.filter(action__startswith=action)
        if severity := params.get("severity"):
            queryset = queryset.filter(severity=severity)
        if object_type := params.get("object_type", "").strip()[:48]:
            queryset = queryset.filter(object_type=object_type)
        if actor := as_uuid(params.get("actor")):
            queryset = queryset.filter(actor_ref=actor)
        if obj := as_uuid(params.get("object")):
            queryset = queryset.filter(object_id=obj)
        rows, page = paginate(request, queryset.order_by("-occurred_at", "-pk"))
        names = dict(
            User.objects.filter(pk__in={r.actor_ref for r in rows if r.actor_ref}).values_list(
                "pk", "display_name"
            )
        )
        return Response(
            {
                "data": [
                    {
                        "id": r.pk,
                        "at": iso(r.occurred_at),
                        "action": r.action,
                        "severity": r.severity,
                        "actor_type": r.actor_type,
                        "actor": names.get(r.actor_ref) if r.actor_ref else None,
                        "actor_id": str(r.actor_ref) if r.actor_ref else None,
                        "object_type": r.object_type,
                        "object_id": str(r.object_id) if r.object_id else None,
                        "request_id": r.request_id,
                        "changes": r.changes,
                    }
                    for r in rows
                ],
                "page": page,
            }
        )


__all__ = ["EmployerMembership", "VersionState", "int_param", "iso"]
