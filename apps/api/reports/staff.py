"""Moderation actions for public reports in the staff workspace: the forms, the action table that posts to
`reports.moderation` (which holds the rules, the separation of duties and the audit) and what a person may be
offered. Nothing here writes state."""

from __future__ import annotations

from typing import Any

from django import forms

from access.registry import Permission
from accounts.models import User

from . import moderation
from .models import (
    CLOSED_STATUSES,
    DISMISSAL_REASONS,
    OPEN_STATUSES,
    ListingReport,
    ReportStatus,
    Resolution,
)

NOTE_HELP = (
    f"{moderation.NOTE_MIN} to {moderation.NOTE_MAX} characters. Plain text. Kept in the report history."
)


class _Base(forms.Form):
    row_version = forms.IntegerField(widget=forms.HiddenInput)


def _note(label: str = "Note", required: bool = True) -> forms.CharField:
    return forms.CharField(
        label=label,
        required=required,
        max_length=moderation.NOTE_MAX,
        widget=forms.Textarea(attrs={"rows": 3}),
        help_text=NOTE_HELP,
    )


class InvestigateForm(_Base):
    pass


class NoteForm(_Base):
    note = _note("Investigation note")


class EscalateForm(_Base):
    note = _note("Why this needs an Administrator")


class ResolveForm(_Base):
    resolution = forms.ChoiceField(
        label="Outcome",
        choices=[
            (Resolution.LISTING_CORRECTED, "The listing was corrected (through its own editing workflow)"),
            (Resolution.NO_ACTION_NEEDED, "Checked; no action needed"),
        ],
    )
    note = _note("What you found")


class DismissForm(_Base):
    resolution = forms.ChoiceField(label="Reason", choices=[(r.value, r.label) for r in DISMISSAL_REASONS])
    note = _note("Why it is dismissed")


class ReopenForm(_Base):
    note = _note("Why it is reopened")


class ListingActionForm(_Base):
    action = forms.ChoiceField(
        label="Action on the listing",
        choices=[
            ("expire", "Mark as expired (closed, still visible with its history)"),
            ("withdraw", "Withdraw (the issuer or staff closed it)"),
            ("takedown", "Take down (removed from public view and archived)"),
        ],
        widget=forms.RadioSelect,
    )
    reason_code = forms.ChoiceField(
        label="Take-down reason",
        required=False,
        choices=[("fraud", "Fraud or scam"), ("legal", "Legal"), ("error", "Error"), ("other", "Other")],
        initial="fraud",
        help_text="Used only for a take-down.",
    )
    reason = _note("Reason (recorded on the listing's history and the report)")

    def clean(self) -> dict[str, Any]:
        data: dict[str, Any] = super().clean() or {}
        if data.get("action") == "takedown" and not data.get("reason_code"):
            self.add_error("reason_code", "Choose a reason for the take-down.")
        return data


class _Action:
    def __init__(self, label: str, form: type[forms.Form], run: Any, button: str) -> None:
        self.label, self.form, self.run, self.button = label, form, run, button


def _run_investigate(user: User, report: ListingReport, d: dict[str, Any]) -> None:
    moderation.investigate(user, report.pk, expected_row_version=d["row_version"])


def _run_note(user: User, report: ListingReport, d: dict[str, Any]) -> None:
    moderation.add_note(user, report.pk, expected_row_version=d["row_version"], note=d["note"])


def _run_escalate(user: User, report: ListingReport, d: dict[str, Any]) -> None:
    moderation.escalate(user, report.pk, expected_row_version=d["row_version"], note=d["note"])


def _run_resolve(user: User, report: ListingReport, d: dict[str, Any]) -> None:
    moderation.resolve(
        user, report.pk, expected_row_version=d["row_version"], resolution=d["resolution"], note=d["note"]
    )


def _run_dismiss(user: User, report: ListingReport, d: dict[str, Any]) -> None:
    moderation.dismiss(
        user, report.pk, expected_row_version=d["row_version"], resolution=d["resolution"], note=d["note"]
    )


def _run_reopen(user: User, report: ListingReport, d: dict[str, Any]) -> None:
    moderation.reopen(user, report.pk, expected_row_version=d["row_version"], note=d["note"])


def _run_listing(user: User, report: ListingReport, d: dict[str, Any]) -> None:
    moderation.act_on_listing(
        user,
        report.pk,
        expected_row_version=d["row_version"],
        action=d["action"],
        reason=d["reason"],
        reason_code=d.get("reason_code") or "other",
    )


ACTIONS: dict[str, _Action] = {
    "investigate": _Action("Take for investigation", InvestigateForm, _run_investigate, "Take it"),
    "note": _Action("Add investigation note", NoteForm, _run_note, "Add note"),
    "escalate": _Action("Escalate to an Administrator", EscalateForm, _run_escalate, "Escalate"),
    "resolve": _Action("Resolve", ResolveForm, _run_resolve, "Resolve report"),
    "dismiss": _Action("Dismiss", DismissForm, _run_dismiss, "Dismiss report"),
    "listing": _Action("Act on the listing", ListingActionForm, _run_listing, "Act on listing"),
    "reopen": _Action("Reopen", ReopenForm, _run_reopen, "Reopen report"),
}


def available_actions(user: User, report: ListingReport) -> list[str]:
    """What this person may be offered now. The service re-checks everything on submit."""
    names: list[str] = []
    is_open = report.status in OPEN_STATUSES
    triage = user.has_permission_code(Permission.REPORT_TRIAGE)
    if is_open and triage:
        if report.status == ReportStatus.OPEN:
            names.append("investigate")
        names.append("note")
        if report.status != ReportStatus.ESCALATED:
            names.append("escalate")
    decide = (
        is_open
        and user.has_permission_code(Permission.REPORT_RESOLVE)
        and (
            report.status != ReportStatus.ESCALATED
            or user.has_permission_code(Permission.REPORT_RESOLVE_ESCALATED)
        )
        and not moderation.is_participant(user, report.opportunity)
    )
    if decide:
        names += ["resolve", "dismiss", "listing"]
    if report.status in CLOSED_STATUSES and user.has_permission_code(Permission.REPORT_RESOLVE_ESCALATED):
        names.append("reopen")
    return names
