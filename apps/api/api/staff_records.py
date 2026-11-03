"""Staff records API (`/api/v1/staff/records/`, D-49): the review queues and registers that used to be Django Admin
pages, as one small generic API.

A *resource* names a queryset, the people who may read it, the columns of its list, the facts of its detail page
and the actions that person may attempt. Reading needs the resource's permission code; every action calls the
service that already owns the rule (`employers.services`, `reports.moderation`, `notifications.services`), which
decides, locks, audits and refuses (separation of duties included). Nothing here writes state itself.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, cast

from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Case, Count, IntegerField, Q, QuerySet, Value, When
from django.http import QueryDict
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from accounts.models import StaffRoleAssignment, User
from audit import services as audit
from audit.models import AuditEvent, Severity
from employers import services as employer_services
from employers.models import (
    ClaimStatus,
    EmployerMembership,
    MemberRole,
    OrganisationClaim,
    OrganisationVerification,
    ProfileRevision,
    ProfileState,
)
from employers.staff_forms import ClaimDecisionForm, ProfileDecisionForm, RevokeForm
from notifications.models import EmailOutbox, OutboxStatus
from notifications.services import retry
from notifications.verification import EmailDeliveryVerification, config_hash
from opportunities.errors import WorkflowError
from reports import moderation
from reports.models import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    ListingReport,
    ReportStatus,
)
from reports.staff import ACTIONS as REPORT_ACTIONS
from reports.staff import available_actions as report_actions

from .employer_views import _body, _refused
from .errors import error_response
from .public_views import _iso
from .staff_views import PAGE_SIZE, StaffView, _form_fields, _paginate

Cell = str | dict[str, str] | None


@dataclass
class Column:
    key: str
    label: str
    kind: str = "text"  # text | datetime | badge


@dataclass
class Filter:
    name: str
    label: str
    choices: list[tuple[str, str]]


@dataclass
class ActionSpec:
    label: str
    description: str
    form: type[forms.Form]
    run: Callable[[User, Any, dict[str, Any]], None]


@dataclass
class Resource:
    key: str
    label: str
    description: str
    permission: Permission
    queryset: Callable[[User], QuerySet[Any]]
    columns: list[Column]
    row: Callable[[Any], dict[str, Cell]]
    title: Callable[[Any], str]
    facts: Callable[[User, Any], list[dict[str, str]]]
    filters: list[Filter] = field(default_factory=list)
    apply: Callable[[QuerySet[Any], User, QueryDict], QuerySet[Any]] = lambda qs, user, params: qs
    search: tuple[str, ...] = ()
    sections: Callable[[User, Any], list[dict[str, Any]]] | None = None
    actions: Callable[[User, Any], list[str]] = lambda user, obj: []
    specs: dict[str, ActionSpec] = field(default_factory=dict)
    row_version: bool = False
    status_of: Callable[[Any], tuple[str, str]] | None = None
    notice: Callable[[User, Any], str | None] | None = None


def _fact(label: str, value: Any) -> dict[str, str]:
    return {"label": label, "value": "-" if value in (None, "") else str(value)}


def _when(value: Any) -> str:
    return f"{value:%d %b %Y %H:%M} UTC" if value else "-"


def _name(user: Any) -> str:
    return user.display_name if user is not None else "-"


def _tone(label: str, tone: str) -> dict[str, str]:
    return {"text": label, "tone": tone}


# --- employer review -------------------------------------------------------------------------------------------
CLAIM_TONES = {
    ClaimStatus.PENDING: "warning",
    ClaimStatus.APPROVED: "success",
    ClaimStatus.REJECTED: "danger",
    ClaimStatus.WITHDRAWN: "muted",
}


def _claim_run(user: User, obj: OrganisationClaim, data: dict[str, Any]) -> None:
    chosen = data.get("organisation")
    employer_services.decide_claim(
        user,
        obj.pk,
        approve=data["decision"] == "approve",
        reason=data.get("reason"),
        organisation_id=chosen.pk if chosen else None,
        method=data.get("method") or None,
        evidence_note=data.get("evidence_note"),
        role=data.get("role") or MemberRole.OWNER,
    )


def _profile_run(user: User, obj: ProfileRevision, data: dict[str, Any]) -> None:
    employer_services.decide_profile_revision(
        user, obj.pk, approve=data["decision"] == "approve", reason=data.get("reason")
    )


def _status_filter(model_status: str) -> Callable[[QuerySet[Any], User, QueryDict], QuerySet[Any]]:
    def apply(qs: QuerySet[Any], user: User, params: QueryDict) -> QuerySet[Any]:
        value = params.get("status", "")
        return qs.filter(**{model_status: value}) if value else qs

    return apply


def _pending_first(field_name: str, pending: str) -> Case:
    return Case(When(**{field_name: pending}, then=Value(0)), default=Value(1), output_field=IntegerField())


CLAIMS = Resource(
    key="claims",
    label="Employer submissions",
    description="Requests to act for an organisation. A claim grants nothing until a different person decides it.",
    permission=Permission.EMPLOYER_REVIEW,
    queryset=lambda user: OrganisationClaim.objects.select_related(
        "user", "organisation", "decided_by"
    ).order_by(_pending_first("status", "pending"), "-created_at"),
    columns=[
        Column("organisation", "Organisation"),
        Column("claimant", "Claimant"),
        Column("status", "Status", "badge"),
        Column("created_at", "Submitted", "datetime"),
    ],
    row=lambda c: {
        "organisation": c.organisation_name,
        "claimant": f"{c.user.display_name} <{c.user.email}>",
        "status": _tone(c.get_status_display(), CLAIM_TONES.get(c.status, "neutral")),
        "created_at": _iso(c.created_at),
    },
    title=lambda c: c.organisation_name,
    facts=lambda user, c: [
        _fact("Claimant", f"{c.user.display_name} <{c.user.email}>"),
        _fact("Organisation", c.organisation.name if c.organisation else f"{c.organisation_name} (new)"),
        _fact("Website", c.website_url),
        _fact("Registration number", c.registration_number),
        _fact("Role", c.role_title),
        _fact("Evidence offered", c.evidence_note),
        _fact("Status", c.get_status_display()),
        _fact("Decided by", _name(c.decided_by) if c.decided_by else None),
        _fact("Decided", _when(c.decided_at) if c.decided_at else None),
        _fact("Reason", c.decision_reason),
    ],
    filters=[Filter("status", "Status", [(s.value, s.label) for s in ClaimStatus])],
    apply=_status_filter("status"),
    search=("organisation_name",),
    actions=lambda user, c: ["decide"] if c.status == ClaimStatus.PENDING else [],
    specs={
        "decide": ActionSpec(
            "Decide",
            "Approving gives the claimant authority to post for the organisation and records how it was "
            "verified. You cannot decide your own claim.",
            ClaimDecisionForm,
            _claim_run,
        )
    },
    status_of=lambda c: (c.get_status_display(), CLAIM_TONES.get(c.status, "neutral")),
)

PROFILE_TONES = {
    ProfileState.PENDING: "warning",
    ProfileState.APPROVED: "success",
    ProfileState.REJECTED: "danger",
    ProfileState.WITHDRAWN: "muted",
    ProfileState.SUPERSEDED: "muted",
}
PROFILES = Resource(
    key="profiles",
    label="Employer profiles",
    description="Company profile text becomes public once approved. Check it is plain, accurate and about this organisation.",
    permission=Permission.EMPLOYER_REVIEW,
    queryset=lambda user: ProfileRevision.objects.select_related(
        "profile__organisation", "sector", "submitted_by", "decided_by"
    ).order_by(_pending_first("state", "pending"), "-submitted_at"),
    columns=[
        Column("organisation", "Organisation"),
        Column("version_no", "Revision"),
        Column("state", "State", "badge"),
        Column("submitted_at", "Submitted", "datetime"),
    ],
    row=lambda r: {
        "organisation": r.profile.organisation.name,
        "version_no": str(r.version_no),
        "state": _tone(r.get_state_display(), PROFILE_TONES.get(r.state, "neutral")),
        "submitted_at": _iso(r.submitted_at),
    },
    title=lambda r: f"{r.profile.organisation.name}: profile revision {r.version_no}",
    facts=lambda user, r: [
        _fact("Organisation", r.profile.organisation.name),
        _fact("Tagline", r.tagline),
        _fact("About", r.about),
        _fact("Sector", r.sector.name if r.sector else None),
        _fact("Size", r.size_band),
        _fact("Founded", r.founded_year),
        _fact("Location", r.location_text),
        _fact("State", r.get_state_display()),
        _fact("Decided by", _name(r.decided_by) if r.decided_by else None),
        _fact("Reason", r.decision_reason),
    ],
    filters=[Filter("status", "State", [(s.value, s.label) for s in ProfileState])],
    apply=_status_filter("state"),
    actions=lambda user, r: ["decide"] if r.state == ProfileState.PENDING else [],
    specs={
        "decide": ActionSpec(
            "Review",
            "Profile text is public once approved. Check it is plain, accurate and about this organisation.",
            ProfileDecisionForm,
            _profile_run,
        )
    },
    status_of=lambda r: (r.get_state_display(), PROFILE_TONES.get(r.state, "neutral")),
)


def _revoke_verification(user: User, obj: OrganisationVerification, data: dict[str, Any]) -> None:
    employer_services.revoke_verification(user, obj.organisation_id, reason=data["reason"])


def _revoke_membership(user: User, obj: EmployerMembership, data: dict[str, Any]) -> None:
    employer_services.revoke_membership(user, obj.pk, reason=data["reason"])


VERIFICATIONS = Resource(
    key="verifications",
    label="Organisation verifications",
    description="How and by whom an organisation was verified. Only Administrators can revoke.",
    permission=Permission.EMPLOYER_REVIEW,
    queryset=lambda user: OrganisationVerification.objects.select_related(
        "organisation", "verified_by"
    ).order_by("-verified_at"),
    columns=[
        Column("organisation", "Organisation"),
        Column("method", "Method"),
        Column("verified_by", "Verified by"),
        Column("verified_at", "Verified", "datetime"),
        Column("state", "State", "badge"),
    ],
    row=lambda v: {
        "organisation": v.organisation.name,
        "method": v.get_method_display(),
        "verified_by": _name(v.verified_by),
        "verified_at": _iso(v.verified_at),
        "state": _tone("Revoked", "danger") if v.revoked_at else _tone("Active", "success"),
    },
    title=lambda v: v.organisation.name,
    facts=lambda user, v: [
        _fact("Organisation", v.organisation.name),
        _fact("Method", v.get_method_display()),
        _fact("Evidence", v.evidence_note),
        _fact("Verified by", _name(v.verified_by)),
        _fact("Verified", _when(v.verified_at)),
        _fact("Revoked", _when(v.revoked_at) if v.revoked_at else None),
        _fact("Revoked reason", v.revoked_reason),
    ],
    actions=lambda user, v: ["revoke"] if v.revoked_at is None else [],
    specs={
        "revoke": ActionSpec(
            "Revoke verification",
            "Only Administrators can revoke (others are refused and the attempt is audited). Members can no "
            "longer submit listings or profile changes and the public profile is hidden. Published listings "
            "are not changed; take those down separately if needed.",
            RevokeForm,
            _revoke_verification,
        )
    },
)

MEMBERSHIPS = Resource(
    key="memberships",
    label="Employer members",
    description="People who may act for an organisation.",
    permission=Permission.EMPLOYER_REVIEW,
    queryset=lambda user: EmployerMembership.objects.select_related("user", "organisation").order_by(
        "-granted_at"
    ),
    columns=[
        Column("member", "Member"),
        Column("organisation", "Organisation"),
        Column("role", "Role"),
        Column("granted_at", "Granted", "datetime"),
        Column("state", "State", "badge"),
    ],
    row=lambda m: {
        "member": f"{m.user.display_name} <{m.user.email}>",
        "organisation": m.organisation.name,
        "role": m.role,
        "granted_at": _iso(m.granted_at),
        "state": _tone("Revoked", "danger") if m.revoked_at else _tone("Active", "success"),
    },
    title=lambda m: f"{m.user.display_name} at {m.organisation.name}",
    facts=lambda user, m: [
        _fact("Member", f"{m.user.display_name} <{m.user.email}>"),
        _fact("Organisation", m.organisation.name),
        _fact("Role", m.role),
        _fact("Granted", _when(m.granted_at)),
        _fact("Revoked", _when(m.revoked_at) if m.revoked_at else None),
        _fact("Revoked reason", m.revoked_reason),
    ],
    actions=lambda user, m: ["revoke"] if m.revoked_at is None else [],
    specs={
        "revoke": ActionSpec(
            "Revoke membership",
            "The person immediately loses authority to act for the organisation.",
            RevokeForm,
            _revoke_membership,
        )
    },
)


# --- public reports --------------------------------------------------------------------------------------------
REPORT_TONES = {
    ReportStatus.OPEN: "warning",
    ReportStatus.INVESTIGATING: "info",
    ReportStatus.ESCALATED: "danger",
    ReportStatus.RESOLVED: "success",
    ReportStatus.DISMISSED: "muted",
}


def _reports_qs(user: User) -> QuerySet[ListingReport]:
    rank = Case(
        When(status=ReportStatus.ESCALATED, then=Value(0)),
        When(status=ReportStatus.OPEN, then=Value(1)),
        When(status=ReportStatus.INVESTIGATING, then=Value(2)),
        default=Value(3),
        output_field=IntegerField(),
    )
    return (
        ListingReport.objects.select_related("opportunity", "live_version", "assigned_to", "closed_by")
        .annotate(_rank=rank)
        .order_by("_rank", "created_at")
    )


def _reports_apply(qs: QuerySet[Any], user: User, params: QueryDict) -> QuerySet[Any]:
    queue = params.get("queue", "")
    if queue == "new":
        qs = qs.filter(status=ReportStatus.OPEN)
    elif queue == "mine":
        qs = qs.filter(assigned_to=user, status__in=OPEN_STATUSES)
    elif queue == "escalated":
        qs = qs.filter(status=ReportStatus.ESCALATED)
    elif queue == "open":
        qs = qs.filter(status__in=OPEN_STATUSES)
    elif queue == "closed":
        qs = qs.filter(status__in=CLOSED_STATUSES)
    if params.get("status"):
        qs = qs.filter(status=params["status"])
    if params.get("reason"):
        qs = qs.filter(reason=params["reason"])
    if params.get("repeat") == "yes":
        busy = (
            ListingReport.objects.filter(status__in=OPEN_STATUSES)
            .values("opportunity")
            .annotate(n=Count("id"))
            .filter(n__gt=1)
            .values("opportunity")
        )
        qs = qs.filter(opportunity__in=busy, status__in=OPEN_STATUSES)
    return qs


def _report_listing_title(r: ListingReport) -> str:
    return (r.live_version.title if r.live_version else r.opportunity.slug or "(no title)")[:70]


def _report_sections(user: User, r: ListingReport) -> list[dict[str, Any]]:
    others = (
        ListingReport.objects.filter(opportunity=r.opportunity)
        .exclude(pk=r.pk)
        .order_by("-created_at")
        .values("pk", "reference", "reason", "status", "created_at")[:20]
    )
    events = r.events.select_related("actor").all()
    out: list[dict[str, Any]] = []
    if others:
        out.append(
            {
                "title": "Other reports on this listing",
                "headers": ["Reference", "Reason", "Status", "Received"],
                "rows": [
                    {
                        "href": f"/workspace/records/reports/{o['pk']}",
                        "cells": [o["reference"], o["reason"], o["status"], _when(o["created_at"])],
                    }
                    for o in others
                ],
            }
        )
    out.append(
        {
            "title": "History",
            "headers": ["When", "Step", "By", "Status", "Note"],
            "rows": [
                {
                    "cells": [
                        _when(e.created_at),
                        e.get_action_display(),
                        _name(e.actor) if e.actor else "Reporter",
                        (f"{e.from_status} to " if e.from_status else "") + (e.to_status or "-"),
                        e.note or "-",
                    ]
                }
                for e in events
            ],
        }
    )
    return out


def _report_facts(user: User, r: ListingReport) -> list[dict[str, str]]:
    evidence = r.evidence_url if (r.evidence_url or "").startswith("https://") else None
    opp = r.opportunity
    return [
        _fact("Reason", r.get_reason_display()),
        _fact("Details (reporter's words)", r.details),
        _fact("Evidence link (not checked by us)", evidence),
        _fact(
            "Reporter contact",
            f"{r.contact_email} (removed after the report has been closed for a while)"
            if r.contact_email
            else "none given",
        ),
        _fact(
            "Received",
            _when(r.created_at)
            + (f" - repeated {r.duplicate_count} times by the same reporter" if r.duplicate_count else ""),
        ),
        _fact("Assigned to", _name(r.assigned_to) if r.assigned_to else None),
        _fact("Outcome", f"{r.get_resolution_display()} - {_when(r.closed_at)}" if r.closed_at else None),
        _fact("Listing title when reported", r.live_version.title if r.live_version else None),
        _fact("Listing status now", opp.get_status_display()),
        _fact("Public page", f"/opportunities/{opp.slug}" if opp.slug else None),
    ]


def _report_run(name: str) -> Callable[[User, Any, dict[str, Any]], None]:
    chosen = REPORT_ACTIONS[name]

    def run(user: User, obj: ListingReport, data: dict[str, Any]) -> None:
        chosen.run(user, obj, data)

    return run


REPORTS = Resource(
    key="reports",
    label="Public reports",
    description="Concerns raised by the public. A report never changes a listing by itself; treat the text and link as unverified.",
    permission=Permission.REPORT_READ,
    queryset=_reports_qs,
    columns=[
        Column("reference", "Reference"),
        Column("listing", "Listing"),
        Column("reason", "Reason"),
        Column("status", "Status", "badge"),
        Column("repeats", "Repeats"),
        Column("assignee", "Assigned to"),
        Column("created_at", "Received", "datetime"),
    ],
    row=lambda r: {
        "reference": r.reference,
        "listing": _report_listing_title(r),
        "reason": r.get_reason_display(),
        "status": _tone(r.get_status_display(), REPORT_TONES.get(r.status, "neutral")),
        "repeats": str(r.duplicate_count),
        "assignee": _name(r.assigned_to) if r.assigned_to else "-",
        "created_at": _iso(r.created_at),
    },
    title=lambda r: f"Report {r.reference}",
    facts=_report_facts,
    filters=[
        Filter(
            "queue",
            "Work queue",
            [
                ("new", "New (not yet taken)"),
                ("mine", "Assigned to me"),
                ("escalated", "Escalated"),
                ("open", "All open"),
                ("closed", "Closed"),
            ],
        ),
        Filter("status", "Status", [(s.value, s.label) for s in ReportStatus]),
        Filter("repeat", "Same listing", [("yes", "Listing has several open reports")]),
    ],
    apply=_reports_apply,
    search=("reference", "opportunity__slug", "live_version__title", "details"),
    sections=_report_sections,
    actions=lambda user, r: report_actions(user, r),
    specs={
        name: ActionSpec(a.label, a.label, a.form, _report_run(name)) for name, a in REPORT_ACTIONS.items()
    },
    row_version=True,
    status_of=lambda r: (r.get_status_display(), REPORT_TONES.get(r.status, "neutral")),
    notice=lambda user, r: (
        "You authored, submitted or created this listing, so you can add notes and escalate, but you cannot "
        "decide this report (separation of duties)."
        if moderation.is_participant(user, r.opportunity)
        else None
    ),
)


# --- outgoing e-mail, delivery proof ---------------------------------------------------------------------------
def mask(address: str) -> str:
    local, _, domain = address.partition("@")
    return f"{local[:1]}***@{domain[:1]}***" if domain else "***"


class RetryForm(forms.Form):
    """No input: the confirmation is the click."""


def _retry(user: User, obj: EmailOutbox, data: dict[str, Any]) -> None:
    if obj.status not in (OutboxStatus.FAILED, OutboxStatus.DEAD):
        raise WorkflowError("invalid_transition", "Only failed or dead messages can be retried.")
    retry(obj)
    audit.record(
        action="outbox.retry",
        object_type="email_outbox",
        object_id=obj.pk,
        actor_id=user.pk,
        severity=Severity.PRIVILEGED,
    )


OUTBOX_TONES = {OutboxStatus.SENT: "success", OutboxStatus.FAILED: "danger", OutboxStatus.DEAD: "danger"}
OUTBOX = Resource(
    key="outbox",
    label="Outgoing e-mail",
    description="Status, attempts and errors of queued messages. Addresses are masked.",
    permission=Permission.SETTINGS_MANAGE,
    queryset=lambda user: EmailOutbox.objects.order_by("-created_at"),
    columns=[
        Column("created_at", "Created", "datetime"),
        Column("kind", "Kind"),
        Column("status", "Status", "badge"),
        Column("attempts", "Attempts"),
        Column("address", "Address"),
        Column("last_error", "Last error"),
    ],
    row=lambda m: {
        "created_at": _iso(m.created_at),
        "kind": m.kind,
        "status": _tone(m.get_status_display(), OUTBOX_TONES.get(m.status, "neutral")),
        "attempts": str(m.attempts),
        "address": mask(m.to_address),
        "last_error": m.last_error or "-",
    },
    title=lambda m: f"{m.kind} message",
    facts=lambda user, m: [
        _fact("Kind", m.kind),
        _fact("Status", m.get_status_display()),
        _fact("Attempts", m.attempts),
        _fact("Address", mask(m.to_address)),
        _fact("Last error", m.last_error),
        _fact("Created", _when(m.created_at)),
        _fact("Sent", _when(m.sent_at) if m.sent_at else None),
        _fact("Next attempt", _when(m.next_attempt_at)),
    ],
    filters=[
        Filter("status", "Status", [(s.value, s.label) for s in OutboxStatus]),
    ],
    apply=_status_filter("status"),
    actions=lambda user, m: ["retry"] if m.status in (OutboxStatus.FAILED, OutboxStatus.DEAD) else [],
    specs={"retry": ActionSpec("Retry", "Queue this failed or dead message again.", RetryForm, _retry)},
)

DELIVERY = Resource(
    key="delivery",
    label="E-mail delivery proof",
    description="Records written only by `record_email_verification` after a real test send (P5-07).",
    permission=Permission.SETTINGS_MANAGE,
    queryset=lambda user: EmailDeliveryVerification.objects.order_by("-verified_at"),
    columns=[
        Column("verified_at", "Verified", "datetime"),
        Column("provider", "Provider"),
        Column("mailboxes", "Mailboxes"),
        Column("operator", "Operator"),
        Column("live", "Matches the live sender configuration", "badge"),
    ],
    row=lambda v: {
        "verified_at": _iso(v.verified_at),
        "provider": v.provider,
        "mailboxes": ", ".join(v.mailboxes) or "-",
        "operator": v.operator,
        "live": _tone("Yes", "success") if v.config_hash == config_hash() else _tone("No", "muted"),
    },
    title=lambda v: f"{v.provider} verified {v.verified_at:%Y-%m-%d}",
    facts=lambda user, v: [
        _fact("Provider", v.provider),
        _fact("Verified", _when(v.verified_at)),
        _fact("Mailboxes", ", ".join(v.mailboxes)),
        _fact("SPF", "yes" if v.spf_ok else "no"),
        _fact("DKIM", "yes" if v.dkim_ok else "no"),
        _fact("DMARC", "yes" if v.dmarc_ok else "no"),
        _fact("Operator", v.operator),
        _fact("Note", v.note),
        _fact("Matches the live sender configuration", "yes" if v.config_hash == config_hash() else "no"),
    ],
)


# --- people and audit ------------------------------------------------------------------------------------------
USERS = Resource(
    key="users",
    label="Users",
    description="Accounts, read only. Roles are granted from the server (`manage_staff_role`), never from a screen.",
    permission=Permission.USER_ROLE_GRANT,
    queryset=lambda user: User.objects.order_by("-created_at"),
    columns=[
        Column("name", "Name"),
        Column("status", "Status", "badge"),
        Column("verified", "E-mail confirmed", "datetime"),
        Column("created_at", "Created", "datetime"),
    ],
    row=lambda u: {
        "name": u.display_name,  # no e-mail address in lists
        "status": _tone(
            u.status.replace("_", " ").capitalize(), "success" if u.status == "active" else "muted"
        ),
        "verified": _iso(u.email_verified_at),
        "created_at": _iso(u.created_at),
    },
    title=lambda u: u.display_name,
    facts=lambda user, u: [
        _fact("Name", u.display_name),
        _fact("E-mail", u.email),
        _fact("Status", u.status),
        _fact("E-mail confirmed", _when(u.email_verified_at) if u.email_verified_at else "not yet"),
        _fact("Roles", ", ".join(sorted(u.active_roles())) or "none"),
        _fact("Created", _when(u.created_at)),
        _fact("Last sign-in", _when(u.last_login) if u.last_login else None),
    ],
    filters=[
        Filter("status", "Status", [("active", "Active"), ("pending_verification", "Pending verification")])
    ],
    apply=_status_filter("status"),
    search=("display_name", "email"),
)

ROLES = Resource(
    key="roles",
    label="Staff roles",
    description="Role assignments (revoked, never deleted). Changed from the server with `manage_staff_role`.",
    permission=Permission.USER_ROLE_GRANT,
    queryset=lambda user: StaffRoleAssignment.objects.select_related("user", "granted_by").order_by(
        "-granted_at"
    ),
    columns=[
        Column("name", "Person"),
        Column("role", "Role"),
        Column("granted_at", "Granted", "datetime"),
        Column("state", "State", "badge"),
    ],
    row=lambda a: {
        "name": a.user.display_name,
        "role": a.role,
        "granted_at": _iso(a.granted_at),
        "state": _tone("Revoked", "muted") if a.revoked_at else _tone("Active", "success"),
    },
    title=lambda a: f"{a.user.display_name}: {a.role}",
    facts=lambda user, a: [
        _fact("Person", a.user.display_name),
        _fact("Role", a.role),
        _fact("Granted by", _name(a.granted_by) if a.granted_by else "server"),
        _fact("Granted", _when(a.granted_at)),
        _fact("Reason", a.reason),
        _fact("Revoked", _when(a.revoked_at) if a.revoked_at else None),
    ],
    filters=[
        Filter(
            "role",
            "Role",
            [("contributor", "Contributor"), ("editor", "Editor"), ("administrator", "Administrator")],
        )
    ],
    apply=lambda qs, user, params: qs.filter(role=params["role"]) if params.get("role") else qs,
)


def _audit_apply(qs: QuerySet[Any], user: User, params: QueryDict) -> QuerySet[Any]:
    if params.get("severity"):
        qs = qs.filter(severity=params["severity"])
    if params.get("action"):
        qs = qs.filter(action__startswith=params["action"][:64])
    if params.get("object_type"):
        qs = qs.filter(object_type=params["object_type"][:48])
    term = params.get("q", "").strip()[:64]
    if term:
        match = Q(request_id=term)
        try:
            ref = uuid.UUID(term)
            match |= Q(object_id=ref) | Q(actor_ref=ref)
        except ValueError:
            pass
        qs = qs.filter(match)
    return qs


AUDIT = Resource(
    key="audit",
    label="Audit log",
    description="Every privileged and security-relevant event, append only. Search by object id, actor id or request id.",
    permission=Permission.AUDIT_READ_ALL,
    queryset=lambda user: AuditEvent.objects.order_by("-id"),
    columns=[
        Column("occurred_at", "When", "datetime"),
        Column("severity", "Severity", "badge"),
        Column("action", "Action"),
        Column("object_type", "Object"),
        Column("object_id", "Object id"),
        Column("actor_ref", "Actor id"),
    ],
    row=lambda e: {
        "occurred_at": _iso(e.occurred_at),
        "severity": _tone(
            e.severity, {"security": "danger", "privileged": "warning"}.get(e.severity, "neutral")
        ),
        "action": e.action,
        "object_type": e.object_type,
        "object_id": str(e.object_id) if e.object_id else "-",
        "actor_ref": str(e.actor_ref) if e.actor_ref else "-",
    },
    title=lambda e: f"{e.action} #{e.pk}",
    facts=lambda user, e: [
        _fact("When", _when(e.occurred_at)),
        _fact("Severity", e.severity),
        _fact("Action", e.action),
        _fact("Object", f"{e.object_type} {e.object_id or ''}".strip()),
        _fact("Actor", f"{e.actor_type} {e.actor_ref or ''}".strip()),
        _fact("Request", e.request_id),
        _fact("Changes", e.changes),
    ],
    filters=[
        Filter(
            "severity", "Severity", [("info", "Info"), ("privileged", "Privileged"), ("security", "Security")]
        )
    ],
    apply=_audit_apply,
    search=("object id, actor id or request id",),
)

RESOURCES: dict[str, Resource] = {
    r.key: r
    for r in (CLAIMS, PROFILES, VERIFICATIONS, MEMBERSHIPS, REPORTS, OUTBOX, DELIVERY, USERS, ROLES, AUDIT)
}


def visible(user: User) -> list[Resource]:
    return [r for r in RESOURCES.values() if user.has_permission_code(r.permission)]


def _resource_for(user: User, key: str) -> Resource | None:
    res = RESOURCES.get(key)
    return res if res is not None and user.has_permission_code(res.permission) else None


def _find(res: Resource | None, user: User, record_id: str) -> Any | None:
    if res is None:
        return None
    try:
        return res.queryset(user).filter(pk=record_id).first()
    except ValueError, ValidationError:
        return None


def _search(res: Resource, qs: QuerySet[Any], term: str) -> QuerySet[Any]:
    if not term or not res.search or res.key == "audit":
        return qs
    match = Q()
    for fld in res.search:
        match |= Q(**{f"{fld}__icontains": term})
    return qs.filter(match)


# --- views -----------------------------------------------------------------------------------------------------
class RecordsIndexView(StaffView):
    @extend_schema(
        operation_id="listStaffRecordKinds",
        tags=["staff"],
        responses=OpenApiResponse(description="The registers this person may read"),
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        return Response(
            {"data": [{"key": r.key, "label": r.label, "description": r.description} for r in visible(user)]}
        )


class RecordListView(StaffView):
    @extend_schema(
        operation_id="listStaffRecords",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Rows with columns, filters and paging"), 404: None},
    )
    def get(self, request: Request, kind: str) -> Response:
        user = self.user_of(request)
        res = _resource_for(user, kind)
        if res is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        params = request.query_params
        qs = res.apply(res.queryset(user), user, params)
        qs = _search(res, qs, params.get("q", "").strip()[:80])
        items, page = _paginate(request, qs)
        return Response(
            {
                "resource": {"key": res.key, "label": res.label, "description": res.description},
                "columns": [{"key": c.key, "label": c.label, "kind": c.kind} for c in res.columns],
                "filters": [
                    {
                        "name": f.name,
                        "label": f.label,
                        "choices": [{"value": v, "label": lbl} for v, lbl in f.choices],
                    }
                    for f in res.filters
                ],
                "searchable": bool(res.search),
                "data": [{"id": str(o.pk), "cells": res.row(o), "href_kind": res.key} for o in items],
                "page": {**page, "page_size": page.get("page_size", PAGE_SIZE)},
            }
        )


def _detail(user: User, res: Resource, obj: Any) -> dict[str, Any]:
    actions = []
    for name in res.actions(user, obj):
        spec = res.specs.get(name)
        if spec is None:
            continue
        actions.append(
            {
                "name": name,
                "label": spec.label,
                "description": spec.description,
                "fields": _form_fields(spec.form),
            }
        )
    return {
        "resource": {"key": res.key, "label": res.label},
        "id": str(obj.pk),
        "title": res.title(obj),
        "status": (
            {"label": res.status_of(obj)[0], "tone": res.status_of(obj)[1]} if res.status_of else None
        ),
        "facts": res.facts(user, obj),
        "sections": res.sections(user, obj) if res.sections else [],
        "notice": res.notice(user, obj) if res.notice else None,
        "row_version": getattr(obj, "row_version", None) if res.row_version else None,
        "actions": actions,
    }


class RecordDetailView(StaffView):
    @extend_schema(
        operation_id="getStaffRecord",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Facts, sections and permitted actions"), 404: None},
    )
    def get(self, request: Request, kind: str, record_id: str) -> Response:
        user = self.user_of(request)
        res = _resource_for(user, kind)
        obj = _find(res, user, record_id)
        if res is None or obj is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        return Response(_detail(user, res, obj))


class RecordActionView(StaffView):
    @extend_schema(
        operation_id="runStaffRecordAction",
        tags=["staff"],
        request=None,
        responses={
            200: OpenApiResponse(description="The record after the action"),
            400: None,
            403: None,
            404: None,
            409: None,
        },
    )
    def post(self, request: Request, kind: str, record_id: str, action: str) -> Response:
        user = self.user_of(request)
        res = _resource_for(user, kind)
        obj = _find(res, user, record_id)
        spec = res.specs.get(action) if res else None
        if res is None or obj is None or spec is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        if action not in res.actions(user, obj):
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
        cleaned = form.cleaned_data
        if res.row_version and cleaned.get("row_version") != getattr(obj, "row_version", None):
            return error_response(
                "state_conflict", "This record changed while the page was open; review it and try again.", 409
            )
        try:
            spec.run(user, obj, cleaned)
        except WorkflowError as exc:
            return _refused(exc)
        fresh = _find(res, user, record_id)
        if fresh is None:
            return Response({"id": record_id, "resource": {"key": res.key, "label": res.label}, "done": True})
        return Response(_detail(user, res, cast(Any, fresh)))
