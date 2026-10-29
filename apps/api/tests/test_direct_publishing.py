"""Direct staff publishing (D-46): Editors and Administrators publish their own staff-created listings in one
step; everything else about the workflow, and the separation of duties for review, stays as it was."""

from __future__ import annotations

import io

import pytest
from django.db import IntegrityError, connection, transaction
from PIL import Image
from rest_framework.test import APIClient

from access import policy
from access.registry import DEFAULT_REGISTRY, Permission
from accounts.models import User
from audit.models import AuditEvent
from catalog.logo import LogoError, to_data_uri
from catalog.models import Organisation
from employers.models import EmployerListing
from opportunities import workflow
from opportunities.errors import (
    InvalidTransition,
    PermissionDeniedError,
    SeparationOfDuties,
    SlugTaken,
    ValidationFailed,
    WorkflowError,
)
from opportunities.models import (
    ListingStatus,
    Opportunity,
    OpportunityVersion,
    PublishingEvent,
    VerificationLevel,
    VersionState,
)
from tests.factories import CHECKLIST, World, new_draft, submitted, varied

pytestmark = pytest.mark.django_db


def live_of(opp: Opportunity) -> OpportunityVersion:
    version = opp.live_version
    assert version is not None
    return version


def pending_of(opp: Opportunity) -> OpportunityVersion:
    version = opp.pending_version
    assert version is not None
    return version


def direct(world: World, actor: User, tag: str = "d", **extra: object) -> Opportunity:
    opp = new_draft(world, actor, "jobs-1", **varied(world, "jobs-1", tag, **extra))
    return workflow.publish_direct(actor, opp.pk, expected_row_version=opp.row_version)


# --- who may ----------------------------------------------------------------------------------------
@pytest.mark.parametrize("who", ["editor", "admin"])
def test_an_editor_or_administrator_publishes_their_own_draft_without_a_second_person(
    world: World, people: dict[str, User], who: str
) -> None:
    actor = people[who]
    opp = direct(world, actor)
    opp.refresh_from_db()
    version = live_of(opp)
    assert opp.status == ListingStatus.PUBLISHED and opp.slug and opp.pending_version_id is None
    assert version.state == VersionState.PUBLISHED and version.published_directly
    assert version.author_id == version.published_by_id == actor.pk
    assert version.approved_by_id is None and version.content_hash and version.published_at
    assert opp.verification_level == VerificationLevel.NOT_VERIFIED  # publishing never verifies


def test_the_publisher_time_source_and_revision_are_recorded(world: World, people: dict[str, User]) -> None:
    opp = direct(world, people["editor"])
    event = PublishingEvent.objects.filter(opportunity=opp).latest("occurred_at")
    assert event.actor_id == people["editor"].pk and event.to_status == ListingStatus.PUBLISHED
    audit = AuditEvent.objects.get(object_id=opp.pk, action="opportunity.publish_direct")
    extra = audit.changes or {}
    assert extra["direct"] is True and extra["published_by"] == str(people["editor"].pk)
    assert extra["published_at"] and extra["content_hash"] and extra["source"]


