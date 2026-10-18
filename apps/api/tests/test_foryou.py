"""`rules-v1` For You (Phase 6B): the engine, the explanations, the exclusions and the endpoint."""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from opportunities import workflow
from opportunities.models import Opportunity
from profiles import foryou
from profiles.models import SeekerProfile
from tests.factories import CHECKLIST, World, new_draft, varied
from tests.seekers import live, location_id, patch, put, sector_id, signed_in, skill_id

pytestmark = pytest.mark.django_db
URL = "/api/v1/discovery/for-you"
PROFILE = "/api/v1/me/profile"
BANNED = re.compile(
    r"\b(qualif(?:y|ies)|eligible|eligibility|guarantee[ds]?|you are|suitable for you|best match)\b", re.I
)


@pytest.fixture
def catalogue(world: World, people: dict[str, User]) -> dict[str, Opportunity]:
    return {
        "j1": live(
            world, people, "jobs-1", "fy1"
        ),  # entry, on-site, permanent, Harare, engineering, bachelors
        "j2": live(world, people, "jobs-2", "fy2"),  # contract, on-site, Masvingo, diploma, no skills
        "i1": live(world, people, "internships-1", "fy3"),  # hybrid, Bulawayo, technology, JavaScript
        "g1": live(world, people, "grants-1", "fy4"),  # Gweru
    }


def feed(client: APIClient, **params: str | int) -> dict[str, Any]:
    response = client.get(URL, params)
    assert response.status_code == 200, response.content
    body: dict[str, Any] = response.json()
    return body


def ids(body: dict[str, Any]) -> list[str]:
    return [row["opportunity"]["id"] for row in body["data"]]


def reasons(body: dict[str, Any], opportunity: Opportunity) -> dict[str, str]:
    row = next(r for r in body["data"] if r["opportunity"]["id"] == str(opportunity.pk))
    return {r["signal"]: r["text"] for r in row["match"]["reasons"]}


def test_for_you_needs_a_session(client: APIClient, catalogue: dict[str, Opportunity]) -> None:
    assert client.get(URL).status_code == 401


def test_an_empty_profile_falls_back_to_the_newest_open_listings(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    body = feed(client)
    assert body["meta"]["mode"] == "newest" and body["meta"]["model_version"] == "rules-v1"
    assert set(ids(body)) == {str(o.pk) for o in catalogue.values()}
    assert all(row["match"]["reasons"] == [] for row in body["data"])
    assert body["meta"]["fields_filled"] == 0 and len(body["meta"]["suggestions"]) == 3


def test_a_partial_profile_still_gets_useful_ranked_results(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["internships"]})
    body = feed(client)
    assert body["meta"]["mode"] == "matched" and ids(body) == [str(catalogue["i1"].pk)]
    assert reasons(body, catalogue["i1"]) == {"category_interest": "Matches your interest in Internships."}
    assert {s["signal"] for s in body["meta"]["suggestions"]} >= {"skills", "location"}


