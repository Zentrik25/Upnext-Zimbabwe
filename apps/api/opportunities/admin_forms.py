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


class DirectPublishForm(ActionForm):
    """Publish an own draft of a staff-created listing without a second person's approval (D-46)."""

    duplicate_of = forms.CharField(
        required=False,
        label="Existing listing id",
        help_text="Only if the system reports a possible duplicate and this is a deliberate separate listing.",
    )
    duplicate_reason = forms.CharField(
        required=False, widget=forms.Textarea(attrs={"rows": 3}), max_length=1000, label="Why it is separate"
    )
    applicant_payment_reviewed = forms.BooleanField(
        required=False,
        label="I reviewed the mention of payments by applicants",
        help_text="Required only when the text mentions fees or deposits that applicants must pay.",
    )


class CreateDraftForm(forms.Form):
    category = forms.ModelChoiceField(queryset=Category.objects.none())
    organisation = forms.ModelChoiceField(
        queryset=Organisation.objects.none(),
        required=False,
        help_text="Select an existing organisation, or leave blank and enter a new one below.",
    )
    new_organisation_name = forms.CharField(
        max_length=200,
        required=False,
        label="New organisation name",
        help_text="Manually entered organisations are never marked verified.",
    )
    new_organisation_website = forms.URLField(
        max_length=2048, required=False, label="Organisation website", assume_scheme="https"
    )
    organisation_logo = forms.FileField(
        required=False, help_text="PNG, JPEG or WebP, up to 512 KB. Re-encoded and stripped of metadata."
    )
    title = forms.CharField(max_length=200)

    def clean(self) -> dict[str, Any]:
        data = super().clean() or {}
        if not data.get("organisation") and not (data.get("new_organisation_name") or "").strip():
            raise forms.ValidationError("Select an organisation or enter a new organisation name.")
        if data.get("organisation") and (data.get("new_organisation_name") or "").strip():
            raise forms.ValidationError("Select an existing organisation or enter a new one, not both.")
        upload = data.get("organisation_logo")
        if upload:
            from catalog.logo import LogoError, to_data_uri

            try:
                data["logo_data"] = to_data_uri(upload.read())
            except LogoError as exc:
                self.add_error("organisation_logo", str(exc))
        return data

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = Category.objects.filter(active=True)  # type: ignore[attr-defined]
        self.fields["organisation"].queryset = Organisation.objects.filter(merged_into__isnull=True)  # type: ignore[attr-defined]
