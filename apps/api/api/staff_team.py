"""Staff management API (`/api/v1/staff/team/`, openapi tag `staff`, D-58): the Administrator's view of the staff
lifecycle, over `accounts.staff_admin`.

Nothing here decides anything. Reading and every action need an Administrator (the registry codes
`user.status.change`, `user.role.grant`, `user.role.revoke`) *and* a verified second step in the same session
(`StaffView`); the service re-checks the permission, the self-protection and last-Administrator rules inside its
own locked transaction. A seeker's id is a 404 here, not a profile: only people who hold or held a staff role exist
in this API. Request bodies are read field by field (no mass assignment) and answers never contain a password,
token, secret or another person's e-mail beyond the staff member being managed.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Q
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from access.registry import Permission
from accounts import mfa, services, staff_admin
from accounts.models import AccountStatus, User
from accounts.staff_admin import (
    ACTIVE,
    INVITATION_EXPIRED,
    INVITED,
    REMOVED,
    ROLE_LABELS,
    ROLE_ORDER,
    ROLE_SUMMARIES,
    SUSPENDED,
    StaffAdminError,
)
from audit.models import AuditEvent
from opportunities.models import Opportunity, PublishingEvent, VerificationRecord
from opportunities.staff import TRANSITION_LABELS

from .employer_views import _bad_body, _body
from .errors import error_response
from .public_views import _iso
from .staff_views import StaffView, _not_found, _paginate
from .throttles import TokenIpThrottle

STATE_LABELS = {
    ACTIVE: ("Active", "success"),
    SUSPENDED: ("Suspended", "danger"),
    INVITED: ("Invited", "info"),
    INVITATION_EXPIRED: ("Invitation expired", "warning"),
    REMOVED: ("Removed", "muted"),
}
ACTION_LABELS = {
    "staff.invited": "Invited to join the staff",
    "staff.invitation_resent": "Invitation sent again",
    "staff.invitation_accepted": "Accepted the invitation",
    "staff.role_changed": "Role changed",
    "staff.suspended": "Account suspended",
    "staff.reactivated": "Account reactivated",
    "staff.removed": "Removed from the staff",
    "staff.reinstated": "Reinstated",
    "staff.sessions_revoked": "Sessions revoked",
    "staff.recovery_sent": "Recovery link sent",
    "staff.profile_updated": "Profile updated",
    "account.password_reset": "Password reset",
    "account.password_changed": "Password changed",
    "role.grant": "Role granted (server command)",
    "role.revoke": "Role revoked (server command)",
    "opportunity.image_changed": "Listing image changed",
}
# Change keys that may be shown to an Administrator (the audit row never holds a password, token or e-mail).
SHOWN_CHANGES = (
    "role",
    "previous",
    "to",
    "reason",
    "sessions",
    "sessions_revoked",
    "display_name",
    "slot",
    "change",
)


def _fail(exc: StaffAdminError) -> Response:
    fields = {
        name: [{"code": "invalid", "message": message} for message in messages]
        for name, messages in exc.fields.items()
    }
    return error_response(exc.code, exc.message, exc.status, fields or None)


def _is_admin(user: User) -> bool:
    return user.has_permission_code(Permission.USER_STATUS_CHANGE) and user.has_permission_code(
        Permission.USER_ROLE_GRANT
    )


def _forbidden() -> Response:
    return error_response(
        "permission_denied", "Only Administrators can manage staff.", status.HTTP_403_FORBIDDEN
    )


class TeamView(StaffView):
    """Administrators only. The check runs before anything is read."""

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        super().initial(request, *args, **kwargs)
        if not _is_admin(self.user_of(request)):
            from api.errors import CodedPermissionDenied

            raise CodedPermissionDenied("permission_denied")


def _target(target_id: uuid.UUID) -> User | None:
    return staff_admin.staff_accounts().prefetch_related("role_assignments").filter(pk=target_id).first()


def _row(user: User, now: Any, invitation: Any, viewer: User) -> dict[str, Any]:
    live = bool(
        invitation
        and invitation.used_at is None
        and invitation.invalidated_at is None
        and invitation.expires_at > now
    )
    state = staff_admin.state_of(user, has_live_invitation=live)
    label, tone = STATE_LABELS[state]
    role = staff_admin.primary_role(user)
    return {
        "id": str(user.pk),
        "name": user.display_name,
        "email": user.email,
        "role": {"code": role, "label": ROLE_LABELS.get(role or "", "-")} if role else None,
        "status": {"code": state, "label": label, "tone": tone},
        "last_login": _iso(user.last_login),
        "joined": _iso(user.created_at),
        "invitation_expires_at": _iso(invitation.expires_at)
        if invitation and state in (INVITED, INVITATION_EXPIRED)
        else None,
        "is_you": user.pk == viewer.pk,
    }


def _role_choices() -> list[dict[str, str]]:
    return [{"value": r, "label": ROLE_LABELS[r], "summary": ROLE_SUMMARIES[r]} for r in ROLE_ORDER]


class TeamListView(TeamView):
    @extend_schema(
        operation_id="listStaffTeam", tags=["staff"], responses=OpenApiResponse(description="Staff accounts")
    )
    def get(self, request: Request) -> Response:
        viewer = self.user_of(request)
        params = request.query_params
        qs = staff_admin.filtered(
            search=params.get("q", ""),
            role=params.get("role", ""),
            status=params.get("status", ""),
            sort=params.get("sort", "name"),
        )
        users, page = _paginate(request, qs)
        invitations = staff_admin.invitations_for(users)
        now = timezone.now()
        return Response(
            {
                "summary": staff_admin.summary_counts(),
                "data": [_row(u, now, invitations.get(u.pk), viewer) for u in users],
                "page": page,
                "roles": _role_choices(),
            }
        )

    @extend_schema(
        operation_id="inviteStaff",
        tags=["staff"],
        request=None,
        responses={201: OpenApiResponse(description="Invited"), 400: None, 403: None},
    )
    def post(self, request: Request) -> Response:
        data = _body(request)
        if data is None:
            return _bad_body()
        unknown = set(data) - {"email", "display_name", "role"}
        if unknown:
            return error_response("validation_failed", "Unknown field.", 400)
        try:
            user = staff_admin.invite(
                self.user_of(request),
                email=str(data.get("email") or ""),
                display_name=str(data.get("display_name") or ""),
                role=str(data.get("role") or ""),
            )
        except StaffAdminError as exc:
            return _fail(exc)
        return Response({"id": str(user.pk)}, status=status.HTTP_201_CREATED)


def _count(qs: Any, field: str = "opportunity_id") -> int:
    return int(qs.values(field).distinct().count())


def _stats(user: User) -> dict[str, int]:
    events = PublishingEvent.objects.filter(actor=user)
    return {
        "created": Opportunity.objects.filter(created_by=user).count(),
        "edited": _count(events.filter(transition="T02")),
        "submitted": _count(events.filter(transition="T03")),
        "reviewed": _count(events.filter(transition__in=("T04", "T05", "T06"))),
        "verified": VerificationRecord.objects.filter(checked_by=user).count(),
        "published": _count(events.filter(transition="T07")),
    }


def _recent_listings(user: User) -> list[dict[str, Any]]:
    events = (
        PublishingEvent.objects.filter(actor=user)
        .select_related("opportunity__live_version", "opportunity__pending_version", "version")
        .order_by("-occurred_at")[:10]
    )
    out = []
    for e in events:
        opp = e.opportunity
        shown = e.version or opp.live_version or opp.pending_version
        out.append(
            {
                "id": str(opp.pk),
                "title": (shown.title if shown else "") or "Untitled draft",
                "what": TRANSITION_LABELS.get(e.transition, e.transition),
                "at": _iso(e.occurred_at),
                "href": f"/workspace/opportunities/{opp.pk}",
            }
        )
    return out


def _activity(request: Request, user: User) -> tuple[list[dict[str, Any]], dict[str, int]]:
    qs = AuditEvent.objects.filter(Q(actor_ref=user.pk) | Q(object_type="user", object_id=user.pk)).order_by(
        "-id"
    )
    events, page = _paginate(request, qs)
    ids = {e.actor_ref for e in events if e.actor_ref} | {
        e.object_id for e in events if e.object_type == "user" and e.object_id
    }
    names = {u.pk: u.display_name for u in User.objects.filter(pk__in=ids)}
    rows = []
    for e in events:
        changes = {k: v for k, v in (e.changes or {}).items() if k in SHOWN_CHANGES}
        rows.append(
            {
                "id": e.pk,
                "at": _iso(e.occurred_at),
                "what": ACTION_LABELS.get(e.action, e.action),
                "action": e.action,
                "severity": e.severity,
                "actor": names.get(e.actor_ref, "System") if e.actor_ref else "System",
                "target": names.get(e.object_id) if e.object_type == "user" and e.object_id else None,
                "details": changes or None,
            }
        )
    return rows, page


def _field(
    name: str,
    label: str,
    kind: str,
    *,
    required: bool = True,
    help_: str = "",
    choices: Any = None,
    min_length: int | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "label": label,
        "kind": kind,
        "lookup": None,
        "required": required,
        "help": help_,
        "choices": choices,
        "min_length": min_length,
    }


REASON = _field(
    "reason",
    "Reason",
    "textarea",
    help_="Kept in the audit log. 10 to 500 characters. Do not write passwords or links here.",
    min_length=staff_admin.REASON_MIN,
)


def _actions(viewer: User, target: User, state: str) -> list[dict[str, Any]]:
    is_self = viewer.pk == target.pk
    out: list[dict[str, Any]] = []
    role_field = _field(
        "role",
        "Role",
        "choice",
        choices=[{"value": r["value"], "label": r["label"]} for r in _role_choices()],
        help_="Replaces the current role. Permissions follow the role; there is no way to add single permissions.",
    )
    if state in (INVITED, INVITATION_EXPIRED):
        out.append(
            {
                "name": "resend-invitation",
                "label": "Send invitation again",
                "description": "Sends a new link. The earlier link stops working.",
                "fields": [],
            }
        )
    if not is_self and state != REMOVED:
        out.append(
            {
                "name": "change-role",
                "label": "Change role",
                "description": "The person is told by e-mail. Access changes at once.",
                "fields": [role_field, REASON],
            }
        )
    if state == ACTIVE and not is_self:
        out.append(
            {
                "name": "suspend",
                "label": "Suspend",
                "description": "Blocks sign-in and ends every session now. Their work and history stay.",
                "fields": [REASON],
            }
        )
        out.append(
            {
                "name": "send-recovery",
                "label": "Send recovery link",
                "description": "E-mails a one-hour link to choose a new password.",
                "fields": [],
            }
        )
        out.append(
            {
                "name": "revoke-sessions",
                "label": "Sign out everywhere",
                "description": "Ends every session of this person. They can sign in again.",
                "fields": [REASON],
            }
        )
    if state == SUSPENDED:
        out.append(
            {
                "name": "reactivate",
                "label": "Reactivate",
                "description": "Allows sign-in again with the same role.",
                "fields": [REASON],
            }
        )
    if state != REMOVED and not is_self:
        pending = state in (INVITED, INVITATION_EXPIRED)
        out.append(
            {
                "name": "remove",
                "label": "Cancel invitation" if pending else "Remove",
                "description": "Ends staff access and sessions. The account, published listings, reviews and audit history are kept; this cannot be undone except by reinstating.",
                "fields": [
                    REASON,
                    _field("confirm", "I understand this person loses all staff access", "boolean", help_=""),
                ],
            }
        )
    if state == REMOVED:
        out.append(
            {
                "name": "reinstate",
                "label": "Reinstate",
                "description": "Restores access with the role you choose.",
                "fields": [role_field, REASON],
            }
        )
    return out


def _detail(viewer: User, target: User, request: Request) -> dict[str, Any]:
    now = timezone.now()
    invitation = staff_admin.invitations_for([target]).get(target.pk)
    row = _row(target, now, invitation, viewer)
    role = row["role"]["code"] if row["role"] else None
    activity, page = _activity(request, target)
    admins = list(
        User.objects.filter(
            role_assignments__role="administrator",
            role_assignments__revoked_at__isnull=True,
            status=AccountStatus.ACTIVE,
        ).distinct()
    )
    protected = {
        "self": viewer.pk == target.pk,
        "last_administrator": len(admins) <= 1 and any(a.pk == target.pk for a in admins),
    }
    sessions = [
        {
            "id": str(s.pk),
            "device": s.user_agent_summary or "Browser",
            "last_seen": _iso(s.last_seen_at),
            "created": _iso(s.created_at),
        }
        for s in staff_admin.sessions_of(target)
    ]
    granted = sorted(target.role_assignments.all(), key=lambda a: a.granted_at)
    first = granted[0] if granted else None
    return {
        **row,
        "email_verified": target.email_verified_at is not None,
        "two_step": mfa.is_enrolled(target),
        "invited_by": first.granted_by.display_name if first and first.granted_by else None,
        "role_summary": ROLE_SUMMARIES.get(role or "", ""),
        "permissions": staff_admin.role_permissions(role) if row["status"]["code"] != REMOVED else [],
        "sessions": sessions,
        "stats": _stats(target),
        "recent_listings": _recent_listings(target),
        "activity": {"data": activity, "page": page},
        "protected": protected,
        "actions": _actions(viewer, target, row["status"]["code"]),
        "row_version": target.row_version,
    }


class TeamDetailView(TeamView):
    @extend_schema(
        operation_id="getStaffMember",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Profile"), 404: None},
    )
    def get(self, request: Request, target_id: uuid.UUID) -> Response:
        target = _target(target_id)
        if target is None:
            return _not_found()
        return Response(_detail(self.user_of(request), target, request))

    @extend_schema(
        operation_id="updateStaffMember",
        tags=["staff"],
        request=None,
        responses={200: OpenApiResponse(description="Updated profile"), 400: None, 404: None},
    )
    def patch(self, request: Request, target_id: uuid.UUID) -> Response:
        data = _body(request)
        if data is None:
            return _bad_body()
        if set(data) - {"display_name"}:
            return error_response("validation_failed", "Only the name can be changed here.", 400)
        if _target(target_id) is None:
            return _not_found()
        try:
            staff_admin.update_profile(
                self.user_of(request), target_id, display_name=str(data.get("display_name") or "")
            )
        except StaffAdminError as exc:
            return _fail(exc)
        target = _target(target_id)
        assert target is not None
        return Response(_detail(self.user_of(request), target, request))


class TeamActivityView(TeamView):
    @extend_schema(
        operation_id="listStaffMemberActivity",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Audit events"), 404: None},
    )
    def get(self, request: Request, target_id: uuid.UUID) -> Response:
        target = _target(target_id)
        if target is None:
            return _not_found()
        rows, page = _activity(request, target)
        return Response({"data": rows, "page": page})


class TeamActionView(TeamView):
    @extend_schema(
        operation_id="runStaffMemberAction",
        tags=["staff"],
        request=None,
        responses={
            200: OpenApiResponse(description="The profile after the action"),
            400: None,
            403: None,
            404: None,
            409: None,
        },
    )
    def post(self, request: Request, target_id: uuid.UUID, action: str) -> Response:
        actor = self.user_of(request)
        data = _body(request)
        if data is None:
            return _bad_body()
        if _target(target_id) is None:
            return _not_found()
        try:
            if action == "change-role":
                staff_admin.change_role(
                    actor, target_id, role=str(data.get("role") or ""), reason=str(data.get("reason") or "")
                )
            elif action == "suspend":
                staff_admin.suspend(actor, target_id, reason=str(data.get("reason") or ""))
            elif action == "reactivate":
                staff_admin.reactivate(actor, target_id, reason=str(data.get("reason") or ""))
            elif action == "remove":
                staff_admin.remove(
                    actor,
                    target_id,
                    reason=str(data.get("reason") or ""),
                    confirmed=data.get("confirm") is True,
                )
            elif action == "reinstate":
                staff_admin.reinstate(
                    actor, target_id, role=str(data.get("role") or ""), reason=str(data.get("reason") or "")
                )
            elif action == "resend-invitation":
                staff_admin.resend_invitation(actor, target_id)
            elif action == "send-recovery":
                staff_admin.send_recovery(actor, target_id)
            elif action == "revoke-sessions":
                staff_admin.revoke_sessions(actor, target_id, reason=str(data.get("reason") or ""))
            else:
                return _not_found()
        except StaffAdminError as exc:
            return _fail(exc)
        target = _target(target_id)
        assert target is not None
        return Response(_detail(actor, target, request))


@method_decorator(never_cache, name="dispatch")
class AcceptInvitationView(APIView):
    """Public: the person follows the emailed link and chooses a password. Same answer for every bad link."""

    permission_classes = [AllowAny]
    throttle_classes = [TokenIpThrottle]

    @extend_schema(
        operation_id="acceptStaffInvitation",
        tags=["auth"],
        request=None,
        responses={204: OpenApiResponse(description="Account active; sign in"), 400: None, 429: None},
    )
    def post(self, request: Request) -> Response:
        data = _body(request)
        if data is None:
            return _bad_body()
        token, password = data.get("token"), data.get("password")
        if not isinstance(token, str) or not isinstance(password, str) or not token or len(password) > 128:
            return error_response("validation_failed", "Send the link and a password.", 400)
        try:
            done = staff_admin.accept_invitation(token, password)
        except services.AccountError as exc:
            return error_response(
                "validation_failed",
                "Choose a stronger password.",
                400,
                {k: [{"code": "invalid", "message": m} for m in v] for k, v in exc.fields.items()},
            )
        if not done:
            return error_response("invalid_token", "This invitation link is invalid or has expired.", 400)
        return Response(status=status.HTTP_204_NO_CONTENT)