def test_signals_rank_and_each_reason_names_the_matching_attribute(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(
        client,
        PROFILE,
        {
            "categories": ["jobs"],
            "sectors": [sector_id("engineering")],
            "skills": [skill_id("AutoCAD"), skill_id("Report writing")],
            "preferred_locations": [location_id("harare")],
            "experience_level": "entry",
            "employment_types": ["permanent"],
            "work_arrangements": ["on_site"],
            "highest_qualification": "bachelors_degree",
        },
    )
    body = feed(client)
    assert ids(body)[0] == str(catalogue["j1"].pk)
    got = reasons(body, catalogue["j1"])
    assert set(got) == {
        "category_interest", "sector_interest", "skills", "location",
        "work_arrangement", "employment_type", "experience", "education",
    }  # fmt: skip
    assert got["sector_interest"] == "In an industry you follow: Engineering."
    assert got["skills"] == "Lists skills from your profile: AutoCAD, Report writing."
    assert got["location"] == "Located in Harare, one of your preferred places."
    assert got["work_arrangement"] == "Offers on site work, which you prefer."
    assert got["experience"] == "States an experience level of entry, as in your profile."
    assert got["education"] == "Lists a minimum of Bachelor's degree, the same level as your profile."
    # the contract listing matches only the category and the on-site preference
    assert set(reasons(body, catalogue["j2"])) == {"category_interest", "work_arrangement"}
    assert str(catalogue["i1"].pk) not in ids(body) and str(catalogue["g1"].pk) not in ids(body)


def test_nothing_in_the_feed_ever_claims_eligibility(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(
        client,
        PROFILE,
        {
            "categories": ["jobs", "internships"],
            "highest_qualification": "diploma",
            "experience_level": "senior",
            "skills": [skill_id("AutoCAD")],
            "work_arrangements": ["remote"],
        },
    )
    body = feed(client)
    texts = [
        n["text"]
        for row in body["data"]
        for key in ("reasons", "unknowns", "notes")
        for n in row["match"][key]
    ]
    texts += [s["text"] for s in body["meta"]["suggestions"]]
    assert texts and not [t for t in texts if BANNED.search(t)]


def test_missing_listing_data_is_never_a_match_and_never_an_exclusion(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(
        client,
        PROFILE,
        {"categories": ["jobs"], "experience_level": "senior", "skills": [skill_id("AutoCAD")]},
    )
    body = feed(client)
    row = next(
        r for r in body["data"] if r["opportunity"]["id"] == str(catalogue["j2"].pk)
    )  # no experience, no skills
    assert {r["signal"] for r in row["match"]["reasons"]} == {"category_interest"}
    unknown = {u["signal"]: u["text"] for u in row["match"]["unknowns"]}
    assert unknown["experience"] == "The listing does not state an experience level."
    assert unknown["skills"] == "The listing does not list skills."


def test_qualification_equal_is_a_signal_higher_minimum_is_a_note_lower_is_silent(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["jobs"], "highest_qualification": "diploma"})
    body = feed(client)
    j1 = next(r for r in body["data"] if r["opportunity"]["id"] == str(catalogue["j1"].pk))  # asks bachelors
    j2 = next(r for r in body["data"] if r["opportunity"]["id"] == str(catalogue["j2"].pk))  # asks diploma
    assert "education" not in {r["signal"] for r in j1["match"]["reasons"]}
    assert j1["match"]["notes"] == [
        {
            "signal": "education",
            "text": "Lists a minimum of Bachelor's degree, above the level in your profile.",
        }
    ]
    assert "education" in {r["signal"] for r in j2["match"]["reasons"]}
    patch(client, PROFILE, {"highest_qualification": "masters_degree"})
    body = feed(client)
    for row in body["data"]:
        assert "education" not in {r["signal"] for r in row["match"]["reasons"]}
        assert row["match"]["notes"] == []  # a higher qualification is not a reason to say anything


def test_a_professional_qualification_is_compared_for_equality_only(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["jobs"], "highest_qualification": "professional_qualification"})
    for row in feed(client)["data"]:
        assert (
            "education" not in {r["signal"] for r in row["match"]["reasons"]} and row["match"]["notes"] == []
        )


def test_a_province_matches_listings_in_its_cities_and_not_the_reverse(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"preferred_locations": [location_id("harare-province")]})
    body = feed(client)
    assert ids(body) == [str(catalogue["j1"].pk)]  # listed in the city Harare
    assert reasons(body, catalogue["j1"])["location"] == "Located in Harare, one of your preferred places."
    patch(
        client,
        PROFILE,
        {"preferred_locations": [location_id("harare")], "home_location": location_id("bulawayo")},
    )
    body = feed(client)
    assert (
        reasons(body, catalogue["i1"])["location"]
        == "Located in Bulawayo, where your profile says you are based."
    )


def test_unpublished_rejected_closed_and_expired_listings_are_never_recommended(
    make_user: Callable[..., User], world: World, people: dict[str, User], catalogue: dict[str, Opportunity]
) -> None:
    author, editor = people["author"], people["editor"]
    draft = new_draft(world, author, "jobs-1", **varied(world, "jobs-1", "x-draft"))
    in_review = new_draft(world, author, "jobs-1", **varied(world, "jobs-1", "x-review"))
    workflow.submit(author, in_review.pk, expected_row_version=in_review.row_version)
    approved = new_draft(world, author, "jobs-1", **varied(world, "jobs-1", "x-approved"))
    workflow.submit(author, approved.pk, expected_row_version=approved.row_version)
    approved.refresh_from_db()
    workflow.approve(editor, approved.pk, expected_row_version=approved.row_version, checklist=CHECKLIST)
    rejected = new_draft(world, author, "jobs-1", **varied(world, "jobs-1", "x-rejected"))
    workflow.submit(author, rejected.pk, expected_row_version=rejected.row_version)
    rejected.refresh_from_db()
    workflow.reject(
        editor,
        rejected.pk,
        expected_row_version=rejected.row_version,
        reason_code="x",
        reason="The source is unclear.",
    )
    withdrawn = live(world, people, "jobs-1", "x-withdrawn")
    workflow.withdraw(
        editor, withdrawn.pk, expected_row_version=withdrawn.row_version, reason="issuer withdrew"
    )
    taken = live(world, people, "jobs-1", "x-taken")
    workflow.takedown(
        editor,
        taken.pk,
        expected_row_version=taken.row_version,
        reason_code="error",
        reason="Listed in error.",
    )
    lapsed = live(world, people, "jobs-1", "x-lapsed")
    workflow.expire(editor, lapsed.pk, expected_row_version=lapsed.row_version, reason="deadline passed")

    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["jobs"]})
    returned = set(ids(feed(client)))
    hidden = {str(o.pk) for o in (draft, in_review, approved, rejected, withdrawn, taken, lapsed)}
    assert not returned & hidden
    assert {str(catalogue["j1"].pk), str(catalogue["j2"].pk)} <= returned


