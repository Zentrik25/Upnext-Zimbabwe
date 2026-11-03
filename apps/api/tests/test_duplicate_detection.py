"""Duplicate detection (D-62): the organisation, the normalised job title and the listing's own details decide.
A shared website, e-mail address or source address never does, and a confirmation is one click, not an id and a
paragraph."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from accounts.models import User
from catalog.models import Organisation
from opportunities import workflow
from opportunities.duplicates import find_duplicates, normalise_title
from opportunities.errors import WorkflowError
from opportunities.models import ListingStatus, Opportunity
from tests.factories import CHECKLIST, World, new_draft

from .conftest import csrf
from .test_staff_api import S, signed_in

pytestmark = pytest.mark.django_db

SHARED = {
    "application_url": "https://careers.deltabeverages.example.org/apply",
    "application_email": None,
    "sources": [
        {
            "kind": "issuer_website",
            "name": "Delta Beverages careers",
            "url": "https://careers.deltabeverages.example.org/",
            "citation": None,
            "observed_on": timezone.now().date().isoformat(),
            "is_primary": True,
        }
    ],
}


@pytest.fixture
def delta(people: dict[str, User]) -> Organisation:
    return Organisation.objects.create(
        name="Delta Beverages", website_url="https://deltabeverages.example.org", created_by=people["admin"]
    )


def draft(world: World, actor: User, org: Organisation, title: str, **extra: Any) -> Opportunity:
    return new_draft(world, actor, "jobs-1", organisation_id=str(org.pk), title=title, **{**SHARED, **extra})


def publish(actor: User, opp: Opportunity, **kwargs: Any) -> Opportunity:
    opp.refresh_from_db()
    return workflow.publish_direct(
        actor, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST, **kwargs
    )


def duplicates_of(opp: Opportunity) -> list[Any]:
    opp.refresh_from_db()
    assert opp.pending_version is not None
    return find_duplicates(opp.pending_version)


def test_four_different_delta_beverages_jobs_publish_without_any_duplicate_warning(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    titles = ["Driver Salesperson", "Stock Controllers", "Accounting Officer", "Inventory Management Clerk"]
    for title in titles:
        opp = draft(world, editor, delta, title)  # same organisation, website, apply address and source
        assert duplicates_of(opp) == []
        assert publish(editor, opp).status == ListingStatus.PUBLISHED  # no acknowledgement, no explanation
    assert Opportunity.objects.filter(status=ListingStatus.PUBLISHED).count() == 4


def test_the_same_address_email_or_source_alone_is_never_a_duplicate(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    publish(
        editor, draft(world, editor, delta, "Warehouse Supervisor", application_email="hr@delta.example.org")
    )
    other = draft(world, editor, delta, "Brand Manager", application_email="hr@delta.example.org")
    assert duplicates_of(other) == []


def test_the_same_title_at_another_organisation_is_a_different_vacancy(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    publish(editor, draft(world, editor, delta, "Driver Salesperson"))
    elsewhere = Organisation.objects.create(name="Other Bottlers", created_by=people["admin"])
    assert duplicates_of(draft(world, editor, elsewhere, "Driver Salesperson")) == []


def test_the_same_vacancy_twice_needs_one_confirmation_and_no_explanation(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    first = publish(editor, draft(world, editor, delta, "Driver Salesperson"))
    again = draft(world, editor, delta, "Driver Salesperson")
    found = duplicates_of(again)
    assert [(d.level, d.opportunity_id) for d in found] == [("hard", str(first.pk))]
    with pytest.raises(WorkflowError) as refused:
        publish(editor, again)
    assert refused.value.code == "duplicate_detected"
    again.refresh_from_db()
    assert again.status == ListingStatus.DRAFT  # nothing was published by the refused attempt
    publish(editor, again, duplicate_acknowledgement={"confirmed": True})
    again.refresh_from_db()
    assert again.status == ListingStatus.PUBLISHED and again.live_version is not None
    assert again.live_version.duplicate_acknowledgement == {"duplicate_of": str(first.pk), "confirmed": True}


def test_the_old_acknowledgement_with_an_id_and_a_reason_still_works(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    first = publish(editor, draft(world, editor, delta, "Driver Salesperson"))
    again = draft(world, editor, delta, "Driver Salesperson")
    published = publish(
        editor,
        again,
        duplicate_acknowledgement={"duplicate_of": str(first.pk), "reason": "A second depot is hiring."},
    )
    assert published.status == ListingStatus.PUBLISHED


@pytest.mark.parametrize(
    "variant",
    ["Stock Controller", "STOCK CONTROLLERS", "Stock-Controller (Urgent Vacancy)", " stock  controllers "],
)
def test_spelling_case_punctuation_and_plurals_do_not_hide_a_duplicate(
    world: World, people: dict[str, User], delta: Organisation, variant: str
) -> None:
    editor = people["editor"]
    publish(editor, draft(world, editor, delta, "Stock Controllers"))
    assert [d.level for d in duplicates_of(draft(world, editor, delta, variant))] == ["hard"]


def test_a_clearly_different_place_reference_or_closing_date_makes_it_a_warning_not_a_block(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    base = draft(
        world,
        editor,
        delta,
        "Sales Representative",
        location_text="Harare",
        reference_number="DB/01",
    )
    publish(editor, base)
    for extra, reason in (
        ({"location_text": "Bulawayo", "reference_number": "DB/01"}, "location"),
        ({"location_text": "Harare", "reference_number": "DB/02"}, "reference"),
    ):
        other = draft(world, editor, delta, "Sales Representative", **extra)
        found = duplicates_of(other)
        assert {d.level for d in found} == {"soft"} and any(reason in d.reason for d in found)
        assert publish(editor, other).status == ListingStatus.PUBLISHED  # a warning never blocks


def test_a_different_closing_date_also_makes_it_a_warning(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    first = publish(editor, draft(world, editor, delta, "Sales Representative"))
    assert first.live_version is not None and first.live_version.deadline_at is not None
    later = (first.live_version.deadline_at + timedelta(days=9)).isoformat()
    other = draft(world, editor, delta, "Sales Representative", deadline_at=later)
    found = duplicates_of(other)
    assert [d.level for d in found] == ["soft"] and "closing date" in found[0].reason


def test_a_similar_title_is_a_warning_and_never_blocks(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    publish(editor, draft(world, editor, delta, "Driver Salesperson"))
    similar = draft(world, editor, delta, "Driver Sales Person")
    assert [d.level for d in duplicates_of(similar)] == ["soft"]
    assert publish(editor, similar).status == ListingStatus.PUBLISHED


def test_only_listings_that_are_still_open_are_compared(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    old = publish(editor, draft(world, editor, delta, "Driver Salesperson"))
    waiting = draft(world, editor, delta, "Driver Salesperson")
    assert [d.level for d in duplicates_of(waiting)] == ["hard"]
    workflow.expire(
        editor,
        old.pk,
        expected_row_version=Opportunity.objects.get(pk=old.pk).row_version,
        reason="The post has been filled.",
    )
    assert duplicates_of(waiting) == []  # advertised again after the first closed: a new vacancy
    unpublished = draft(world, editor, delta, "Stock Controllers")
    assert (
        duplicates_of(draft(world, editor, delta, "Stock Controllers")) == []
    )  # a draft is not a listing yet
    assert unpublished.status == ListingStatus.DRAFT


def test_title_normalisation() -> None:
    assert normalise_title("Café Manager - URGENT!") == normalise_title("cafe manager")
    assert normalise_title("Stock Controllers") == normalise_title("stock controller")
    assert normalise_title("Business") == "business"  # a word ending in "ss" keeps its ending
    assert normalise_title(None) == "" and normalise_title("   ") == ""


# --- through the staff API ------------------------------------------------------------------------------------
def test_the_staff_api_warns_and_one_checkbox_confirms(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    first = publish(editor, draft(world, editor, delta, "Driver Salesperson"))
    again = draft(world, editor, delta, "Driver Salesperson")
    client = signed_in(editor)
    detail = client.get(f"{S}/opportunities/{again.pk}").json()
    assert [d["id"] for d in detail["duplicates"]] == [str(first.pk)] and detail["duplicates"][0][
        "level"
    ] == "hard"
    assert any("Driver Salesperson" in w for w in detail["warnings"])
    names = {f["name"] for a in detail["actions"] if a["name"] == "publish_direct" for f in a["fields"]}
    assert "confirm_duplicate" in names and not {"duplicate_of", "duplicate_reason"} & names

    url = f"{S}/opportunities/{again.pk}/actions/publish_direct"
    body: dict[str, Any] = {"row_version": detail["row_version"]}
    refused = client.post(url, body, format="json", HTTP_X_CSRFTOKEN=csrf(client))
    assert refused.status_code in (400, 409) and refused.json()["error"]["code"] == "duplicate_detected"
    ok = client.post(url, {**body, "confirm_duplicate": True}, format="json", HTTP_X_CSRFTOKEN=csrf(client))
    assert ok.status_code == 200 and ok.json()["status"] == "published"


def test_a_different_job_title_shows_no_warning_in_the_staff_api(
    world: World, people: dict[str, User], delta: Organisation
) -> None:
    editor = people["editor"]
    publish(editor, draft(world, editor, delta, "Driver Salesperson"))
    other = draft(world, editor, delta, "Accounting Officer")
    detail = signed_in(editor).get(f"{S}/opportunities/{other.pk}").json()
    assert detail["duplicates"] == [] and not any("already open" in w for w in detail["warnings"])
