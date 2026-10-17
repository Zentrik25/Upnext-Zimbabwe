"""Staff interface for reference data (taxonomy.manage; organisations: org.create / org.edit)."""

from __future__ import annotations

from typing import Any

from django.contrib import admin
from django.http import HttpRequest

from access.registry import Permission
from audit import services as audit

from .models import Category, DetailSchema, Location, Organisation, Sector, Skill


def _holds(request: HttpRequest, code: Permission) -> bool:
    user: Any = request.user
    return bool(user.is_authenticated and user.has_permission_code(code))


class TaxonomyAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    """Administrators manage taxonomies; everyone else has no access to the module."""

    def has_module_permission(self, request: HttpRequest) -> bool:
        return _holds(request, Permission.TAXONOMY_MANAGE)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _holds(request, Permission.TAXONOMY_MANAGE)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return _holds(request, Permission.TAXONOMY_MANAGE)

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _holds(request, Permission.TAXONOMY_MANAGE)

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False  # deactivated, never deleted (ERD §1)

    def save_model(self, request: HttpRequest, obj: Any, form: Any, change: bool) -> None:
        super().save_model(request, obj, form, change)
        audit.record(
            action="taxonomy.change",
            object_type=obj._meta.model_name,
            object_id=obj.pk,
            actor_id=request.user.pk,
            severity="privileged",
            changes={"fields": sorted(form.changed_data), "created": not change},
        )


@admin.register(Location)
class LocationAdmin(TaxonomyAdmin):
    list_display = ("name", "kind", "parent", "slug", "active")
    list_filter = ("kind", "active")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Sector)
class SectorAdmin(TaxonomyAdmin):
    list_display = ("name", "slug", "active")
    list_filter = ("active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Skill)
class SkillAdmin(TaxonomyAdmin):
    list_display = ("name", "status", "active")
    list_filter = ("status", "active")
    search_fields = ("name",)


@admin.register(Category)
class CategoryAdmin(TaxonomyAdmin):
    list_display = ("code", "name", "sort_order", "active")
    readonly_fields = ("code", "detail_schema_key")  # category codes are immutable

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False  # the six categories are fixed (D-01)


@admin.register(DetailSchema)
class DetailSchemaAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("category", "version", "status", "activated_at")
    list_filter = ("status",)

    def _ok(self, request: HttpRequest) -> bool:
        return _holds(request, Permission.TAXONOMY_MANAGE)

    def has_module_permission(self, request: HttpRequest) -> bool:
        return self._ok(request)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return self._ok(request)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False  # activated through reviewed schema files, not a UI edit (matrix §2.3)

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    """Contributors and Editors may create organisations; Editors and Administrators may edit them."""

    list_display = ("name", "website_url", "created_by", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_by", "created_at", "merged_into")
    exclude = ("row_version",)

    def has_module_permission(self, request: HttpRequest) -> bool:
        return _holds(request, Permission.ORG_CREATE)

    def has_view_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _holds(request, Permission.ORG_CREATE)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return _holds(request, Permission.ORG_CREATE)

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return _holds(request, Permission.ORG_EDIT)

    def has_delete_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False

    def save_model(self, request: HttpRequest, obj: Organisation, form: Any, change: bool) -> None:
        if not change:
            obj.created_by = request.user  # type: ignore[assignment]
        else:
            obj.row_version += 1
        super().save_model(request, obj, form, change)
        audit.record(
            action="organisation.update" if change else "organisation.create",
            object_type="organisation",
            object_id=obj.pk,
            actor_id=request.user.pk,
            changes={"fields": sorted(form.changed_data)},
        )
        if change and {"name"} & set(form.changed_data):
            from opportunities.workflow import refresh_search_vectors_for_organisation

            refresh_search_vectors_for_organisation(obj)
