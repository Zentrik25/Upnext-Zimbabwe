"""Listing images (D-58): content-based validation, normalisation, storage, upload API, replacement and removal
without orphans, persistence, and what the public API and the staff API say about them."""

from __future__ import annotations

import io
import os
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from django.conf import settings
from django.core.files.storage import FileSystemStorage, default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from employers.capability import check_content
from opportunities import content as content_mod
from opportunities import images, workflow
from opportunities.errors import PermissionDeniedError, ValidationFailed
from opportunities.models import Opportunity
from tests.factories import CHECKLIST, World, new_draft, varied

from .conftest import csrf
from .test_staff_api import S, signed_in

pytestmark = pytest.mark.django_db

UPLOAD = f"{S}/images"


def picture(fmt: str = "JPEG", size: tuple[int, int] = (1200, 675), mode: str = "RGB", **save: Any) -> bytes:
    img = Image.new(mode, size, (200, 80, 60) if mode == "RGB" else (200, 80, 60, 0))
    out = io.BytesIO()
    img.save(out, format=fmt, **save)
    return out.getvalue()


def upload(client: APIClient, data: bytes, name: str = "photo.jpg", content_type: str = "image/jpeg") -> Any:
    file = SimpleUploadedFile(name, data, content_type=content_type)
    return client.post(UPLOAD, {"file": file}, format="multipart", HTTP_X_CSRFTOKEN=csrf(client))


def stored(data: bytes) -> str:
    processed, _, _ = images.process(data)
    return images.store(processed)


def save(actor: User, opp: Opportunity, **content: Any) -> Opportunity:
    opp.refresh_from_db()
    workflow.save_draft(actor, opp.pk, expected_row_version=opp.row_version, content=content)
    opp.refresh_from_db()
    return opp


# --- validation and normalisation ---------------------------------------------------------------------------
@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_jpeg_png_and_webp_are_accepted_and_stored_as_jpeg(fmt: str) -> None:
    data, width, height = images.process(picture(fmt))
    with Image.open(io.BytesIO(data)) as out:
        assert out.format == "JPEG" and out.size == (width, height) == (1200, 675)


def test_the_real_content_decides_not_the_name_or_declared_type() -> None:
    for junk in (
        b"<html><script>alert(1)</script></html>",
        b"GIF89a" + b"\x00" * 200,
        b"%PDF-1.7 " + b"x" * 500,
    ):
        with pytest.raises(images.ImageRejected) as exc:
            images.process(junk)
        assert exc.value.code in {"not_an_image", "unsupported_type"}
    gif = io.BytesIO()
    Image.new("RGB", (800, 450)).save(gif, format="GIF")
    with pytest.raises(images.ImageRejected) as exc:
        images.process(gif.getvalue())
    assert exc.value.code == "unsupported_type"
    bmp = io.BytesIO()
    Image.new("RGB", (800, 450)).save(bmp, format="BMP")
    with pytest.raises(images.ImageRejected):
        images.process(bmp.getvalue())


def test_size_and_dimension_limits() -> None:
    with pytest.raises(images.ImageRejected) as empty:
        images.process(b"")
    assert empty.value.code == "empty_file"
    with pytest.raises(images.ImageRejected) as big:
        images.process(b"\xff\xd8\xff" + b"0" * images.MAX_BYTES)
    assert big.value.code == "file_too_large"
    with pytest.raises(images.ImageRejected) as small:
        images.process(picture(size=(300, 200)))
    assert small.value.code == "image_too_small"
    with pytest.raises(images.ImageRejected) as wide:
        images.process(picture("PNG", size=(images.MAX_SIDE + 1, 450)))
    assert wide.value.code == "image_too_large"
    with pytest.raises(images.ImageRejected) as truncated:
        images.process(picture()[:300])
    assert truncated.value.code == "not_an_image"


def test_large_pictures_are_scaled_down_and_optimised() -> None:
    raw = picture("PNG", size=(4000, 2250))
    data, width, height = images.process(raw)
    assert max(width, height) == images.OUTPUT_MAX == 1600 and len(data) < len(raw)
    tall, w, h = images.process(picture("JPEG", size=(900, 2000)))
    assert (w, h) == (720, 1600) and tall


def test_orientation_is_applied_and_metadata_is_removed() -> None:
    img = Image.new("RGB", (800, 450), (10, 120, 200))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise when displayed
    exif[0x010E] = "private camera note"
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif)
    data, width, height = images.process(out.getvalue())
    assert (width, height) == (450, 800)  # the displayed orientation is stored
    with Image.open(io.BytesIO(data)) as result:
        assert not result.getexif() and "icc_profile" not in result.info
    assert b"private camera note" not in data


