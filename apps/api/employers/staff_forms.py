"""Decision forms for employer review in the staff workspace (claims, company profiles, revocations).
They validate input only; `employers.services` decides and audits."""

from __future__ import annotations

from django import forms

from catalog.models import Organisation

from .models import MemberRole, VerificationMethod


class ClaimDecisionForm(forms.Form):
    decision = forms.ChoiceField(
        choices=[("approve", "Approve"), ("reject", "Reject")], widget=forms.RadioSelect
    )
    reason = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        max_length=2000,
        help_text="Required (10 characters or more) when rejecting.",
    )
    organisation = forms.ModelChoiceField(
        queryset=Organisation.objects.filter(merged_into__isnull=True),
        required=False,
        help_text=(
            "Choose an existing organisation. Leave empty to create a new one with the claimed name "
            "(check for duplicates first)."
        ),
    )
    role = forms.ChoiceField(choices=MemberRole.choices, initial=MemberRole.OWNER, required=False)
    method = forms.ChoiceField(
        choices=[("", "---"), *VerificationMethod.choices],
        required=False,
        help_text="How you verified the organisation. Required when it is not yet verified.",
    )
    evidence_note = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        max_length=2000,
        help_text=(
            "What you saw or did (10 characters or more). Required when it is not yet verified. "
            "Do not paste documents."
        ),
    )


class ProfileDecisionForm(forms.Form):
    decision = forms.ChoiceField(
        choices=[("approve", "Approve"), ("reject", "Reject")], widget=forms.RadioSelect
    )
    reason = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        max_length=2000,
        help_text="Required (10 characters or more) when rejecting. Shown to the employer.",
    )


class RevokeForm(forms.Form):
    reason = forms.CharField(widget=forms.Textarea(attrs={"rows": 3}), min_length=10, max_length=2000)
