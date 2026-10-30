"""Staff reference data API (`/api/v1/staff/catalog/`, D-49): organisations and the taxonomies (categories,
locations, sectors, skills).

Permissions are the ones the Django Admin used: contributors and editors may create organisations, editors and
administrators may edit them (`org.create`, `org.edit`); only administrators manage taxonomies
(`taxonomy.manage`). Nothing is deleted (taxonomies are deactivated, ERD §1) and every change is audited.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from django import forms
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Model, Q, QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from accounts.models import User
from audit import services as audit
from catalog.models import Category, Location, Organisation, Sector, Skill
from catalog.staff_forms import CategoryForm, LocationForm, OrganisationForm, SectorForm, SkillForm
from opportunities.workflow import refresh_search_vectors_for_organisation

from .employer_views import _body
from .errors import error_response
from .public_views import _iso
from .staff_views import StaffView, _form_fields, _paginate


@dataclass
class Kind:
    key: str
    label: str
    description: str
    model: type[Model]
    form: type[forms.ModelForm]  # type: ignore[type-arg]
    read: Permission
    add: Permission | None
    change: Permission
    columns: list[tuple[str, str]]
    row: Callable[[Any], dict[str, str]]
    search: tuple[str, ...]
    queryset: Callable[[], QuerySet[Any]]
    audit_action: Callable[[bool], str]


def _taxonomy_audit(created: bool) -> str:
    return "taxonomy.change"


KINDS: dict[str, Kind] = {
    k.key: k
    for k in (
        Kind(
            "organisations",
            "Organisations",
            "Issuers of opportunities. Editors and administrators may edit; contributors may add.",
            Organisation,
            OrganisationForm,
            Permission.ORG_CREATE,
            Permission.ORG_CREATE,
            Permission.ORG_EDIT,
            [("name", "Name"), ("website", "Website"), ("created_at", "Added")],
            lambda o: {
                "name": o.name,
                "website": o.website_url or "-",
                "created_at": _iso(o.created_at) or "-",
            },
            ("name",),
            lambda: Organisation.objects.filter(merged_into__isnull=True).order_by("name"),
            lambda created: "organisation.create" if created else "organisation.update",
        ),
        Kind(
            "categories",
            "Categories",
            "The six categories are fixed; only the display name, order and active flag change.",
            Category,
            CategoryForm,
            Permission.TAXONOMY_MANAGE,
            None,
            Permission.TAXONOMY_MANAGE,
            [("code", "Code"), ("name", "Name"), ("sort_order", "Order"), ("active", "Active")],
            lambda c: {
                "code": c.code,
                "name": c.name,
                "sort_order": str(c.sort_order),
                "active": "Yes" if c.active else "No",
            },
            ("name", "code"),
            lambda: Category.objects.order_by("sort_order", "code"),
            _taxonomy_audit,
        ),
        Kind(
            "locations",
            "Locations",
            "Places listings can name. Deactivate rather than delete.",
            Location,
            LocationForm,
            Permission.TAXONOMY_MANAGE,
            Permission.TAXONOMY_MANAGE,
            Permission.TAXONOMY_MANAGE,
            [("name", "Name"), ("kind", "Kind"), ("parent", "Parent"), ("active", "Active")],
            lambda loc: {
                "name": loc.name,
                "kind": loc.kind,
                "parent": loc.parent.name if loc.parent else "-",
                "active": "Yes" if loc.active else "No",
            },
            ("name", "slug"),
            lambda: Location.objects.select_related("parent").order_by("name"),
            _taxonomy_audit,
        ),
        Kind(
            "sectors",
            "Sectors",
            "Industries listings and employer profiles can use.",
            Sector,
            SectorForm,
            Permission.TAXONOMY_MANAGE,
            Permission.TAXONOMY_MANAGE,
            Permission.TAXONOMY_MANAGE,
            [("name", "Name"), ("slug", "Web address"), ("active", "Active")],
            lambda s: {"name": s.name, "slug": s.slug, "active": "Yes" if s.active else "No"},
            ("name", "slug"),
            lambda: Sector.objects.order_by("name"),
            _taxonomy_audit,
        ),
        Kind(
            "skills",
            "Skills",
            "The approved list of skills. New ones are approved here.",
            Skill,
            SkillForm,
            Permission.TAXONOMY_MANAGE,
            Permission.TAXONOMY_MANAGE,
            Permission.TAXONOMY_MANAGE,
            [("name", "Name"), ("status", "Status"), ("active", "Active")],
            lambda s: {"name": s.name, "status": s.status, "active": "Yes" if s.active else "No"},
            ("name",),
            lambda: Skill.objects.order_by("name"),
            _taxonomy_audit,
        ),
    )
}


def _kind(user: User, key: str) -> Kind | None:
    kind = KINDS.get(key)
    return kind if kind is not None and user.has_permission_code(kind.read) else None


def _find(kind: Kind, record_id: str) -> Any | None:
    try:
        return kind.queryset().filter(pk=record_id).first()
    except ValueError, ValidationError:
        return None


def _values(form: forms.ModelForm) -> dict[str, Any]:  # type: ignore[type-arg]
    out: dict[str, Any] = {}
    for name in form.fields:
        value = form.initial.get(name)
        out[name] = "" if value is None else (str(value) if not isinstance(value, bool | int) else value)
    return out


def _schema(kind: Kind, instance: Any | None) -> list[dict[str, Any]]:
    return _form_fields(kind.form)


def _shape(user: User, kind: Kind, obj: Any) -> dict[str, Any]:
    form = kind.form(instance=obj)
    return {
        "kind": {"key": kind.key, "label": kind.label},
        "id": str(obj.pk),
        "title": getattr(obj, "name", str(obj)),
        "values": _values(form),
        "fields": _schema(kind, obj),
        "readonly": {"code": obj.code} if kind.key == "categories" else {},
        "can_edit": user.has_permission_code(kind.change),
        "row_version": getattr(obj, "row_version", None),
    }


class CatalogIndexView(StaffView):
    @extend_schema(
        operation_id="listStaffCatalogKinds",
        tags=["staff"],
        responses=OpenApiResponse(description="Reference data this person may read"),
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        return Response(
            {
                "data": [
                    {
                        "key": k.key,
                        "label": k.label,
                        "description": k.description,
                        "can_add": k.add is not None and user.has_permission_code(k.add),
                    }
                    for k in KINDS.values()
                    if user.has_permission_code(k.read)
                ]
            }
        )


class CatalogListView(StaffView):
    @extend_schema(
        operation_id="listStaffCatalog",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Rows"), 404: None},
    )
    def get(self, request: Request, kind: str) -> Response:
        user = self.user_of(request)
        spec = _kind(user, kind)
        if spec is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        qs = spec.queryset()
        term = request.query_params.get("q", "").strip()[:80]
        if term:
            match = Q()
            for fld in spec.search:
                match |= Q(**{f"{fld}__icontains": term})
            qs = qs.filter(match)
        items, page = _paginate(request, qs)
        return Response(
            {
                "kind": {"key": spec.key, "label": spec.label, "description": spec.description},
                "columns": [{"key": k, "label": lbl} for k, lbl in spec.columns],
                "can_add": spec.add is not None and user.has_permission_code(spec.add),
                "fields": _form_fields(spec.form),
                "data": [{"id": str(o.pk), "cells": spec.row(o)} for o in items],
                "page": page,
            }
        )

    @extend_schema(
        operation_id="createStaffCatalogRecord",
        tags=["staff"],
        request=None,
        responses={201: OpenApiResponse(description="The new record"), 400: None, 403: None, 404: None},
    )
    def post(self, request: Request, kind: str) -> Response:
        user = self.user_of(request)
        spec = _kind(user, kind)
        if spec is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        if spec.add is None or not user.has_permission_code(spec.add):
            return error_response("permission_denied", "You may not add this.", 403)
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        form = spec.form(data)
        if not form.is_valid():
            return _invalid(form)
        with transaction.atomic():
            obj = form.save(commit=False)
            if isinstance(obj, Organisation):
                obj.created_by = user
            obj.save()
            form.save_m2m()
            audit.record(
                action=spec.audit_action(True),
                object_type=obj._meta.model_name or spec.key,
                object_id=obj.pk,
                actor_id=user.pk,
                severity="privileged" if spec.key != "organisations" else "info",
                changes={"fields": sorted(form.changed_data), "created": True},
            )
        return Response(_shape(user, spec, obj), status=status.HTTP_201_CREATED)


def _invalid(form: forms.BaseForm) -> Response:
    fields = {
        name: [{"code": e.get("code", "invalid"), "message": e["message"]} for e in errors]
        for name, errors in form.errors.get_json_data().items()
    }
    return error_response("validation_failed", "The request is invalid.", 400, fields)


class CatalogDetailView(StaffView):
    @extend_schema(
        operation_id="getStaffCatalogRecord",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Values and the form fields"), 404: None},
    )
    def get(self, request: Request, kind: str, record_id: str) -> Response:
        user = self.user_of(request)
        spec = _kind(user, kind)
        obj = _find(spec, record_id) if spec else None
        if spec is None or obj is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        return Response(_shape(user, spec, obj))

    @extend_schema(
        operation_id="updateStaffCatalogRecord",
        tags=["staff"],
        request=None,
        responses={
            200: OpenApiResponse(description="The updated record"),
            400: None,
            403: None,
            404: None,
            409: None,
        },
    )
    def patch(self, request: Request, kind: str, record_id: str) -> Response:
        user = self.user_of(request)
        spec = _kind(user, kind)
        obj = _find(spec, record_id) if spec else None
        if spec is None or obj is None:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        if not user.has_permission_code(spec.change):
            return error_response("permission_denied", "You may not change this.", 403)
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        expected = data.pop("row_version", None)
        if isinstance(obj, Organisation) and expected is not None and expected != obj.row_version:
            return error_response("state_conflict", "This record changed while the page was open.", 409)
        form = spec.form(data, instance=obj)
        if not form.is_valid():
            return _invalid(form)
        with transaction.atomic():
            saved = form.save(commit=False)
            if isinstance(saved, Organisation):
                saved.row_version += 1
            saved.save()
            form.save_m2m()
            audit.record(
                action=spec.audit_action(False),
                object_type=saved._meta.model_name or spec.key,
                object_id=saved.pk,
                actor_id=user.pk,
                severity="privileged" if spec.key != "organisations" else "info",
                changes={"fields": sorted(form.changed_data), "created": False},
            )
            if isinstance(saved, Organisation) and "name" in form.changed_data:
                refresh_search_vectors_for_organisation(saved)
        return Response(_shape(user, spec, saved))


class LookupView(StaffView):
    """Small pickers for reference fields: organisations and locations by name."""

    @extend_schema(
        operation_id="lookupStaffReference",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Up to 20 matches"), 404: None},
    )
    def get(self, request: Request, what: str) -> Response:
        user = self.user_of(request)
        term = request.query_params.get("q", "").strip()[:80]
        if what == "organisations" and user.has_permission_code(Permission.ORG_CREATE):
            qs: QuerySet[Any] = Organisation.objects.filter(merged_into__isnull=True)
        elif what == "locations":
            qs = Location.objects.all()
        else:
            return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)
        if term:
            qs = qs.filter(name__icontains=term)
        return Response({"data": [{"id": str(o.pk), "name": o.name} for o in qs.order_by("name")[:20]]})
