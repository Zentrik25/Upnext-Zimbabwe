"""Staff-side rules for listings, shared by the staff API (D-46): who may see which listing, the work queues,
search, the action table that posts to the publishing service, and the words staff see for statuses.

Nothing here writes state directly: every action calls `opportunities.workflow`, which holds the permission and
separation-of-duties rules. Visibility follows the matrix: Contributors see their own work, Editors the review
pipeline (not other people's drafts), Administrators everything (viewing another person's draft is audited).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django import forms
from django.db.models import Q, QuerySet
from django.utils import timezone

from access.registry import Permission
from accounts.models import User

from . import staff_forms, workflow
from .errors import WorkflowError
from .models import ListingStatus, Opportunity, VersionState

STATUS_TONES: dict[str, tuple[str, str]] = {
    ListingStatus.DRAFT: ("Draft", "neutral"),
    ListingStatus.IN_REVIEW: ("In review", "warning"),
    ListingStatus.APPROVED: ("Approved - ready to publish", "info"),
    ListingStatus.REJECTED: ("Rejected", "danger"),
    ListingStatus.PUBLISHED: ("Published", "success"),
    ListingStatus.EXPIRED: ("Expired", "muted"),
    ListingStatus.WITHDRAWN: ("Withdrawn", "muted"),
    ListingStatus.ARCHIVED: ("Archived", "muted"),
}
VERIFICATION_LABELS = {
    "not_verified": "Not verified",
    "source_checked": "Source checked (not confirmed with the issuer)",
    "issuer_verified": "Verified with the issuer",
}


def describe(error: WorkflowError) -> str:
    if error.fields:
        details = "; ".join(f"{path}: {msg}" for path, items in error.fields.items() for _, msg in items)
        return f"{error.message} ({details})"
    return f"{error.message} [{error.code}]"


def awaiting_review(queryset: QuerySet[Opportunity], user: User) -> QuerySet[Opportunity]:
    """Listings in review that `user` did not author or submit (the service re-checks the whole chain).
    Shared by the work-queue filter and the staff dashboard so both count the same thing."""
    return queryset.filter(pending_version__state=VersionState.IN_REVIEW).exclude(
        Q(pending_version__author=user)
        | Q(pending_version__submitted_by=user)
        | Q(pending_version__based_on_version__author=user)
    )


def listings_visible_to(user: User) -> QuerySet[Opportunity]:
    """The listings a staff member may see in the staff site (matrix: drafts are private to their author,
    except for Administrators). One definition for the list, the dashboard and the search box."""
    qs = Opportunity.objects.select_related(
        "category",
        "pending_version__organisation",
        "pending_version__author",
        "pending_version__submitted_by",
        "live_version__organisation",
        "live_version__author",
    )
    if user.has_permission_code(
        Permission.AUDIT_READ_ALL
    ):  # Administrators only (drafts, read-only, audited)
        return qs
    if user.has_permission_code(Permission.OPP_REVIEW_APPROVE):
        hidden_drafts = Q(pending_version__state=VersionState.DRAFT, live_version__isnull=True) & ~Q(
            pending_version__author=user
        )
        return qs.exclude(hidden_drafts)
    return qs.filter(
        Q(created_by=user) | Q(pending_version__author=user) | Q(versions__author=user)
    ).distinct()


def listings_scope(user: User) -> QuerySet[Opportunity]:
    """`listings_visible_to` in a form that is safe to aggregate: a DISTINCT query is wrapped in a subquery."""
    visible = listings_visible_to(user)
    if visible.query.distinct:
        return Opportunity.objects.filter(pk__in=visible.values("pk"))
    return visible


STATUS_TABS = (
    ("", "All"),
    (ListingStatus.DRAFT, "Drafts"),
    (ListingStatus.IN_REVIEW, "In review"),
    (ListingStatus.APPROVED, "Approved"),
    (ListingStatus.PUBLISHED, "Published"),
    (ListingStatus.EXPIRED, "Expired"),
    (ListingStatus.REJECTED, "Rejected"),
)


QUEUES = ("review", "ready", "mine", "amendments")
DEADLINES = ("soon", "past", "unknown")


def apply_queue(
    queryset: QuerySet[Opportunity], user: User, value: str | None
) -> QuerySet[Opportunity] | None:
    """The work queues of the list (also used by the staff API). `None` for an unknown value."""
    open_states = [VersionState.DRAFT, VersionState.IN_REVIEW, VersionState.APPROVED]
    if value == "review":
        return awaiting_review(queryset, user)
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


def apply_deadline(queryset: QuerySet[Opportunity], value: str | None) -> QuerySet[Opportunity] | None:
    now = timezone.now()
    field = "live_version__deadline_at"
    match value:
        case "soon":
            return queryset.filter(**{f"{field}__gt": now, f"{field}__lte": now + timedelta(days=7)})
        case "past":
            return queryset.filter(**{f"{field}__lte": now})
        case "unknown":
            return queryset.filter(live_version__isnull=False, **{f"{field}__isnull": True})
    return None


def search_listings(user: User, queryset: QuerySet[Opportunity], term: str) -> QuerySet[Opportunity]:
    """Listings matching `term` by title, organisation, reference or slug, looking only at revisions the person
    may see: another person's draft revision is never matched (its title would otherwise leak through search)."""
    live = (
        Q(slug__icontains=term)
        | Q(live_version__title__icontains=term)
        | Q(live_version__organisation__name__icontains=term)
        | Q(live_version__reference_number__icontains=term)
    )
    pending = Q(pending_version__title__icontains=term) | Q(
        pending_version__organisation__name__icontains=term
    )
    if not user.has_permission_code(Permission.AUDIT_READ_ALL):
        pending &= ~Q(pending_version__state=VersionState.DRAFT) | Q(pending_version__author=user)
    return queryset.filter(live | pending)


