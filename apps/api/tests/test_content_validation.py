"""Draft-level cleaning (types, lengths, references) and publish-grade validation rules."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from accounts.models import User
from opportunities import content, workflow
from opportunities.errors import ValidationFailed
from opportunities.validation import validate_publishable
from tests.factories import World, new_draft

pytestmark = pytest.mark.django_db


def errors_for(
    world: World, author: User, example: str = "jobs-1", **overrides: Any
) -> dict[str, list[tuple[str, str]]]:
    opp = new_draft(world, author, example, **overrides)
    assert opp.pending_version is not None
    return validate_publishable(opp.pending_version)


def codes(errors: dict[str, list[tuple[str, str]]], path: str) -> set[str]:
    return {code for code, _ in errors.get(path, [])}


def test_a_complete_example_has_no_publish_grade_errors(world: World, people: dict[str, User]) -> None:
    assert errors_for(world, people["author"]) == {}


@pytest.mark.parametrize(
    ("overrides", "path", "code"),
    [
        ({"title": "ABCDEFGHIJKL OPENINGS NOW"}, "title", "invalid_format"),
        ({"title": "Apply at www.example.org today"}, "title", "invalid_format"),
        ({"summary": "x" * 19}, "summary", "too_short"),
        ({"description_md": "<script>alert(1)</script> " + "text " * 20}, "description_md", "markdown_disallowed"),
        ({"description_md": "short"}, "description_md", "too_short"),
        ({"employment_type": None}, "employment_type", "required"),
        ({"employment_type": "internship"}, "employment_type", "required"),
        ({"application_method": "external_url", "application_url": None}, "application_url", "required"),
        ({"application_method": "email", "application_email": None, "application_url": None}, "application_email", "required"),
        ({"application_method": "instructions", "application_instructions": "too short", "application_url": None}, "application_instructions", "too_short"),
    ],
)  # fmt: skip
def test_publish_grade_rules(
    world: World, people: dict[str, User], overrides: dict[str, Any], path: str, code: str
) -> None:
    assert code in codes(errors_for(world, people["author"], **overrides), path)


def test_deadline_rules(world: World, people: dict[str, User]) -> None:
    soon = (timezone.now() + timedelta(days=5)).isoformat()
    assert errors_for(world, people["author"], deadline_at=soon) == {}
    past = (timezone.now() - timedelta(days=1)).isoformat()
    assert "in_past" in codes(errors_for(world, people["author"], deadline_at=past), "deadline_at")
    far = (timezone.now() + timedelta(days=4000)).isoformat()
    assert "out_of_range" in codes(errors_for(world, people["author"], deadline_at=far), "deadline_at")
    assert "required" in codes(
        errors_for(world, people["author"], "tenders-1", deadline_at=None, deadline_timezone=None),
        "deadline_at",
    )


def test_category_applicability_matrix(world: World, people: dict[str, User]) -> None:
    scholarship = errors_for(
        world,
        people["author"],
        "scholarships-1",
        work_mode="remote",
        experience_level="mid",
        salary={"min": "1", "max": "2", "currency": "USD", "period": "month"},
    )
    assert {"work_mode", "experience_level", "salary"} <= set(scholarship)
    job = errors_for(
        world,
        people["author"],
        "jobs-1",
        funding={"min": "100", "max": "200", "currency": "USD", "period": "year"},
    )
    assert "funding" in job
    tender = errors_for(world, people["author"], "tenders-1", employment_type="permanent")
    assert "employment_type" in tender


def test_source_rules(world: World, people: dict[str, User]) -> None:
    today = timezone.now().date()
    base = {
        "kind": "issuer_website",
        "name": "Careers page",
        "url": "https://careers.example.org/a",
        "citation": None,
        "is_primary": True,
    }
    old = errors_for(
        world, people["author"], sources=[{**base, "observed_on": (today - timedelta(days=400)).isoformat()}]
    )
    assert "out_of_range" in codes(old, "sources.0.observed_on")
    future = errors_for(
        world, people["author"], sources=[{**base, "observed_on": (today + timedelta(days=2)).isoformat()}]
    )
    assert "in_past" in codes(future, "sources.0.observed_on")
    with pytest.raises(ValidationFailed) as excinfo:  # refused when saved, never a database error
        errors_for(
            world,
            people["author"],
            sources=[
                {**base, "observed_on": today.isoformat()},
                {**base, "name": "Other", "observed_on": today.isoformat()},
            ],
        )
    assert "primary_source_required" in codes(excinfo.value.fields, "sources")
    with pytest.raises(ValidationFailed) as no_locator:  # a source with neither address nor citation
        errors_for(
            world,
            people["author"],
            sources=[
                {"kind": "newspaper", "name": "Daily paper", "url": None, "citation": None,
                 "observed_on": today.isoformat(), "is_primary": True}
            ],
        )  # fmt: skip
    assert "required" in codes(no_locator.value.fields, "sources.0")


def test_citation_only_source_is_allowed_but_not_called_verification(
    world: World, people: dict[str, User]
) -> None:
    today = timezone.now().date().isoformat()
    source = {
        "kind": "newspaper",
        "name": "The Daily Example",
        "url": None,
        "citation": "Page 7, 14 October",
        "observed_on": today,
        "is_primary": True,
    }
    assert errors_for(world, people["author"], sources=[source]) == {}


def test_tender_dates_must_be_in_order(world: World, people: dict[str, User]) -> None:
    _, example = world.content("tenders-1")
    detail = dict(example["detail"])
    detail["clarification_deadline_at"] = example["deadline_at"]  # not before closing
    detail["bid_opening_at"] = (timezone.now() + timedelta(days=1)).isoformat()  # before closing
    errors = errors_for(world, people["author"], "tenders-1", detail=detail)
    assert {"detail.clarification_deadline_at", "detail.bid_opening_at"} <= set(errors)


# --- draft cleaning -------------------------------------------------------------------------------------------
def test_clean_draft_normalises_and_rejects(world: World) -> None:
    cleaned, errors = content.clean_draft({"title": "  Spaced   Title ", "summary": None, "work_mode": None})
    assert cleaned["title"] == "Spaced Title" and cleaned["work_mode"] is None
    assert "summary" in errors  # a required text field cannot be cleared with null
    for bad, path in (
        ({"title": "x" * 201}, "title"),
        ({"description_md": "x" * 20001}, "description_md"),
        ({"deadline_at": "2026-01-01T10:00:00"}, "deadline_at"),
        ({"deadline_timezone": "Mars/Base"}, "deadline_timezone"),
        ({"deadline_is_date_only": "yes"}, "deadline_is_date_only"),
        ({"salary": {"min": "10", "max": "5", "currency": "USD", "period": "month"}}, "salary.min"),
        ({"salary": {"currency": "ZWL"}}, "salary.currency"),
        ({"salary": {"period": "fortnight"}}, "salary.period"),
        ({"salary": "lots"}, "salary"),
        ({"funding": {"min": 1.5}}, "funding.min"),
        ({"application_email": "nope"}, "application_email"),
        ({"locations": "harare"}, "locations"),
        ({"locations": [{"location_id": "bogus", "is_primary": True}]}, "locations.0"),
        ({"skills": [{"skill_id": "bogus", "is_required": True}]}, "skills.0"),
        ({"sector_ids": ["bogus"]}, "sector_ids.0"),
        ({"sources": [{"kind": "x", "name": "n"}]}, "sources.0.kind"),
        ({"sources": "none"}, "sources"),
        ({"detail": "text"}, "detail"),
        ({"organisation_id": "bogus"}, "organisation_id"),
        ({"unknown": 1}, "unknown"),
    ):
        _, errors = content.clean_draft(bad)
        assert path in errors, (bad, errors)


def test_clean_draft_resolves_references(world: World) -> None:
    cleaned, errors = content.clean_draft(
        {
            "organisation_id": next(iter(world.organisations.values())),
            "locations": [{"location_id": world.locations["harare"], "is_primary": True}],
            "skills": [{"skill_id": world.skills["spreadsheets"], "is_required": False}],
            "sector_ids": [world.sectors["finance"]],
            "salary": None,
            "funding": {"min": "1000", "max": "2000", "currency": "USD", "period": "year"},
            "deadline_at": "2026-12-01T10:00:00+02:00",
        }
    )
    assert errors == {} and cleaned["salary_min"] is None and str(cleaned["funding_max"]) == "2000.00"
    assert cleaned["locations"][0][1] is True and cleaned["deadline_at"].utcoffset() is not None


def test_a_conflicting_amendment_after_validation_failure_changes_nothing(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"])
    version = opp.pending_version
    assert version is not None
    with pytest.raises(ValidationFailed):
        workflow.save_draft(
            people["author"],
            opp.pk,
            expected_row_version=opp.row_version,
            content={"title": "New title", "salary": "bad"},
        )
    version.refresh_from_db()
    assert version.title == "Graduate Electrical Engineer"  # the failed save left no partial change


def test_pairings_are_reported_as_validation_errors_not_database_errors(
    world: World, people: dict[str, User]
) -> None:
    opp = new_draft(world, people["author"])
    for bad, path in (
        ({"salary": {"min": "5", "currency": "USD"}}, "salary"),  # no period
        ({"salary": {"min": "5", "period": "month"}}, "salary"),  # no currency
        ({"funding": {"max": "5"}}, "funding"),
        ({"deadline_timezone": None}, "deadline_timezone"),
        ({"deadline_at": None, "deadline_is_date_only": True}, "deadline_is_date_only"),
        ({"locations": [{"location_id": world.locations["harare"], "is_primary": True},
                        {"location_id": world.locations["mutare"], "is_primary": True}]}, "locations"),
    ):  # fmt: skip
        with pytest.raises(ValidationFailed) as excinfo:
            workflow.save_draft(people["author"], opp.pk, expected_row_version=opp.row_version, content=bad)
        assert path in excinfo.value.fields, (bad, excinfo.value.fields)
