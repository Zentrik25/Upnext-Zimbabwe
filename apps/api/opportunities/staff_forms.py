"""Forms for the editorial actions in the staff interface. Each posts to the publishing service; none
writes state directly."""

from __future__ import annotations

from typing import Any

from django import forms

from catalog.models import Category, Organisation

from .models import VerificationMethod, VerificationOutcome

LEVELS = [("source_checked", "Source checked"), ("issuer_verified", "Verified with the issuer")]


class ActionForm(forms.Form):
    row_version = forms.IntegerField(widget=forms.HiddenInput)


class ConfirmForm(ActionForm):
    """Actions that need no input beyond confirmation (publish, discard, reopen, amend, archive)."""


class ReasonForm(ActionForm):
    reason = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 4}),
        min_length=10,
        max_length=2000,
        help_text="At least 10 characters.",
    )


class ReasonCodeForm(ReasonForm):
    reason_code = forms.CharField(max_length=40, help_text="A short code, e.g. source_unclear or duplicate.")


class TakedownForm(ReasonForm):
    reason_code = forms.ChoiceField(choices=[(c, c) for c in ("legal", "error", "fraud", "other")])


class ApproveForm(ActionForm):
    source_reviewed = forms.BooleanField(label="I reviewed the cited source")
    duplicates_reviewed = forms.BooleanField(label="I reviewed possible duplicates")
    content_matches_source = forms.BooleanField(label="The content matches the source")
    applicant_payment_reviewed = forms.BooleanField(
        required=False,
        label="I reviewed the mention of payments by applicants",
        help_text="Required only when the text mentions fees or deposits that applicants must pay.",
    )


class PublishDirectForm(ApproveForm):
    duplicate_of = forms.CharField(
        required=False,
        label="Existing listing id",
        help_text="Only if this is a deliberate separate listing.",
    )
    duplicate_reason = forms.CharField(
        required=False, widget=forms.Textarea(attrs={"rows": 3}), max_length=1000, label="Why it is separate"
    )


class SubmitForm(ActionForm):
    duplicate_of = forms.CharField(
        required=False,
        label="Existing listing id",
        help_text="Only if this is a deliberate separate listing.",
    )
    duplicate_reason = forms.CharField(
        required=False, widget=forms.Textarea(attrs={"rows": 3}), max_length=1000, label="Why it is separate"
    )


class VerificationForm(ActionForm):
    version_no = forms.IntegerField(min_value=1, label="Revision number")
    level = forms.ChoiceField(choices=LEVELS)
    method = forms.ChoiceField(choices=VerificationMethod.choices)
    outcome = forms.ChoiceField(choices=VerificationOutcome.choices)
    evidence_note = forms.CharField(widget=forms.Textarea(attrs={"rows": 4}), min_length=20, max_length=2000)


class CreateDraftForm(forms.Form):
    category = forms.ModelChoiceField(queryset=Category.objects.none())
    organisation = forms.ModelChoiceField(queryset=Organisation.objects.none())
    title = forms.CharField(max_length=200)

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = Category.objects.filter(active=True)  # type: ignore[attr-defined]
        self.fields["organisation"].queryset = Organisation.objects.filter(merged_into__isnull=True)  # type: ignore[attr-defined]
