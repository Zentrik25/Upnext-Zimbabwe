"""Featured and social images, Open Graph text, unique and redirecting addresses (D-47)."""

from __future__ import annotations

import io
from typing import Any

import pytest
from django.db import IntegrityError, connection, transaction
from django.test import Client
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from catalog import media
from catalog.models import MediaAsset
from employers.models import EmployerListing
from opportunities import slugs, social, workflow
from opportunities.errors import PermissionDeniedError, SlugTaken, ValidationFailed
from opportunities.models import Opportunity, OpportunityVersion, SlugRedirect
from tests.factories import World, new_draft, varied

pytestmark = pytest.mark.django_db
MESSAGE = "This slug already exists. Please enter a unique slug."


def picture(fmt: str = "JPEG", size: tuple[int, int] = (1200, 630), mode: str = "RGB", **kw: Any) -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, (20, 90, 200) if mode == "RGB" else (20, 90, 200, 128)).save(out, format=fmt, **kw)
    return out.getvalue()


def logged_in(user: User) -> Client:
    client = Client()
    client.force_login(user)
    return client


def live_of(opp: Opportunity) -> OpportunityVersion:
    version = opp.live_version
    assert version is not None
    return version


def pending_of(opp: Opportunity) -> OpportunityVersion:
    version = opp.pending_version
    assert version is not None
    return version


def asset_of(version: OpportunityVersion) -> MediaAsset:
    asset: MediaAsset | None = version.featured_image
    assert asset is not None
    return asset


def live(world: World, actor: User, tag: str, **extra: Any) -> Opportunity:
    opp = new_draft(world, actor, "jobs-1", **varied(world, "jobs-1", tag, **extra))
    return workflow.publish_direct(actor, opp.pk, expected_row_version=opp.row_version)


def asset_for(user: User, data: bytes, **kw: Any) -> MediaAsset:
    processed = media.process(data, **kw)
    return MediaAsset.objects.get_or_create(
        sha256=processed.sha256,
        defaults={
            "content_type": processed.content_type,
            "width": processed.width,
            "height": processed.height,
            "data": processed.data,
            "created_by": user,
        },
    )[0]


# --- image intake ----------------------------------------------------------------------------------------
@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_supported_formats_are_decoded_and_re_encoded(fmt: str) -> None:
    result = media.process(picture(fmt, (1600, 900)))
    assert result.content_type in ("image/jpeg", "image/png")
    assert (result.width, result.height) == (1600, 900)


def test_the_real_content_decides_not_the_name_or_declared_type() -> None:
    for raw in (
        b"<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>",
        b"GIF89a" + b"0" * 60,
        b"%PDF-1.4 x" * 50,
    ):
        with pytest.raises(media.ImageError):
            media.process(raw)


def test_limits_are_enforced() -> None:
    with pytest.raises(media.ImageError):
        media.process(b"0" * (6 * 1024 * 1024))
    with pytest.raises(media.ImageError):
        media.process(picture("PNG", (100, 60)))
    with pytest.raises(media.ImageError):
        media.process(b"")


def test_metadata_is_stripped_and_alpha_is_kept_as_png() -> None:
    exif = Image.Exif()
    exif[0x010F] = "SecretCamera"
    jpeg = picture("JPEG", (800, 420), exif=exif)
    assert b"SecretCamera" in jpeg
    assert b"SecretCamera" not in media.process(jpeg).data
    assert media.process(picture("PNG", (800, 420), mode="RGBA")).content_type == "image/png"


def test_an_unsuitable_image_warns_and_is_never_silently_reshaped() -> None:
    result = media.process(picture("JPEG", (900, 900)))
    assert (result.width, result.height) == (900, 900)
    assert len(result.warnings) == 2  # smaller than recommended and the wrong shape
    assert media.process(picture("JPEG", (1200, 630))).warnings == []


def test_cropping_happens_only_when_asked() -> None:
    cropped = media.process(picture("JPEG", (900, 900)), crop_to_social=True)
    assert (cropped.width, cropped.height) == (1200, 630) and cropped.warnings == []