TRANSITION_LABELS = {
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
    "submit": Action("Submit for review", "Freezes this revision and sends it to the review queue. After this it cannot be edited.", staff_forms.SubmitForm, _submit),
    "approve": Action("Approve", "Approve this exact revision. Anyone who wrote or submitted it cannot do this.", staff_forms.ApproveForm, _approve),
    "reject": Action("Reject", "Return the revision to its author with reasons.", staff_forms.ReasonCodeForm, _simple("reject", reason_code="reason_code", reason="reason")),
    "return": Action("Return (withdraw approval)", "Void the approval and send the revision back with reasons.", staff_forms.ReasonCodeForm, _simple("return_approved", reason_code="reason_code", reason="reason")),
    "publish": Action("Publish", "Publish this revision. It must have been approved, unchanged, by another person.", staff_forms.ConfirmForm, _simple("publish")),
    "withdraw": Action("Withdraw", "The issuer withdrew the opportunity. It stays readable, marked withdrawn.", staff_forms.ReasonForm, _simple("withdraw", reason="reason")),
    "expire": Action("Mark as expired", "Close the listing ahead of, or without, its deadline.", staff_forms.ReasonForm, _simple("expire", reason="reason")),
    "archive": Action("Archive", "Housekeeping: archive an expired or withdrawn listing.", staff_forms.ConfirmForm, _simple("archive")),
    "takedown": Action("Take down", "Remove the listing from public view immediately. Keep the record.", staff_forms.TakedownForm, _simple("takedown", reason_code="reason_code", reason="reason")),
    "discard": Action("Discard", "Abandon this draft or rejected revision.", staff_forms.ConfirmForm, _simple("discard")),
    "reopen": Action("Reopen as a new draft", "Start a new draft from the rejected revision.", staff_forms.ConfirmForm, _simple("reopen")),
    "amend": Action("Start an amendment", "Create a new draft from the live revision. The public keeps seeing the live one until the amendment is approved and published.", staff_forms.ConfirmForm, _simple("amend")),
    "verify": Action("Record verification", "Record a check of the content. Verification is separate from the source and from publication.", staff_forms.VerificationForm, _verify),
}  # fmt: skip


def listing_actions(user: User, obj: Opportunity) -> list[tuple[str, str]]:
    """(name, label) for what `user` may attempt on the listing right now: "edit" for their own draft and the
    workflow actions. Advisory only: every action view and every service call re-checks permission and
    separation of duties."""
    names = workflow.allowed_actions(user, obj)
    if user.has_permission_code(Permission.OPP_VERIFY_RECORD) and (obj.pending_version or obj.live_version):
        names.append("verify")
    version = obj.pending_version
    out: list[tuple[str, str]] = []
    if version and version.state == VersionState.DRAFT and version.author_id == user.pk:
        out.append(("edit", "Edit the draft"))
    out += [(name, ACTIONS[name].label) for name in names if name in ACTIONS]
    return out