def test_a_contributor_cannot_publish_directly(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    with pytest.raises(PermissionDeniedError):
        workflow.publish_direct(people["author"], opp.pk, expected_row_version=opp.row_version)
    assert "publish_direct" not in workflow.allowed_actions(people["author"], opp)


def test_nobody_publishes_someone_elses_draft(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["editor"])
    with pytest.raises(InvalidTransition):
        workflow.publish_direct(people["admin"], opp.pk, expected_row_version=opp.row_version)
    assert workflow.allowed_actions(people["admin"], opp) == []


def test_a_seeker_cannot_publish_directly(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["editor"])
    with pytest.raises(PermissionDeniedError):
        workflow.publish_direct(people["seeker"], opp.pk, expected_row_version=opp.row_version)


def test_an_employer_originated_listing_can_never_be_published_directly(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["editor"])
    EmployerListing.objects.create(
        opportunity=opp,
        organisation=Organisation.objects.get(pk=pending_of(opp).organisation_id),
        created_by=people["editor"],
    )
    with pytest.raises(SeparationOfDuties):
        workflow.publish_direct(people["editor"], opp.pk, expected_row_version=opp.row_version)
    assert "publish_direct" not in workflow.allowed_actions(people["editor"], opp)


def test_the_review_path_is_unchanged_for_contributors(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author_editor"])
    with pytest.raises(SeparationOfDuties):
        workflow.approve(
            people["author_editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST
        )
    workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED and not live_of(opp).published_directly


def test_policy_and_registry() -> None:
    assert DEFAULT_REGISTRY.has({"editor"}, Permission.OPP_PUBLISH_DIRECT)
    assert DEFAULT_REGISTRY.has({"administrator"}, Permission.OPP_PUBLISH_DIRECT)
    assert not DEFAULT_REGISTRY.has({"contributor"}, Permission.OPP_PUBLISH_DIRECT)
    assert not DEFAULT_REGISTRY.has(set(), Permission.OPP_PUBLISH_DIRECT)
    me = policy.Actor(user_id="a", roles=frozenset({"editor"}))
    ok = policy.DirectFacts(state="draft", author_id="a", employer_listing=False)
    assert policy.can_publish_direct(me, ok)
    assert not policy.can_publish_direct(me, policy.DirectFacts("draft", "b", False))
    assert not policy.can_publish_direct(me, policy.DirectFacts("in_review", "a", False))
    assert not policy.can_publish_direct(me, policy.DirectFacts("draft", "a", True))


# --- the publication rules still apply ----------------------------------------------------------------
def test_an_unpublishable_draft_is_refused_with_field_errors(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["editor"], "jobs-1", **varied(world, "jobs-1", "bad", sources=[]))
    with pytest.raises(ValidationFailed):
        workflow.publish_direct(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.DRAFT


def test_a_hard_duplicate_needs_an_explained_acknowledgement(world: World, people: dict[str, User]) -> None:
    first = direct(world, people["editor"], "one")
    twin = new_draft(world, people["editor"], "jobs-1", **varied(world, "jobs-1", "one"))
    with pytest.raises(WorkflowError) as caught:
        workflow.publish_direct(people["editor"], twin.pk, expected_row_version=twin.row_version)
    assert caught.value.code == "duplicate_detected"
    ack = {"duplicate_of": str(first.pk), "reason": "A second vacancy with the same details."}
    published = workflow.publish_direct(
        people["editor"], twin.pk, expected_row_version=twin.row_version, duplicate_acknowledgement=ack
    )
    assert published.status == ListingStatus.PUBLISHED


# --- slug, SEO and fields -------------------------------------------------------------------------------
def test_a_requested_slug_is_honoured_at_first_publication(world: World, people: dict[str, User]) -> None:
    opp = direct(world, people["editor"], "slug", slug_request="senior-engineer-harare")
    assert opp.slug == "senior-engineer-harare"


def test_a_taken_slug_is_refused_never_replaced(world: World, people: dict[str, User]) -> None:
    direct(world, people["editor"], "a", slug_request="same-address")
    with pytest.raises(SlugTaken) as caught:
        new_draft(
            world, people["editor"], "jobs-1", **varied(world, "jobs-1", "b", slug_request="Same-Address")
        )
    assert caught.value.http_status == 409
    assert (
        caught.value.fields["slug_request"][0][1] == "This slug already exists. Please enter a unique slug."
    )


def test_an_invalid_slug_is_rejected_when_the_draft_is_saved(world: World, people: dict[str, User]) -> None:
    with pytest.raises(ValidationFailed):
        new_draft(world, people["editor"], slug_request="Not A Slug!")


def test_editing_a_directly_published_listing_is_amend_then_publish_direct(
    world: World, people: dict[str, User]
) -> None:
    opp = direct(world, people["editor"], "edit")
    first_version = opp.live_version_id
    slug = opp.slug
    opp.refresh_from_db()
    workflow.amend(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    workflow.publish_direct(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.slug == slug and opp.live_version_id != first_version
    assert OpportunityVersion.objects.get(pk=str(first_version)).state == VersionState.SUPERSEDED
    assert live_of(opp).published_directly


# --- the database re-asserts the rules --------------------------------------------------------------------
def test_the_database_refuses_a_direct_publication_without_the_flag(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["editor"])
    with pytest.raises(IntegrityError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            "UPDATE opportunities_opportunityversion SET state='published', published_by_id=%s, "
            "published_at=now() WHERE id=%s",
            [people["editor"].pk, opp.pending_version_id],
        )


def test_the_database_refuses_the_flag_on_a_reviewed_path_and_for_a_contributor(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"])
    with pytest.raises(IntegrityError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            "UPDATE opportunities_opportunityversion SET state='published', published_directly=true, "
            "published_by_id=%s, published_at=now(), content_hash=decode(repeat('ab', 32), 'hex') WHERE id=%s",
            [people["author"].pk, opp.pending_version_id],
        )


# --- the public site ---------------------------------------------------------------------------------------
def test_a_directly_published_listing_is_immediately_public(world: World, people: dict[str, User]) -> None:
    opp = direct(
        world, people["editor"], "pub", responsibilities_md="Lead the **team**.", seo_title="Great job",
        seo_description="A great job in Harare.",
    )  # fmt: skip
    api = APIClient()
    listed = api.get("/api/v1/opportunities", {"limit": "50"}).json()["data"]
    assert opp.slug in [row["slug"] for row in listed]
    in_category = api.get("/api/v1/opportunities", {"category": "jobs", "limit": "50"}).json()["data"]
    assert opp.slug in [row["slug"] for row in in_category]
    searched = api.get("/api/v1/opportunities", {"q": live_of(opp).title.split()[0], "limit": "50"}).json()[
        "data"
    ]
    assert opp.slug in [row["slug"] for row in searched]
    assert opp.slug in [row["slug"] for row in api.get("/api/v1/sitemap").json()["data"]]
    detail = api.get(f"/api/v1/opportunities/{opp.slug}").json()
    assert "<strong>team</strong>" in detail["responsibilities_html"]
    assert detail["seo_title"] == "Great job" and detail["seo_description"] == "A great job in Harare."


def test_a_manually_entered_organisation_is_never_verified(world: World, people: dict[str, User]) -> None:
    org = Organisation.objects.create(name="Manual Org Ltd", created_by=people["editor"])
    opp = direct(world, people["editor"], "org", organisation_id=str(org.pk))
    assert not org.verifications.exists()
    assert live_of(opp).organisation_id == org.pk
    detail = APIClient().get(f"/api/v1/opportunities/{opp.slug}").json()
    assert detail["organisation"]["profile_slug"] is None


# --- the logo ---------------------------------------------------------------------------------------------------
def image_bytes(fmt: str, size: tuple[int, int] = (64, 64)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(out, format=fmt)
    return out.getvalue()


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "WEBP"])
def test_logo_is_re_encoded_as_a_small_png_data_uri(fmt: str) -> None:
    uri = to_data_uri(image_bytes(fmt, (600, 300)))
    assert uri.startswith("data:image/png;base64,") and len(uri) < 90_000


@pytest.mark.parametrize(
    "raw",
    [
        b"",
        b"not an image",
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        b"GIF89a" + b"0" * 40,
    ],
)
def test_logo_rejects_anything_that_is_not_a_plain_raster_image(raw: bytes) -> None:
    with pytest.raises(LogoError):
        to_data_uri(raw)


def test_logo_rejects_oversized_files() -> None:
    with pytest.raises(LogoError):
        to_data_uri(b"0" * (600 * 1024))
