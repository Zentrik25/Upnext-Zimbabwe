"""The staff reference-data API (`/api/v1/staff/catalog/`): the permission rules of the old admin screens, audit,
no deletion, optimistic version for organisations."""

from __future__ import annotations

import pytest

from accounts.models import User
from audit.models import AuditEvent
from catalog.models import Category, Location, Organisation, Sector

from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db

C = f"{S}/catalog"


def test_who_sees_which_reference_data(people: dict[str, User], world: object) -> None:
    def kinds(user: User) -> dict[str, bool]:
        return {k["key"]: k["can_add"] for k in signed_in(user).get(C).json()["data"]}

    assert kinds(people["author"]) == {"organisations": True}  # contributors may add organisations
    assert kinds(people["editor"]) == {"organisations": True}
    assert kinds(people["admin"]) == {
        "organisations": True,
        "categories": False,  # the six categories are fixed
        "locations": True,
        "sectors": True,
        "skills": True,
    }
    assert signed_in(people["author"]).get(f"{C}/sectors").status_code == 404
    assert signed_in(people["seeker"]).get(C).status_code == 403


def test_organisations_are_added_by_contributors_and_edited_by_editors_only(
    people: dict[str, User], world: object
) -> None:
    author = signed_in(people["author"])
    created = send(
        author,
        "post",
        f"{C}/organisations",
        {"name": "Zeta Holdings", "website_url": "https://zeta.example.org"},
    )
    assert created.status_code == 201, created.content
    org_id = created.json()["id"]
    assert Organisation.objects.get(pk=org_id).created_by_id == people["author"].pk
    assert AuditEvent.objects.filter(action="organisation.create", object_id=org_id).exists()
    detail = author.get(f"{C}/organisations/{org_id}").json()
    assert detail["can_edit"] is False and detail["values"]["name"] == "Zeta Holdings"
    hijack = send(author, "patch", f"{C}/organisations/{org_id}", {"name": "Hijack"})
    assert hijack.status_code == 403
    editor = signed_in(people["editor"])
    changed = send(editor, "patch", f"{C}/organisations/{org_id}", {"name": "Zeta Group", "row_version": 0})
    assert changed.status_code == 200 and changed.json()["title"] == "Zeta Group"
    assert changed.json()["row_version"] == 1
    stale = send(editor, "patch", f"{C}/organisations/{org_id}", {"name": "Late", "row_version": 0})
    assert stale.status_code == 409
    bad = send(editor, "patch", f"{C}/organisations/{org_id}", {"name": "", "row_version": 1})
    assert bad.status_code == 400 and "name" in bad.json()["error"]["fields"]
    assert AuditEvent.objects.filter(action="organisation.update", object_id=org_id).exists()
    found = editor.get(f"{C}/organisations?q=zeta").json()
    assert [r["cells"]["name"] for r in found["data"]] == ["Zeta Group"]
    assert editor.get(f"{C}/organisations/not-a-uuid").status_code == 404


def test_taxonomies_are_managed_by_administrators_and_audited(people: dict[str, User], world: object) -> None:
    admin = signed_in(people["admin"])
    made = send(admin, "post", f"{C}/sectors", {"name": "Mining", "slug": "mining-x", "active": True})
    assert made.status_code == 201, made.content
    sector = Sector.objects.get(slug="mining-x")
    assert AuditEvent.objects.filter(action="taxonomy.change", object_id=sector.pk).exists()
    dup = send(admin, "post", f"{C}/sectors", {"name": "Mining again", "slug": "mining-x"})
    assert dup.status_code == 400 and "slug" in dup.json()["error"]["fields"]
    off = send(
        admin, "patch", f"{C}/sectors/{sector.pk}", {"name": "Mining", "slug": "mining-x", "active": False}
    )
    assert off.status_code == 200
    sector.refresh_from_db()
    assert sector.active is False  # deactivated, never deleted
    parent = Location.objects.filter(kind="country").first()
    assert parent is not None
    place = send(
        admin,
        "post",
        f"{C}/locations",
        {"name": "Test Town", "kind": "city", "parent": str(parent.pk), "slug": "test-town", "active": True},
    )
    assert place.status_code == 201, place.content
    assert place.json()["fields"][2]["kind"] == "reference"
    assert (
        send(admin, "post", f"{C}/categories", {"name": "x"}).status_code == 403
    )  # categories cannot be added
    cat = Category.objects.get(code="jobs")
    renamed = send(
        admin,
        "patch",
        f"{C}/categories/{cat.pk}",
        {"name": "Jobs and vacancies", "sort_order": cat.sort_order, "active": True},
    )
    assert renamed.status_code == 200 and renamed.json()["readonly"] == {"code": "jobs"}
    editor = signed_in(people["editor"])
    assert send(editor, "post", f"{C}/sectors", {"name": "Nope", "slug": "nope"}).status_code == 404
    assert editor.get(f"{S}/lookup/locations?q=har").status_code == 200
    assert signed_in(people["author"]).get(f"{S}/lookup/organisations?q=a").status_code == 200
    assert signed_in(people["seeker"]).get(f"{S}/lookup/organisations").status_code == 403
