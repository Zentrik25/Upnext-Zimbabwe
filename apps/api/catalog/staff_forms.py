"""Forms for reference data and organisations in the staff workspace. They validate input only; the API view
saves, audits and checks permissions."""

from __future__ import annotations

from typing import Any

from django import forms

from .models import Category, Location, Organisation, Sector, Skill
from .text import normalise_name


class OrganisationForm(forms.ModelForm):  # type: ignore[type-arg]
    class Meta:
        model = Organisation
        fields = ("name", "website_url")

    def clean_name(self) -> str:
        """One record per employer: a second record with the same name hides duplicate listings from the
        duplicate check and splits the employer's listings (found on the live site, 2026-11-16)."""
        name = str(self.cleaned_data["name"]).strip()
        same = Organisation.objects.filter(name_normalized=normalise_name(name), merged_into__isnull=True)
        if self.instance.pk:
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise forms.ValidationError(
                "An organisation with this name already exists. Choose it instead of adding it again.",
                code="duplicate",
            )
        return name


class CategoryForm(forms.ModelForm):  # type: ignore[type-arg]
    """The six categories are fixed (D-01): only the display name, order and active flag change."""

    class Meta:
        model = Category
        fields = ("name", "sort_order", "active")


class LocationForm(forms.ModelForm):  # type: ignore[type-arg]
    class Meta:
        model = Location
        fields = ("name", "kind", "parent", "slug", "active")

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.fields["parent"].queryset = Location.objects.order_by("name")  # type: ignore[attr-defined]


class SectorForm(forms.ModelForm):  # type: ignore[type-arg]
    class Meta:
        model = Sector
        fields = ("name", "slug", "active")


class SkillForm(forms.ModelForm):  # type: ignore[type-arg]
    class Meta:
        model = Skill
        fields = ("name", "status", "active")