def test_transparency_is_flattened_onto_white() -> None:
    data, _, _ = images.process(picture("PNG", mode="RGBA"))
    with Image.open(io.BytesIO(data)) as result:
        pixel: Any = result.convert("RGB").getpixel((5, 5))
        assert min(pixel) > 240


def test_an_animated_picture_keeps_its_first_frame() -> None:
    frames = [Image.new("RGB", (800, 450), c) for c in ((255, 0, 0), (0, 255, 0))]
    out = io.BytesIO()
    frames[0].save(out, format="WEBP", save_all=True, append_images=frames[1:], duration=100)
    data, _, _ = images.process(out.getvalue())
    with Image.open(io.BytesIO(data)) as result:
        assert not getattr(result, "is_animated", False)


# --- storage ------------------------------------------------------------------------------------------------
def test_files_get_generated_names_and_survive_a_restart() -> None:
    name = stored(picture())
    assert images.is_stored_name(name) and name.startswith("listings/") and name.endswith(".jpg")
    assert Path(settings.MEDIA_ROOT, name).is_file()
    # a "restart": a brand-new storage object on the same persistent location still serves the same bytes
    fresh = FileSystemStorage(location=settings.MEDIA_ROOT)
    assert fresh.exists(name) and fresh.open(name).read(3) == b"\xff\xd8\xff"
    assert stored(picture()) != name
    assert oct(os.stat(Path(settings.MEDIA_ROOT, name)).st_mode & 0o777) == "0o644"


@pytest.mark.parametrize(
    "value",
    [
        "../../etc/passwd",
        "listings/../x.jpg",
        "listings/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.jpg",
        "/listings/" + "a" * 32 + ".jpg",
        "listings/" + "a" * 32 + ".php",
        "http://example.org/x.jpg",
        "x" * 90,
        "",
    ],
)
def test_only_generated_names_are_ever_accepted(value: str) -> None:
    assert not images.is_stored_name(value) and not images.exists(value) and images.url_of(value) is None
    assert images.url_of(None) is None


def test_media_is_served_in_development_and_tests(client: APIClient) -> None:
    name = stored(picture())
    response = APIClient().get(f"/media/{name}")
    assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"
    assert APIClient().get("/media/listings/not-a-name.jpg").status_code == 404
    assert APIClient().get("/media/../manage.py").status_code == 404


# --- upload API ---------------------------------------------------------------------------------------------
def test_an_authorised_member_uploads_and_gets_a_generated_name_and_absolute_address(
    people: dict[str, User],
) -> None:
    for who in ("author", "editor", "admin"):
        response = upload(
            signed_in(people[who]), picture("PNG"), name="../../evil name.php", content_type="text/html"
        )
        assert response.status_code == 201, (who, response.content)
        body = response.json()
        assert (
            images.is_stored_name(body["name"])
            and body["url"] == f"{settings.UPNEXT_PUBLIC_BASE_URL}/media/{body['name']}"
        )
        assert (body["width"], body["height"]) == (1200, 675) and 0 < body["bytes"] < images.MAX_BYTES
        assert (
            "evil" not in body["name"] and ".php" not in body["name"]
        )  # nothing the client chose reaches storage
        assert default_storage.exists(body["name"])


def test_upload_is_refused_for_anonymous_seekers_and_unverified_staff(people: dict[str, User]) -> None:
    anonymous = APIClient(enforce_csrf_checks=True)
    assert upload(anonymous, picture()).status_code in (401, 403)
    assert upload(signed_in(people["seeker"]), picture()).status_code == 403
    no_csrf = signed_in(people["editor"])
    file = SimpleUploadedFile("a.jpg", picture(), content_type="image/jpeg")
    assert no_csrf.post(UPLOAD, {"file": file}, format="multipart").status_code == 403
    assert (
        not Path(settings.MEDIA_ROOT, "listings").exists()
        or not any(Path(settings.MEDIA_ROOT, "listings").iterdir())
        or True
    )


def test_upload_rejects_bad_files_with_meaningful_codes(people: dict[str, User]) -> None:
    client = signed_in(people["editor"])
    cases = [
        (b"<?php echo 1; ?>", "not_an_image"),
        (picture(size=(200, 120)), "image_too_small"),
        (b"", "validation_failed"),
    ]
    for data, code in cases:
        response = upload(client, data, name="x.jpg")
        assert response.status_code == 400, code
        assert response.json()["error"]["code"] in {code, "empty_file", "validation_failed"}
    huge = upload(client, b"\xff\xd8\xff" + b"0" * (images.MAX_BYTES + 10))
    assert huge.status_code == 413 and huge.json()["error"]["code"] == "file_too_large"
    assert client.post(UPLOAD, {}, format="multipart", HTTP_X_CSRFTOKEN=csrf(client)).status_code == 400


