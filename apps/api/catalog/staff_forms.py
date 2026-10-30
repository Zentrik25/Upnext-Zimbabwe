"""Forms for reference data and organisations in the staff workspace. They validate input only; the API view
saves, audits and checks permissions."""

from __future__ import annotations

from typing import Any

from django import forms

from .models import Category, Location, Organisation, Sector, Skill


class OrganisationForm(forms.ModelForm):  # type: ignore[type-arg]
    class Meta:
        model = Organisation
        fields = ("name", "website_url")


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
