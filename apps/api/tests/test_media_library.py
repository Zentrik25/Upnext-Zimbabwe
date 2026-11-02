"""The Media Library (D-62): upload once, reuse across listings, replace or remove without losing the file, search,
permissions, and that earlier uploads were carried into the library."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import User
from opportunities import images, media, workflow
from opportunities.models import MediaAsset, Opportunity
from tests.factories import CHECKLIST, World, new_draft

from .conftest import csrf
from .test_listing_images import picture, upload
from .test_staff_api import S, signed_in

pytestmark = pytest.mark.django_db

MEDIA = f"{S}/media"


def upload_to_library(client: APIClient, data: bytes, name: str = "office.jpg") -> Any:
    file = SimpleUploadedFile(name, data, content_type="image/jpeg")
    return client.post(MEDIA, {"file": file}, format="multipart", HTTP_X_CSRFTOKEN=csrf(client))


def attach(actor: User, opp: Opportunity, **content: Any) -> Opportunity:
    opp.refresh_from_db()
    workflow.save_draft(actor, opp.pk, expected_row_version=opp.row_version, content=content)
    opp.refresh_from_db()
    return opp


def test_an_upload_lands_in_the_library_with_a_thumbnail_and_a_readable_title(
    people: dict[str, User],
) -> None:
    response = upload_to_library(signed_in(people["editor"]), picture("PNG"), name="Delta_Depot-front.png")
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Delta Depot front" and body["original_filename"] == "Delta_Depot-front.png"
    assert body["reused"] is False and body["used_in"] == 0 and body["uploaded_by"]
    asset = MediaAsset.objects.get(name=body["name"])
    assert asset.thumb_name.startswith("listings/thumbs/") and default_storage.exists(asset.thumb_name)
    assert body["thumb"] == asset.thumb_name and (asset.width, asset.height) == (1200, 675)
    assert len(asset.content_hash) == 64


def test_the_same_picture_uploaded_twice_is_one_file(people: dict[str, User]) -> None:
    client = signed_in(people["editor"])
    first = upload_to_library(client, picture(shade=33))
    second = upload_to_library(signed_in(people["admin"]), picture(shade=33), name="again.jpg")
    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["name"] == first.json()["name"] and second.json()["reused"] is True
    assert MediaAsset.objects.filter(name=first.json()["name"]).count() == 1
    assert MediaAsset.objects.count() == 1
    # the older address behaves the same
    legacy = upload(client, picture(shade=33))
    assert legacy.status_code == 200 and legacy.json()["name"] == first.json()["name"]


def test_one_picture_serves_many_listings_and_removing_it_from_one_changes_only_that_one(
    world: World, people: dict[str, User]
) -> None:
    editor = people["editor"]
    asset, _ = media.add(picture(shade=77), uploader=editor, original_filename="shared.jpg")
    jobs = [new_draft(world, editor, "jobs-1", title=f"Shared picture job {n}") for n in range(3)]
    for job in jobs:
        attach(editor, job, featured_image=asset.name, featured_image_alt="Our depot")
    assert media.usage_counts([asset.name]) == {asset.name: 3}
    assert MediaAsset.objects.count() == 1  # selecting an existing picture creates no new file or row
    attach(editor, jobs[0], featured_image=None, featured_image_alt=None)  # remove from one listing
    assert media.usage_counts([asset.name]) == {asset.name: 2}
    assert default_storage.exists(asset.name) and MediaAsset.objects.filter(pk=asset.pk).exists()
    for job in jobs[1:]:
        job.refresh_from_db()
        assert job.pending_version is not None and job.pending_version.featured_image == asset.name
    other, _ = media.add(picture(shade=99), uploader=editor)
    attach(editor, jobs[1], featured_image=other.name)  # replace on another
    assert default_storage.exists(asset.name) and media.usage_counts([asset.name, other.name]) == {
        asset.name: 1,
        other.name: 1,
    }


def test_a_draft_can_only_use_a_picture_that_is_in_the_library(world: World, people: dict[str, User]) -> None:
    editor = people["editor"]
    opp = new_draft(world, editor)
    loose = images.store(images.process(picture(shade=11))[0])  # a file with no library row
    with pytest.raises(Exception) as exc:  # noqa: PT011 - ValidationFailed
        workflow.save_draft(
            editor, opp.pk, expected_row_version=opp.row_version, content={"featured_image": loose}
        )
    assert "featured_image" in exc.value.fields  # type: ignore[attr-defined]


def test_a_published_listing_keeps_its_picture_whatever_happens_to_other_listings(
    world: World, people: dict[str, User]
) -> None:
    editor = people["editor"]
    asset, _ = media.add(picture(shade=55), uploader=editor)
    live = new_draft(world, editor, "jobs-1", title="Live picture job")
    attach(editor, live, featured_image=asset.name)
    live.refresh_from_db()
    workflow.publish_direct(editor, live.pk, expected_row_version=live.row_version, checklist=CHECKLIST)
    draft = new_draft(world, editor, "jobs-1", title="Draft picture job")
    attach(editor, draft, featured_image=asset.name)
    attach(editor, draft, featured_image=None)
    live.refresh_from_db()
    assert live.live_version is not None and live.live_version.featured_image == asset.name
    assert images.exists(asset.name)
    body = APIClient().get(f"/api/v1/opportunities/{live.slug}").json()
    assert body["image"]["featured"].endswith(asset.name)


def test_browse_search_and_paging(people: dict[str, User]) -> None:
    editor = people["editor"]
    for shade, name in enumerate(["Harare depot.jpg", "Bulawayo depot.jpg", "Team photo.jpg"], start=1):
        media.add(picture(shade=shade * 20), uploader=editor, original_filename=name)
    client = signed_in(editor)
    everything = client.get(MEDIA).json()
    assert everything["page"]["total"] == 3 and everything["data"][0]["title"] == "Team photo"  # newest first
    found = client.get(MEDIA, {"q": "depot"}).json()
    assert {a["title"] for a in found["data"]} == {"Harare depot", "Bulawayo depot"}
    assert client.get(MEDIA, {"q": "no such picture"}).json()["data"] == []
    paged = client.get(MEDIA, {"page_size": 2, "page": 2}).json()
    assert len(paged["data"]) == 1 and paged["page"]["pages"] == 2
    assert client.get(MEDIA, {"page": "x", "page_size": "y"}).status_code == 200


def test_usage_is_reported_for_each_picture(world: World, people: dict[str, User]) -> None:
    editor = people["editor"]
    used, _ = media.add(picture(shade=70), uploader=editor, original_filename="used.jpg")
    media.add(picture(shade=80), uploader=editor, original_filename="spare.jpg")
    attach(editor, new_draft(world, editor), featured_image=used.name)
    rows = {a["title"]: a["used_in"] for a in signed_in(editor).get(MEDIA).json()["data"]}
    assert rows == {"used": 1, "spare": 0}


def test_who_can_use_the_library(people: dict[str, User]) -> None:
    assert APIClient().get(MEDIA).status_code in (401, 403)
    assert signed_in(people["seeker"]).get(MEDIA).status_code == 403
    assert upload_to_library(signed_in(people["seeker"]), picture()).status_code == 403
    for who in ("author", "editor", "admin"):
        assert signed_in(people[who]).get(MEDIA).status_code == 200
    # a state-changing request without the CSRF token is refused
    no_csrf = signed_in(people["editor"])
    file = SimpleUploadedFile("a.jpg", picture(), content_type="image/jpeg")
    assert no_csrf.post(MEDIA, {"file": file}, format="multipart").status_code == 403


def test_the_library_validates_every_upload(people: dict[str, User]) -> None:
    client = signed_in(people["editor"])
    assert upload_to_library(client, b"<?php echo 1; ?>").status_code == 400
    assert upload_to_library(client, picture(size=(200, 120))).json()["error"]["code"] == "image_too_small"
    assert upload_to_library(client, b"\xff\xd8\xff" + b"0" * (images.MAX_BYTES + 10)).status_code == 413
    assert client.post(MEDIA, {}, format="multipart", HTTP_X_CSRFTOKEN=csrf(client)).status_code == 400
    assert MediaAsset.objects.count() == 0


def test_a_png_and_a_webp_are_stored_as_optimised_jpeg(people: dict[str, User]) -> None:
    client = signed_in(people["editor"])
    for fmt, shade in (("PNG", 5), ("WEBP", 6), ("JPEG", 7)):
        body = upload_to_library(client, picture(fmt, shade=shade, size=(2400, 1350))).json()
        assert body["name"].endswith(".jpg") and body["width"] == 1600  # scaled down to the output size
        assert body["bytes"] < images.MAX_BYTES


def test_earlier_uploads_are_carried_into_the_library_by_the_migration(
    world: World, people: dict[str, User]
) -> None:
    from importlib import import_module

    from django.apps import apps

    editor = people["editor"]
    name = images.store(images.process(picture(shade=123))[0])  # as stored before the library existed
    opp = new_draft(world, editor)
    version = opp.pending_version
    assert version is not None
    type(version).objects.filter(pk=version.pk).update(featured_image=name)
    assert not MediaAsset.objects.filter(name=name).exists()
    import_module("opportunities.migrations.0011_backfill_verification_and_media").forwards(apps, None)
    asset = MediaAsset.objects.get(name=name)
    assert asset.content_hash and asset.byte_size and images.exists(name)
    import_module("opportunities.migrations.0011_backfill_verification_and_media").forwards(apps, None)
    assert MediaAsset.objects.filter(name=name).count() == 1  # running it again adds nothing