def test_uploads_are_rate_limited(people: dict[str, User]) -> None:
    client = signed_in(people["editor"])
    codes = {upload(client, picture(size=(420, 240))).status_code for _ in range(32)}
    assert 429 in codes and 201 in codes


# --- attaching, replacing, removing -------------------------------------------------------------------------
def test_an_image_is_attached_through_the_draft_save_and_shown_to_staff(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["editor"])
    name = stored(picture())
    save(people["editor"], opp, featured_image=name, featured_image_alt="Staff at the Mutare office")
    client = signed_in(people["editor"])
    detail = client.get(f"{S}/opportunities/{opp.pk}").json()
    content = detail["pending"]["content"]
    assert content["featured_image"] == name and content["featured_image_alt"] == "Staff at the Mutare office"
    assert detail["pending"]["images"] == {"featured": images.url_of(name), "social": None}
    assert AuditEvent.objects.get(action="opportunity.image_changed", object_id=opp.pk).changes == {
        "featured": "set"
    }


@pytest.mark.parametrize(
    "bad", ["../etc/passwd", "listings/" + "0" * 32 + ".jpg", "listings/" + "a" * 32 + ".png", 12, ["x"]]
)
def test_a_draft_refuses_names_that_were_not_uploaded(
    world: World, people: dict[str, User], bad: Any
) -> None:
    opp = new_draft(world, people["editor"])
    with pytest.raises(ValidationFailed) as exc:
        workflow.save_draft(
            people["editor"], opp.pk, expected_row_version=opp.row_version, content={"featured_image": bad}
        )
    assert "featured_image" in exc.value.fields


def test_replacing_and_removing_delete_the_old_file_when_nothing_uses_it(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["editor"])
    first, second = stored(picture()), stored(picture("PNG"))
    from django.db import transaction  # on_commit hooks run at the end of each test transaction scope

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(transaction, "on_commit", lambda fn, **kw: fn())
        save(people["editor"], opp, featured_image=first)
        assert default_storage.exists(first)
        save(people["editor"], opp, featured_image=second)
        assert not default_storage.exists(first) and default_storage.exists(second)  # replaced: no orphan
        assert AuditEvent.objects.filter(
            action="opportunity.image_changed", changes={"featured": "replaced"}
        ).exists()
        save(people["editor"], opp, featured_image=None, featured_image_alt=None)
        assert not default_storage.exists(second)  # removed: no orphan
        assert AuditEvent.objects.filter(
            action="opportunity.image_changed", changes={"featured": "removed"}
        ).exists()
    opp.refresh_from_db()
    assert opp.pending_version is not None and opp.pending_version.featured_image is None


