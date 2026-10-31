"""The simplified job editor's data rules (D-55): what the eleven essential fields map to, what stays optional,
what is refused, and that nothing weakens the publishing safeguards."""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from employers.capability import check_content
from opportunities import content as content_mod
from opportunities import workflow
from opportunities.errors import PermissionDeniedError, ValidationFailed
from opportunities.models import ListingStatus, Opportunity, OpportunityVersion
from opportunities.validation import validate_publishable
from tests.factories import CHECKLIST, World, new_draft, published

from .test_staff_api import S, send, signed_in

pytestmark = pytest.mark.django_db


def errors_of(opp: Opportunity) -> dict[str, list[tuple[str, str]]]:
    assert opp.pending_version is not None
    return validate_publishable(opp.pending_version)


def codes(errors: dict[str, list[tuple[str, str]]], path: str) -> set[str]:
    return {code for code, _ in errors.get(path, [])}


def save(actor: User, opp: Opportunity, **content: Any) -> Opportunity:
    opp.refresh_from_db()
    workflow.save_draft(actor, opp.pk, expected_row_version=opp.row_version, content=content)
    opp.refresh_from_db()
    return opp


# --- optional fields stay optional ---------------------------------------------------------------------------
def test_a_job_publishes_without_overview_job_type_salary_or_deadline(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(
        world,
        people["author"],
        summary="",
        employment_type=None,
        salary=None,
        deadline_at=None,
        deadline_timezone=None,
        deadline_is_date_only=False,
    )
    assert errors_of(opp) == {}


def test_a_short_overview_is_still_refused_when_given(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"], summary="Too short")
    assert "too_short" in codes(errors_of(opp), "summary")


def test_responsibilities_and_qualifications_are_not_forced_to_repeat_each_other(
    world: World, people: dict[str, User]
) -> None:
    only_qualifications = new_draft(
        world,
        people["author"],
        description_md="",
        requirements_md="A diploma and two years' experience. " * 3,
    )
    assert errors_of(only_qualifications) == {}
    nothing = new_draft(world, people["author"], description_md="", requirements_md=None)
    assert "required" in codes(errors_of(nothing), "description_md")


def test_full_time_is_a_job_type_and_internship_stays_with_its_own_category(
    world: World, people: dict[str, User]
) -> None:
    assert errors_of(new_draft(world, people["author"], employment_type="full_time")) == {}
    bad = new_draft(world, people["author"], employment_type="internship")
    assert "invalid_choice" in codes(errors_of(bad), "employment_type")


def test_vacancies_live_in_the_category_detail_and_are_validated_there(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"])
    assert opp.pending_version is not None
    detail = {**opp.pending_version.detail, "vacancies": 3}
    opp = save(people["author"], opp, detail=detail)
    assert opp.pending_version is not None and opp.pending_version.detail["vacancies"] == 3
    assert errors_of(opp) == {}
    opp = save(people["author"], opp, detail={**detail, "vacancies": "many"})
    assert any(path.startswith("detail") for path in errors_of(opp))


# --- salary wording ------------------------------------------------------------------------------------------
def test_competitive_salary_wording_is_stored_and_shown_without_an_amount(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"], salary=None, salary_text="Competitive")
    assert opp.pending_version is not None and opp.pending_version.salary_text == "Competitive"
    assert errors_of(opp) == {}


def test_wording_and_an_amount_cannot_be_given_together(world: World, people: dict[str, User]) -> None:
    opp = new_draft(
        world,
        people["author"],
        salary={"min": "500.00", "max": "700.00", "currency": "USD", "period": "month"},
        salary_text="Competitive",
    )
    assert "invalid_choice" in codes(errors_of(opp), "salary_text")


def test_salary_wording_is_not_accepted_for_a_tender(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"], example="tenders-1", salary_text="Competitive")
    assert "invalid_choice" in codes(errors_of(opp), "salary_text")


# --- application methods --------------------------------------------------------------------------------------
BOTH = {
    "application_method": "both",
    "application_url": "https://example.org/apply",
    "application_email": "jobs@example.org",
}


def test_both_needs_a_web_address_and_an_e_mail_address(world: World, people: dict[str, User]) -> None:
    assert errors_of(new_draft(world, people["author"], **BOTH)) == {}
    no_email = new_draft(world, people["author"], **{**BOTH, "application_email": None})
    assert "required" in codes(errors_of(no_email), "application_email")
    no_url = new_draft(world, people["author"], **{**BOTH, "application_url": None})
    assert "required" in codes(errors_of(no_url), "application_url")


def test_instructions_only_needs_no_destination(world: World, people: dict[str, User]) -> None:
    opp = new_draft(
        world,
        people["author"],
        application_method="instructions",
        application_url=None,
        application_email=None,
        application_instructions="Hand deliver your application to the front desk before 4pm on the closing date.",
    )
    assert errors_of(opp) == {}


# --- address (slug) ---------------------------------------------------------------------------------------------
def test_a_chosen_address_is_used_at_first_publication(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author_editor"], slug="chosen-address-for-this-job")
    assert opp.pending_version is not None and opp.pending_version.slug_hint == "chosen-address-for-this-job"
    workflow.publish_direct(
        people["author_editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST
    )
    opp.refresh_from_db()
    assert opp.slug == "chosen-address-for-this-job" and opp.status == ListingStatus.PUBLISHED


@pytest.mark.parametrize(
    "slug", ["Has Capitals", "double--hyphen-here", "-leading-hyphen", "short", "new", "x" * 81]
)
def test_malformed_or_reserved_addresses_are_refused(
    world: World, people: dict[str, User], slug: str
) -> None:
    opp = new_draft(world, people["author"])
    opp.refresh_from_db()
    with pytest.raises(ValidationFailed) as exc:
        workflow.save_draft(
            people["author"], opp.pk, expected_row_version=opp.row_version, content={"slug": slug}
        )
    assert "slug" in exc.value.fields


def test_an_address_another_listing_uses_is_refused_inline(world: World, people: dict[str, User]) -> None:
    other = published(world, people["author"], people["editor"])
    assert other.slug
    opp = new_draft(world, people["author"])
    opp.refresh_from_db()
    with pytest.raises(ValidationFailed) as exc:
        workflow.save_draft(
            people["author"], opp.pk, expected_row_version=opp.row_version, content={"slug": other.slug}
        )
    assert "duplicate_detected" in {c for c, _ in exc.value.fields["slug"]}


def test_two_open_drafts_cannot_claim_the_same_address(world: World, people: dict[str, User]) -> None:
    first = new_draft(world, people["author"], slug="the-one-address-wanted")
    assert first.pending_version is not None
    second = new_draft(world, people["author_editor"])
    second.refresh_from_db()
    with pytest.raises(ValidationFailed):
        workflow.save_draft(
            people["author_editor"],
            second.pk,
            expected_row_version=second.row_version,
            content={"slug": "the-one-address-wanted"},
        )
    # Saving the same address again on the draft that owns it is fine.
    save(people["author"], first, slug="the-one-address-wanted")


def test_a_published_address_never_changes(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    assert opp.slug
    workflow.amend(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    with pytest.raises(ValidationFailed) as exc:
        workflow.save_draft(
            people["editor"],
            opp.pk,
            expected_row_version=opp.row_version,
            content={"slug": "a-brand-new-address"},
        )
    assert "immutable" in {c for c, _ in exc.value.fields["slug"]}
    # Repeating the permanent address is allowed.
    save(people["editor"], opp, slug=opp.slug)


# --- search and sharing text ------------------------------------------------------------------------------------
def test_search_and_sharing_text_are_length_limited_and_optional(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"])
    opp = save(
        people["author"],
        opp,
        seo_title="A clear title",
        seo_description="A description.",
        og_title="Share title",
        og_description="Share text.",
    )
    version = opp.pending_version
    assert (
        version is not None
        and version.seo_title == "A clear title"
        and version.og_description == "Share text."
    )
    for field, limit in (
        ("seo_title", 70),
        ("seo_description", 200),
        ("og_title", 90),
        ("og_description", 200),
    ):
        with pytest.raises(ValidationFailed):
            workflow.save_draft(
                people["author"],
                opp.pk,
                expected_row_version=opp.row_version,
                content={field: "x" * (limit + 1)},
            )
    opp = save(people["author"], opp, seo_title=None)
    assert opp.pending_version is not None and opp.pending_version.seo_title is None


def test_employers_cannot_set_an_address_or_search_text(world: World, people: dict[str, User]) -> None:
    for key in ("slug", "seo_title", "seo_description", "og_title", "og_description"):
        with pytest.raises(PermissionDeniedError) as exc:
            check_content(None, {}, {key: "x"})
        assert exc.value.code == "staff_only_field"


# --- integrity ---------------------------------------------------------------------------------------------------
def test_new_optional_columns_leave_the_hash_of_older_revisions_unchanged(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"])
    version = opp.pending_version
    assert isinstance(version, OpportunityVersion)
    snap = content_mod.snapshot(version)
    for key in content_mod.OPTIONAL_HASHED:
        assert key not in snap  # unset: absent, exactly as before the columns existed
    before = content_mod.content_hash(version)
    version.salary_text = "Competitive"
    assert content_mod.content_hash(version) != before  # set: it is part of what is approved
    version.salary_text = None
    assert content_mod.content_hash(version) == before


def test_a_frozen_revision_cannot_change_the_new_fields(world: World, people: dict[str, User]) -> None:
    from django.db import IntegrityError, transaction

    opp = published(world, people["author"], people["editor"])
    version = opp.live_version
    assert version is not None
    version.salary_text = "Changed after approval"
    with pytest.raises(IntegrityError), transaction.atomic():
        version.save()


def test_copying_into_an_amendment_keeps_the_new_fields(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"], salary=None, salary_text="Negotiable")
    workflow.amend(people["editor"], opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    assert opp.pending_version is not None and opp.pending_version.salary_text == "Negotiable"


# --- through the staff and public API ----------------------------------------------------------------------------
def test_the_staff_api_round_trips_the_new_fields(world: World, people: dict[str, User]) -> None:
    client = signed_in(people["author"])
    opp = new_draft(world, people["author"])
    opp.refresh_from_db()
    body = {
        "row_version": opp.row_version,
        "content": {
            "salary": None,
            "salary_text": "Competitive",
            "slug": "api-chosen-address",
            "seo_title": "SEO title",
        },
    }
    saved = send(client, "patch", f"{S}/opportunities/{opp.pk}/draft", body)
    assert saved.status_code == 200, saved.content
    content = saved.json()["pending"]["content"]
    assert content["salary_text"] == "Competitive" and content["slug"] == "api-chosen-address"
    assert content["seo_title"] == "SEO title"
    clash = send(
        client,
        "patch",
        f"{S}/opportunities/{opp.pk}/draft",
        {"row_version": saved.json()["row_version"], "content": {"slug": "Bad Slug"}},
    )
    assert clash.status_code == 400 and "slug" in clash.json()["error"]["fields"]


def test_the_public_api_serves_wording_both_methods_and_search_text(
    world: World, people: dict[str, User], client: APIClient
) -> None:
    opp = published(
        world,
        people["author"],
        people["editor"],
        salary=None,
        salary_text="Competitive",
        seo_title="Public SEO title",
        **BOTH,
    )
    response = client.get(f"/api/v1/opportunities/{opp.slug}")
    assert response.status_code == 200
    body = response.json()
    assert body["salary"] is None and body["salary_text"] == "Competitive"
    assert body["application"]["method"] == "both"
    assert (
        body["application"]["url"] == "https://example.org/apply"
        and body["application"]["email"] == "jobs@example.org"
    )
    assert body["seo"]["title"] == "Public SEO title" and body["seo"]["og_title"] is None