def test_a_listing_past_its_deadline_is_excluded_even_before_the_expiry_job_runs(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    _, user = signed_in(make_user)
    profile = SeekerProfile.objects.create(user=user)
    profile.categories.set([catalogue["j1"].category])
    version = catalogue["j1"].live_version
    assert version is not None and version.deadline_at is not None
    before = foryou.recommend(profile, version.deadline_at - timedelta(days=1))
    after = foryou.recommend(profile, version.deadline_at + timedelta(minutes=1))
    assert catalogue["j1"].pk in {m.version.opportunity_id for m in before.matches}
    assert catalogue["j1"].pk not in {m.version.opportunity_id for m in after.matches}


def test_ties_break_by_skills_then_earlier_deadline_then_newer_listing(
    make_user: Callable[..., User], world: World, people: dict[str, User]
) -> None:
    def at(days: int) -> dict[str, object]:
        return {
            "deadline_at": (timezone.now() + timedelta(days=days)).isoformat(),
            "deadline_timezone": "Africa/Harare",
        }

    soon = live(world, people, "jobs-2", "t-soon", **at(5))
    later = live(world, people, "jobs-2", "t-later", **at(20))
    none = live(world, people, "jobs-2", "t-none")
    newest_none = live(world, people, "jobs-2", "t-none2")
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["jobs"]})
    order = ids(feed(client))
    assert order == [str(o.pk) for o in (soon, later, newest_none, none)]


def test_each_listing_appears_once_and_pages_are_stable(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["jobs", "internships", "grants"]})
    first = feed(client, limit=2)
    assert first["page"]["has_more"] is True and first["page"]["total"] == 4
    second = feed(client, limit=2, cursor=first["page"]["next_cursor"])
    assert second["page"]["has_more"] is False and second["page"]["next_cursor"] is None
    everything = ids(first) + ids(second)
    assert len(everything) == len(set(everything)) == 4
    assert everything == ids(feed(client, limit=50))
    assert client.get(URL, {"cursor": "tampered"}).status_code == 400


def test_bad_parameters_are_refused(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    for params in ({"limit": 0}, {"limit": 51}, {"limit": "x"}, {"category": "nope"}, {"bogus": 1}):
        assert client.get(URL, params).status_code == 400, params


def test_the_category_filter_narrows_the_feed(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["jobs", "internships"]})
    assert set(ids(feed(client, category="jobs"))) == {str(catalogue["j1"].pk), str(catalogue["j2"].pk)}


def test_saved_listings_are_flagged_and_other_peoples_saves_never_leak(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    alice, _ = signed_in(make_user, email="alice@example.org")
    bob, _ = signed_in(make_user, email="bob@example.org")
    patch(alice, PROFILE, {"categories": ["jobs"]})
    patch(bob, PROFILE, {"categories": ["jobs"]})
    assert put(alice, f"/api/v1/me/saved/{catalogue['j1'].pk}", {}).status_code == 201
    assert {r["opportunity"]["id"]: r["opportunity"]["is_saved"] for r in feed(alice)["data"]}[
        str(catalogue["j1"].pk)
    ] is True
    assert all(r["opportunity"]["is_saved"] is False for r in feed(bob)["data"])


def test_the_feed_follows_profile_edits(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["internships"]})
    assert ids(feed(client)) == [str(catalogue["i1"].pk)]
    patch(client, PROFILE, {"categories": ["grants"]})
    assert ids(feed(client)) == [str(catalogue["g1"].pk)]
    client.post(
        f"{PROFILE}/reset-preferences",
        {},
        format="json",
        HTTP_X_CSRFTOKEN=client.get("/api/v1/auth/csrf").json()["csrf_token"],
    )
    assert feed(client)["meta"]["mode"] == "newest"


def test_a_profile_with_no_match_shows_the_newest_open_listings_labelled_as_such(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["scholarships"]})  # none published
    body = feed(client)
    assert body["meta"]["mode"] == "newest" and len(body["data"]) == 4
    assert body["meta"]["fields_filled"] == 1


def test_public_browsing_is_unchanged_and_not_personalised(
    make_user: Callable[..., User], catalogue: dict[str, Opportunity]
) -> None:
    client, _ = signed_in(make_user)
    patch(client, PROFILE, {"categories": ["grants"]})
    anonymous = APIClient().get("/api/v1/opportunities").json()
    assert len(anonymous["data"]) == 4 and all(i["is_saved"] is None for i in anonymous["data"])