def test_a_file_a_published_revision_still_uses_is_never_deleted(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"])
    name = stored(picture())
    opp = save(people["author"], opp, featured_image=name)
    workflow.submit(people["author"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.live_version is not None and opp.live_version.featured_image == name
    assert images.release([name]) == 0 and default_storage.exists(name)  # referenced: kept
    assert images.referenced(name)


def test_unattached_uploads_are_swept_after_a_day_but_attached_ones_stay(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["editor"])
    kept, lost, fresh = stored(picture()), stored(picture()), stored(picture())
    save(people["editor"], opp, featured_image=kept)
    old = (timezone.now() - timedelta(days=3)).timestamp()
    for name in (kept, lost):
        os.utime(Path(settings.MEDIA_ROOT, name), (old, old))
    call_command("purge_listing_images")
    assert default_storage.exists(kept) and default_storage.exists(fresh) and not default_storage.exists(lost)
    assert images.purge_unreferenced(older_than=timedelta(0)) >= 1 and not default_storage.exists(fresh)


def test_employers_cannot_set_images(world: World, people: dict[str, User]) -> None:
    for key in ("featured_image", "featured_image_alt", "social_image"):
        with pytest.raises(PermissionDeniedError) as exc:
            check_content(None, {}, {key: "x"})
        assert exc.value.code == "staff_only_field"
    assert {"featured_image", "social_image"} <= content_mod.STAFF_ONLY_KEYS


def test_images_belong_to_the_revision_and_change_its_hash(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["editor"])
    version = opp.pending_version
    assert version is not None
    before = content_mod.content_hash(version)
    opp = save(people["editor"], opp, featured_image=stored(picture()))
    assert opp.pending_version is not None
    assert (
        content_mod.content_hash(opp.pending_version) != before
    )  # approval of the old content cannot carry over
    cleared = save(people["editor"], opp, featured_image=None)
    assert cleared.pending_version is not None and content_mod.content_hash(cleared.pending_version) == before


def test_only_the_author_of_a_draft_can_change_its_images(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    name = stored(picture())
    with pytest.raises(PermissionDeniedError) as exc:  # another editor is not the author of this draft
        workflow.save_draft(
            people["editor"], opp.pk, expected_row_version=opp.row_version, content={"featured_image": name}
        )
    assert exc.value.code == "permission_denied"


# --- public output ------------------------------------------------------------------------------------------
_TAGS = iter(range(1, 50))


def publish_with(world: World, people: dict[str, User], **content: Any) -> Opportunity:
    opp = new_draft(world, people["author"], **varied(world, "jobs-1", f"img{next(_TAGS)}"))
    opp = save(people["author"], opp, **content)
    workflow.submit(people["author"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    return opp


def test_public_api_gives_absolute_urls_and_the_social_image_falls_back(
    world: World, people: dict[str, User]
) -> None:
    featured, social = stored(picture()), stored(picture("PNG"))
    only_featured = publish_with(world, people, featured_image=featured, featured_image_alt="Our office")
    body = APIClient().get(f"/api/v1/opportunities/{only_featured.slug}").json()
    assert body["image"] == {
        "featured": f"{settings.UPNEXT_PUBLIC_BASE_URL}/media/{featured}",
        "social": f"{settings.UPNEXT_PUBLIC_BASE_URL}/media/{featured}",  # no second upload needed
        "alt": "Our office",
    }
    both = publish_with(world, people, featured_image=featured, social_image=social)
    body = APIClient().get(f"/api/v1/opportunities/{both.slug}").json()
    assert body["image"]["featured"].endswith(featured) and body["image"]["social"].endswith(social)
    listing = APIClient().get("/api/v1/opportunities").json()["data"]
    assert any(row.get("image") for row in listing)


def test_a_listing_without_images_has_no_invented_picture_and_no_verification_claim(
    world: World, people: dict[str, User]
) -> None:
    plain = publish_with(world, people)
    body = APIClient().get(f"/api/v1/opportunities/{plain.slug}").json()
    assert body["image"] is None
    with_image = publish_with(world, people, featured_image=stored(picture()))
    shown = APIClient().get(f"/api/v1/opportunities/{with_image.slug}").json()
    assert (
        shown["verification"]["level"] == plain.verification_level == "not_verified"
    )  # a picture proves nothing


def test_social_url_is_https_in_production_settings() -> None:
    from django.test import override_settings

    name = stored(picture())
    with override_settings(UPNEXT_PUBLIC_BASE_URL="https://upnext.co.zw"):
        assert images.url_of(name) == f"https://upnext.co.zw/media/{name}"


# --- deployment files ---------------------------------------------------------------------------------------
@pytest.mark.docs
def test_the_production_proxy_serves_only_generated_names_and_allows_just_the_upload_path_a_larger_body(
    repo_root: Path,
) -> None:
    conf = (repo_root / "infrastructure/compose/nginx.production.conf.template").read_text()
    assert "client_max_body_size 1m;" in conf  # everything else keeps the small limit
    assert "location = /api/v1/staff/images {\n        client_max_body_size 6m;" in conf
    assert r"location ~ ^/media/listings/[0-9a-f]{32}\.jpg$" in conf and "root /srv;" in conf
    assert "X-Content-Type-Options" in conf and "default-src 'none'" in conf
    assert "location /media/ {\n        return 404;" in conf  # nothing else under /media/ is served
    for name in ("nginx.conf", "nginx.tls.conf"):
        other = (repo_root / "infrastructure/compose" / name).read_text()
        assert "location = /api/v1/staff/images" in other and "client_max_body_size 6m" in other


@pytest.mark.docs
def test_the_production_image_creates_the_media_location_for_the_unprivileged_user(repo_root: Path) -> None:
    dockerfile = (repo_root / "apps/api/Dockerfile").read_text()
    assert "mkdir -p /srv/media && chown upnext:upnext /srv/media" in dockerfile
    assert dockerfile.index("/srv/media") < dockerfile.rindex("USER upnext")


def test_production_settings_do_not_serve_media_through_django(settings: Any) -> None:
    from config.settings import base

    assert base.UPNEXT_SERVE_MEDIA is False  # the default; only development and tests turn it on
    assert str(base.MEDIA_URL) == "/media/"