def test_assets_are_content_addressed_and_never_changed_or_deleted(
    world: World, people: dict[str, User]
) -> None:
    one = asset_for(people["editor"], picture())
    assert asset_for(people["editor"], picture()).pk == one.pk
    with pytest.raises(IntegrityError), transaction.atomic():
        MediaAsset.objects.filter(pk=one.pk).update(width=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        MediaAsset.objects.filter(pk=one.pk).delete()


# --- the staff editor ----------------------------------------------------------------------------------------
def bare(world: World, user: User, tag: str = "bare", **extra: Any) -> Opportunity:
    """A draft without rows, as the existing staff-editor tests use; the posted form adds them."""
    return new_draft(world, user, "jobs-1", **varied(world, "jobs-1", tag, locations=[], sources=[], **extra))


def post_data(opp: Opportunity, **over: Any) -> dict[str, Any]:
    from catalog.models import Location
    from tests.test_admin import version_post

    base = version_post(opp, **{"locations-0-location": str(Location.objects.get(slug="harare").pk)})
    return {**base, **over}


def upload(name: str, data: bytes) -> Any:
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, data, content_type="image/jpeg")


def edit_url(opp: Opportunity) -> str:
    return reverse("admin:opportunities_opportunityversion_change", args=[opp.pending_version_id])


def test_an_editor_uploads_a_featured_and_a_separate_social_image(
    world: World, people: dict[str, User]
) -> None:
    opp = bare(world, people["editor"])
    client = logged_in(people["editor"])
    page = client.get(edit_url(opp))
    assert page.status_code == 200
    html = page.content.decode()
    for needle in (
        "Social sharing preview",
        "WhatsApp",
        "Facebook",
        "LinkedIn",
        "social-config",
        "Canonical URL",
    ):
        assert needle in html
    response = client.post(
        edit_url(opp),
        post_data(
            opp,
            featured_image_file=upload("hero.jpg", picture("JPEG", (1600, 900))),
            featured_image_alt="Engineers on site",
            social_image_source="custom",
            social_image_file=upload("card.jpg", picture("JPEG", (1200, 630))),
            social_image_alt="Card",
            og_title="Join us today",
            og_description="A hand-written description.",
            slug_request="graduate-electrical-engineer-abc",
        ),
    )
    assert response.status_code == 302, (getattr(response, "context_data", None) or {}).get("adminform")
    opp.refresh_from_db()
    version = opp.pending_version
    assert version is not None
    assert version.featured_image and version.featured_image.width == 1600
    assert version.social_image and version.social_image.width == 1200
    assert version.featured_image_id != version.social_image_id
    assert (version.og_title, version.slug_request) == ("Join us today", "graduate-electrical-engineer-abc")


def test_no_separate_social_image_means_the_featured_image_is_shared(
    world: World, people: dict[str, User]
) -> None:
    opp = live(world, people["editor"], "fb")
    resolved = social.resolved(opp.live_version)
    assert resolved["social_image"] == resolved["featured_image"]
    assert (resolved["social_image"] or {})["alt"]


def test_a_bad_file_is_refused_in_the_form_and_nothing_is_stored(
    world: World, people: dict[str, User]
) -> None:
    opp = bare(world, people["editor"])
    before = MediaAsset.objects.count()
    response = logged_in(people["editor"]).post(
        edit_url(opp),
        post_data(opp, featured_image_file=upload("evil.jpg", b"<svg><script>1</script></svg>")),
    )
    assert response.status_code == 200 and "could not be read as an image" in response.content.decode()
    assert MediaAsset.objects.count() == before


def test_choosing_custom_without_a_file_asks_for_one(world: World, people: dict[str, User]) -> None:
    opp = bare(world, people["editor"])
    response = logged_in(people["editor"]).post(edit_url(opp), post_data(opp, social_image_source="custom"))
    assert response.status_code == 200 and "Upload a social image" in response.content.decode()


