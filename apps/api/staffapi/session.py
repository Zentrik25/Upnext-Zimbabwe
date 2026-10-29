"""Staff session, two-step verification, reference data, overview and settings."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import DEFAULT_REGISTRY, Permission
from accounts import mfa
from api.errors import error_response
from catalog.models import Category, Location, Sector
from core import staff_mfa
from employers.models import ClaimStatus, OrganisationClaim
from notifications.verification import delivery_verified
from opportunities.models import (
    ApplicationMethod,
    EmploymentType,
    ExperienceLevel,
    ListingStatus,
    Opportunity,
    PublishingEvent,
    SalaryPeriod,
    SourceKind,
    VerificationLevel,
    VerificationMethod,
    VerificationOutcome,
    VersionState,
    WorkMode,
)
from reports.models import OPEN_STATUSES, ListingReport

from .common import StaffView, bad_body, body_of, iso
from .listings import TRANSITION_LABELS, visible_to

# The permission codes the console cares about; sent so the interface hides what the server would refuse.
CONSOLE_CODES = (
    Permission.OPP_DRAFT_CREATE,
    Permission.OPP_PUBLISH_DIRECT,
    Permission.OPP_REVIEW_APPROVE,
    Permission.OPP_VERIFY_RECORD,
    Permission.OPP_WITHDRAW,
    Permission.OPP_TAKEDOWN,
    Permission.ORG_CREATE,
    Permission.ORG_EDIT,
    Permission.EMPLOYER_REVIEW,
    Permission.REPORT_READ,
    Permission.REPORT_TRIAGE,
    Permission.REPORT_RESOLVE,
    Permission.REPORT_RESOLVE_ESCALATED,
    Permission.USER_ROLE_GRANT,
    Permission.AUDIT_READ_ALL,
    Permission.SETTINGS_MANAGE,
    Permission.TAXONOMY_MANAGE,
)


def _mfa_state(request: Request) -> dict[str, Any]:
    user = request.user
    required = bool(settings.UPNEXT_STAFF_MFA_REQUIRED)
    return {
        "required": required,
        "verified": (not required) or bool(request.session.get(staff_mfa.SESSION_FLAG)),
        "enrolled": mfa.is_enrolled(user),  # type: ignore[arg-type]
    }


class SessionView(StaffView):
    """Who is signed in, what they may do and whether two-step verification is done."""

    mfa_exempt = True

    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        roles = sorted(user.active_roles())
        if not roles:
            return error_response("permission_denied", "This account has no staff role.", 403)
        return Response(
            {
                "user": {"id": str(user.pk), "email": user.email, "display_name": user.display_name},
                "roles": roles,
                "permissions": sorted(
                    c for c in CONSOLE_CODES if DEFAULT_REGISTRY.has(user.active_roles(), c)
                ),
                "mfa": _mfa_state(request),
                "session": {
                    "idle_seconds": settings.UPNEXT_STAFF_IDLE_SECONDS,
                    "absolute_seconds": settings.UPNEXT_STAFF_SESSION_SECONDS,
                },
            }
        )


class MfaEnrolmentView(StaffView):
    """Start enrolling an authenticator (returns the setup key) or confirm it with the first code."""

    mfa_exempt = True

    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not user.active_roles():
            return error_response("permission_denied", "This account has no staff role.", 403)
        if mfa.is_enrolled(user):
            return error_response("already_enrolled", "Two-step verification is already set up.", 409)
        enrolment = mfa.begin_enrolment(user)
        return Response({"secret": enrolment.secret, "uri": enrolment.uri})

    def post(self, request: Request) -> Response:
        user = self.user_of(request)
        data = body_of(request)
        if data is None or not isinstance(data.get("code"), str):
            return bad_body("Send {code}.")
        if not user.active_roles():
            return error_response("permission_denied", "This account has no staff role.", 403)
        if mfa.is_enrolled(user):
            return error_response("already_enrolled", "Two-step verification is already set up.", 409)
        if mfa.blocked(user):
            return error_response("mfa_blocked", "Too many incorrect codes. Try again in 15 minutes.", 429)
        codes = mfa.confirm_enrolment(user, data["code"][:32])
        if codes is None:
            return error_response(
                "mfa_invalid", "That code did not match. Check the setup key and your device clock.", 400
            )
        staff_mfa._mark_verified(request._request)
        return Response({"recovery_codes": codes})


class MfaVerifyView(StaffView):
    mfa_exempt = True

    def post(self, request: Request) -> Response:
        user = self.user_of(request)
        data = body_of(request)
        if data is None or not isinstance(data.get("code"), str):
            return bad_body("Send {code}.")
        if not user.active_roles():
            return error_response("permission_denied", "This account has no staff role.", 403)
        if not mfa.is_enrolled(user):
            return error_response("enrolment_required", "Set up two-step verification first.", 409)
        if mfa.blocked(user):
            return error_response("mfa_blocked", "Too many incorrect codes. Try again in 15 minutes.", 429)
        if not mfa.verify(user, data["code"][:32]):
            return error_response(
                "mfa_invalid",
                "That code is not valid. Enter the current code or an unused recovery code.",
                400,
            )
        staff_mfa._mark_verified(request._request)
        return Response({"verified": True})


def _choices(enum: Any) -> list[dict[str, str]]:
    return [{"value": value, "label": label} for value, label in enum.choices]


class ReferenceView(StaffView):
    """Everything the editor's pickers need, in one call."""

    def get(self, request: Request) -> Response:
        return Response(
            {
                "categories": [
                    {"code": c.code, "name": c.name} for c in Category.objects.filter(active=True)
                ],
                "locations": [
                    {"id": str(loc.pk), "name": loc.name, "kind": loc.kind}
                    for loc in Location.objects.filter(active=True)
                ],
                "sectors": [{"id": str(s.pk), "name": s.name} for s in Sector.objects.filter(active=True)],
                "choices": {
                    "work_mode": _choices(WorkMode),
                    "employment_type": _choices(EmploymentType),
                    "experience_level": _choices(ExperienceLevel),
                    "salary_period": _choices(SalaryPeriod),
                    "application_method": _choices(ApplicationMethod),
                    "source_kind": _choices(SourceKind),
                    "verification_level": _choices(VerificationLevel),
                    "verification_method": _choices(VerificationMethod),
                    "verification_outcome": _choices(VerificationOutcome),
                },
                "currencies": ["USD", "ZWG"],
                "timezone": "Africa/Harare",
            }
        )


class OverviewView(StaffView):
    """Dashboard counts and recent activity: all computed from live rows, nothing static."""

    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        now = timezone.now()
        base = visible_to(user)
        counts = base.aggregate(
            drafts=Count(
                "pk",
                filter=Q(pending_version__state__in=[VersionState.DRAFT, VersionState.REJECTED]),
                distinct=True,
            ),
            my_drafts=Count(
                "pk",
                filter=Q(
                    pending_version__author=user,
                    pending_version__state__in=[VersionState.DRAFT, VersionState.REJECTED],
                ),
                distinct=True,
            ),
            in_review=Count("pk", filter=Q(pending_version__state=VersionState.IN_REVIEW), distinct=True),
            approved=Count("pk", filter=Q(pending_version__state=VersionState.APPROVED), distinct=True),
            published=Count("pk", filter=Q(status=ListingStatus.PUBLISHED), distinct=True),
            closing_soon=Count(
                "pk",
                filter=Q(
                    status=ListingStatus.PUBLISHED,
                    live_version__deadline_at__gt=now,
                    live_version__deadline_at__lte=now + timedelta(days=7),
                ),
                distinct=True,
            ),
            expired=Count("pk", filter=Q(status=ListingStatus.EXPIRED), distinct=True),
            withdrawn=Count("pk", filter=Q(status=ListingStatus.WITHDRAWN), distinct=True),
            employer_pending=Count(
                "pk",
                filter=Q(
                    employer_binding__isnull=False,
                    pending_version__state__in=[VersionState.IN_REVIEW, VersionState.APPROVED],
                ),
                distinct=True,
            ),
        )
        queue_filter = (
            Q(pending_version__state=VersionState.IN_REVIEW)
            & ~Q(pending_version__author=user)
            & ~Q(pending_version__submitted_by=user)
        )
        counts["awaiting_my_review"] = (
            base.filter(queue_filter).distinct().count()
            if user.has_permission_code(Permission.OPP_REVIEW_APPROVE)
            else 0
        )
        counts["open_reports"] = (
            ListingReport.objects.filter(status__in=OPEN_STATUSES).count()
            if user.has_permission_code(Permission.REPORT_READ)
            else None
        )
        counts["pending_claims"] = (
            OrganisationClaim.objects.filter(status=ClaimStatus.PENDING).count()
            if user.has_permission_code(Permission.EMPLOYER_REVIEW)
            else None
        )
        visible_ids = base.values("pk")
        events = (
            PublishingEvent.objects.filter(opportunity_id__in=visible_ids)
            .select_related("actor", "opportunity__pending_version", "opportunity__live_version")
            .order_by("-occurred_at")[:10]
        )
        activity = []
        for event in events:
            version = event.opportunity.pending_version or event.opportunity.live_version
            activity.append(
                {
                    "opportunity_id": str(event.opportunity_id),
                    "title": (version.title if version else "") or "Untitled draft",
                    "label": TRANSITION_LABELS.get(event.transition, event.transition),
                    "actor": event.actor.display_name if event.actor else "System",
                    "at": iso(event.occurred_at),
                }
            )
        return Response({"counts": counts, "activity": activity})


class SettingsView(StaffView):
    """Read-only runtime posture for administrators (no secrets)."""

    required_permission = Permission.SETTINGS_MANAGE

    def get(self, request: Request) -> Response:
        return Response(
            {
                "brand": {"name": settings.UPNEXT_BRAND_NAME, "short": settings.UPNEXT_BRAND_SHORT},
                "security": {
                    "staff_two_step_required": bool(settings.UPNEXT_STAFF_MFA_REQUIRED),
                    "staff_idle_minutes": settings.UPNEXT_STAFF_IDLE_SECONDS // 60,
                    "staff_session_hours": round(settings.UPNEXT_STAFF_SESSION_SECONDS / 3600, 1),
                },
                "email": {
                    "provider": settings.UPNEXT_EMAIL_BACKEND,
                    "delivery_verified": delivery_verified(),
                },
                "taxonomies": {
                    "categories": Category.objects.filter(active=True).count(),
                    "locations": Location.objects.filter(active=True).count(),
                    "sectors": Sector.objects.filter(active=True).count(),
                },
                "totals": {
                    "listings": Opportunity.objects.count(),
                    "published": Opportunity.objects.filter(status=ListingStatus.PUBLISHED).count(),
                },
            }
        )