def test_replacing_images_leaves_older_revisions_intact(world: World, people: dict[str, User]) -> None:
    editor = people["editor"]
    opp = live(world, editor, "rep")
    first = opp.live_version
    assert first is not None
    first_image = first.featured_image_id
    assert first_image is not None
    workflow.amend(editor, opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert pending_of(opp).featured_image_id == first_image  # carried over into the amendment
    replacement = asset_for(editor, picture("JPEG", (1400, 700)))
    workflow.save_draft(
        editor, opp.pk, expected_row_version=opp.row_version,
        content={"featured_image_id": str(replacement.pk), "featured_image_alt": "New"},
    )  # fmt: skip
    opp.refresh_from_db()
    published = workflow.publish_direct(editor, opp.pk, expected_row_version=opp.row_version)
    first.refresh_from_db()
    assert first.featured_image_id == first_image and MediaAsset.objects.filter(pk=first_image).exists()
    assert live_of(published).featured_image_id == replacement.pk
    assert published.slug == opp.slug  # the address survives an edit


def test_removing_the_featured_image_from_a_draft(world: World, people: dict[str, User]) -> None:
    opp = bare(world, people["editor"])
    response = logged_in(people["editor"]).post(edit_url(opp), post_data(opp, remove_featured_image="on"))
    assert response.status_code == 302
    opp.refresh_from_db()
    assert pending_of(opp).featured_image_id is None and pending_of(opp).featured_image_alt is None


# --- publishing rules -----------------------------------------------------------------------------------------
def test_drafts_may_lack_an_image_but_a_new_listing_cannot_be_published_without_one(
    world: World, people: dict[str, User]
) -> None:
    _, content = world.content("jobs-1")
    for key in ("featured_image_id", "featured_image_alt"):
        content.pop(key)
    opp = workflow.create_draft(people["editor"], category_code="jobs", content=content)
    opp.refresh_from_db()
    with pytest.raises(ValidationFailed) as caught:
        workflow.publish_direct(people["editor"], opp.pk, expected_row_version=opp.row_version)
    assert "featured_image_id" in caught.value.fields


def test_an_image_needs_alt_text_to_be_published(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["editor"], **varied(world, "jobs-1", "alt", featured_image_alt=None))
    with pytest.raises(ValidationFailed) as caught:
        workflow.publish_direct(people["editor"], opp.pk, expected_row_version=opp.row_version)
    assert "featured_image_alt" in caught.value.fields


def test_employer_listings_keep_their_path_without_an_image(world: World, people: dict[str, User]) -> None:
    from catalog.models import Organisation

    opp = new_draft(world, people["editor"], **varied(world, "jobs-1", "emp"))
    version = opp.pending_version
    assert version is not None
    EmployerListing.objects.create(
        opportunity=opp,
        organisation=Organisation.objects.get(pk=version.organisation_id),
        created_by=people["editor"],
    )
    version.featured_image = None
    version.featured_image_alt = None
    version.save()
    from opportunities.validation import validate_publishable

    assert "featured_image_id" not in validate_publishable(version)


# --- Open Graph text -------------------------------------------------------------------------------------------
def test_suggestions_are_built_from_the_listing_and_typed_text_is_never_overwritten(
    world: World, people: dict[str, User]
) -> None:
    opp = live(world, people["editor"], "og", title="Graduate Electrical Engineer")
    version = opp.live_version
    assert version is not None
    organisation = version.organisation.name
    resolved = social.resolved(version)
    assert resolved["og_title"] == f"Graduate Electrical Engineer at {organisation} | UPNEXT Careers"
    assert resolved["og_description"].startswith(
        f"{organisation} is recruiting a Graduate Electrical Engineer in "
    )
    assert resolved["og_description"].endswith(
        "View requirements, closing date and application details on UPNEXT Careers."
    )
    assert len(resolved["og_title"]) <= 95 and len(resolved["og_description"]) <= 200
    opp.refresh_from_db()
    workflow.amend(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.save_draft(
        people["editor"], opp.pk, expected_row_version=opp.row_version,
        content={"og_title": "My own words", "og_description": "My own description."},
    )  # fmt: skip
    opp.refresh_from_db()
    workflow.save_draft(
        people["editor"],
        opp.pk,
        expected_row_version=opp.row_version,
        content={"title": "A different job title"},
    )
    opp.refresh_from_db()
    assert pending_of(opp).og_title == "My own words"
    assert pending_of(opp).og_description == "My own description."


def test_other_categories_are_described_without_pretending_to_recruit(
    world: World, people: dict[str, User]
) -> None:
    text = social.suggest_description("tenders", "Supply of pumps", "Water Authority", "Harare, Zimbabwe")
    assert "recruiting" not in text and text.startswith(
        "Supply of pumps from Water Authority in Harare, Zimbabwe."
    )


# --- addresses ---------------------------------------------------------------------------------------------------
def test_a_unique_slug_is_accepted_and_a_duplicate_is_refused_in_any_case(
    world: World, people: dict[str, User]
) -> None:
    editor = people["editor"]
    first = live(world, editor, "s1", slug_request="graduate-electrical-engineer-abc")
    assert first.slug == "graduate-electrical-engineer-abc"
    with pytest.raises(SlugTaken) as caught:
        new_draft(
            world, editor, **varied(world, "jobs-1", "s2", slug_request="Graduate-Electrical-Engineer-ABC")
        )
    assert caught.value.http_status == 409 and caught.value.fields["slug_request"][0][1] == MESSAGE
    assert (
        slugs.suggest("Graduate Electrical Engineer", "ABC Engineering")
        == "graduate-electrical-engineer-abc-engineering"
    )


def test_the_staff_form_answers_409_with_the_field_error(world: World, people: dict[str, User]) -> None:
    live(world, people["editor"], "t1", slug_request="taken-address-one")
    opp = bare(world, people["editor"], "t2")
    response = logged_in(people["editor"]).post(
        edit_url(opp), post_data(opp, slug_request="taken-address-one")
    )
    assert response.status_code == 409 and MESSAGE in response.content.decode()
    opp.refresh_from_db()
    assert pending_of(opp).slug_request is None


def test_a_draft_may_keep_its_own_requested_slug(world: World, people: dict[str, User]) -> None:
    opp = bare(world, people["editor"], "own", slug_request="my-own-address")
    assert (
        logged_in(people["editor"])
        .post(edit_url(opp), post_data(opp, slug_request="my-own-address"))
        .status_code
        == 302
    )


def test_the_availability_check_endpoint(world: World, people: dict[str, User]) -> None:
    live(world, people["editor"], "c1", slug_request="existing-address")
    client = logged_in(people["editor"])
    url = reverse("admin:opportunities_opportunity_slug_check")
    assert client.get(url, {"slug": "brand-new-address"}).status_code == 200
    taken = client.get(url, {"slug": "EXISTING-address"})
    assert taken.status_code == 409 and taken.json()["message"] == MESSAGE
    assert client.get(url, {"slug": "bad slug!"}).status_code == 400
    assert Client().get(url, {"slug": "brand-new-address"}).status_code == 302  # staff only


def test_changing_a_slug_redirects_the_old_one_and_reserves_it(world: World, people: dict[str, User]) -> None:
    editor = people["editor"]
    opp = live(world, editor, "mv", slug_request="first-address-here")
    workflow.change_slug(editor, opp.pk, new_slug="second-address-here", expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.slug == "second-address-here"
    assert SlugRedirect.objects.get(old_slug="first-address-here").opportunity_id == opp.pk
    api = APIClient()
    moved = api.get("/api/v1/opportunities/first-address-here")
    assert moved.status_code == 301 and moved["Location"] == "/api/v1/opportunities/second-address-here"
    assert moved.json()["slug"] == "second-address-here"
    assert api.get("/api/v1/opportunities/second-address-here").status_code == 200
    other = new_draft(world, editor, **varied(world, "jobs-1", "other"))
    with pytest.raises(SlugTaken):
        workflow.save_draft(
            editor,
            other.pk,
            expected_row_version=other.row_version,
            content={"slug_request": "First-Address-Here"},
        )
    with pytest.raises(ValidationFailed):  # not even the listing itself may take it back
        workflow.change_slug(
            editor, opp.pk, new_slug="first-address-here", expected_row_version=opp.row_version
        )
    assert "sitemap" and "second-address-here" in [
        r["slug"] for r in api.get("/api/v1/sitemap").json()["data"]
    ]


def test_a_redirect_never_leads_to_a_listing_that_is_not_public(
    world: World, people: dict[str, User]
) -> None:
    editor = people["editor"]
    opp = live(world, editor, "gone", slug_request="soon-to-be-moved")
    workflow.change_slug(editor, opp.pk, new_slug="moved-away-address", expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.takedown(
        editor,
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="error",
        reason="Taken down in this test.",
    )
    assert APIClient().get("/api/v1/opportunities/soon-to-be-moved").status_code == 404


def test_only_editors_and_administrators_change_addresses(world: World, people: dict[str, User]) -> None:
    opp = live(world, people["editor"], "perm")
    for who in ("author", "seeker"):
        with pytest.raises(PermissionDeniedError):
            workflow.change_slug(
                people[who], opp.pk, new_slug="a-new-address-x", expected_row_version=opp.row_version
            )
    assert "change_slug" in workflow.allowed_actions(people["admin"], opp)
    assert "change_slug" not in workflow.allowed_actions(people["author"], opp)
    client = logged_in(people["editor"])
    url = reverse("admin:opportunities_opportunity_action", args=[opp.pk, "change_slug"])
    other = live(world, people["editor"], "perm2", slug_request="already-in-use-1")
    conflict = client.post(url, {"row_version": opp.row_version, "slug": "already-in-use-1"})
    assert conflict.status_code == 409 and MESSAGE in conflict.content.decode()
    assert other.slug == "already-in-use-1"
    ok = client.post(url, {"row_version": opp.row_version, "slug": "fresh-address-1"})
    assert ok.status_code == 302


def test_the_database_enforces_the_namespace(world: World, people: dict[str, User]) -> None:
    one = live(world, people["editor"], "db1", slug_request="database-address")
    two = live(world, people["editor"], "db2", slug_request="another-database-address")
    with pytest.raises(IntegrityError), transaction.atomic():  # case-insensitive uniqueness
        Opportunity.objects.filter(pk=two.pk).update(slug="DATABASE-ADDRESS")
    with pytest.raises(IntegrityError), transaction.atomic():  # a slug changes only after its redirect exists
        Opportunity.objects.filter(pk=one.pk).update(slug="sneaky-new-address")
    with pytest.raises(IntegrityError), transaction.atomic():  # nobody can reserve another listing's address
        SlugRedirect.objects.create(
            old_slug="Another-Database-Address", opportunity=one, changed_by=people["editor"]
        )
    two.refresh_from_db()
    workflow.change_slug(
        people["editor"], two.pk, new_slug="renamed-database-address", expected_row_version=two.row_version
    )
    with pytest.raises(IntegrityError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("DELETE FROM opportunities_slugredirect")


# --- what the public sees ------------------------------------------------------------------------------------------
def test_the_detail_carries_the_images_and_text_a_shared_link_needs(
    world: World, people: dict[str, User]
) -> None:
    custom = asset_for(people["editor"], picture("JPEG", (1200, 630), quality=60))
    opp = live(
        world, people["editor"], "pub", social_image_id=str(custom.pk), social_image_alt="Social card",
        og_title="Editor chosen title", og_description="Editor chosen description.",
    )  # fmt: skip
    body = APIClient().get(f"/api/v1/opportunities/{opp.slug}").json()
    assert (
        body["og_title"] == "Editor chosen title" and body["og_description"] == "Editor chosen description."
    )
    assert body["social_image"]["url"] == custom.public_path and body["social_image"]["alt"] == "Social card"
    assert body["featured_image"]["url"] != body["social_image"]["url"]
    assert (body["social_image"]["width"], body["social_image"]["height"]) == (1200, 630)


def test_crawlers_can_fetch_the_image_without_authentication(world: World, people: dict[str, User]) -> None:
    opp = live(world, people["editor"], "crawl")
    asset = asset_of(live_of(opp))
    crawler = Client(HTTP_USER_AGENT="WhatsApp/2.23.20.0 A", HTTP_ACCEPT="*/*")
    response = crawler.get(asset.public_path)
    assert response.status_code == 200 and response["Content-Type"] == "image/jpeg"
    assert response["Cache-Control"] == "public, max-age=31536000, immutable"
    assert response["X-Content-Type-Options"] == "nosniff" and int(response["Content-Length"]) == asset.size
    assert response.content == bytes(asset.data)
    head = crawler.head(asset.public_path)
    assert head.status_code == 200 and head.content == b""
    assert crawler.get(asset.public_path, HTTP_IF_NONE_MATCH=response["ETag"]).status_code == 304
    assert crawler.get(asset.public_path.replace(".jpg", ".png")).status_code == 404


def test_images_of_drafts_and_closed_listings_are_not_served(world: World, people: dict[str, User]) -> None:
    draft = new_draft(world, people["editor"], **varied(world, "jobs-1", "private"))
    private = asset_of(pending_of(draft))
    assert Client().get(private.public_path).status_code == 404
    assert Client().get(f"/api/v1/opportunities/{draft.slug}").status_code in (404, 400)
    opp = live(world, people["editor"], "closed", slug_request="soon-closed-address")
    path = asset_of(live_of(opp)).public_path
    assert Client().get(path).status_code == 200
    opp.refresh_from_db()
    workflow.takedown(
        people["editor"],
        opp.pk,
        expected_row_version=opp.row_version,
        reason_code="error",
        reason="Taken down in this test.",
    )
    assert Client().get(path).status_code == 404


def test_other_stored_data_is_not_reachable_through_the_media_route(
    world: World, people: dict[str, User]
) -> None:
    for name in ("../../etc/passwd", "x" * 64 + ".jpg", "0" * 64 + ".jpg", "a.jpg", "0" * 64 + ".svg"):
        assert Client().get(f"/api/v1/media/{name}").status_code == 404


def test_old_listings_without_images_keep_working(world: World, people: dict[str, User]) -> None:
    opp = live(world, people["editor"], "old")
    version = opp.live_version
    assert version is not None
    from opportunities import content as content_mod

    snap = content_mod.snapshot(version)
    assert "featured_image_id" in snap  # present once set
    version.featured_image = None
    version.featured_image_alt = None
    assert "featured_image_id" not in content_mod.snapshot(version)  # hashes of older revisions stay valid
    body = social.resolved(version)
    assert body["featured_image"] is None and body["social_image"] is None and body["og_title"]
