"""The staff dashboard, page shell and search box (staff UI redesign): real figures scoped to what the person may
see, no review count for people who cannot review, no shell before the second step, no inline script (the staff
CSP), and a search that cannot reveal another person's draft."""

from __future__ import annotations

import json
from typing import Any

import pytest
from django.core.cache import cache
from django.test import Client, override_settings
from django.urls import reverse

from accounts.models import User
from core import staff_dashboard
from tests.factories import World, approved, new_draft, published, submitted, varied

pytestmark = pytest.mark.django_db

INDEX = "/staff/"


def logged_in(user: User) -> Client:
    cache.clear()
    client = Client()
    client.force_login(user)
    return client


def kpi_values(user: User) -> dict[str, int]:
    return {k.key: k.value for k in staff_dashboard.kpis(user)}


def attention_counts(user: User) -> dict[str, int]:
    return {a.key: a.count for a in staff_dashboard.attention(user)}


def test_dashboard_figures_are_real_and_status_cards_never_double_count(
    world: World, people: dict[str, User]
) -> None:
    published(world, people["author"], people["editor"], example="jobs-1")
    submitted(world, people["author"], "tenders-1")
    approved(world, people["author"], people["editor"], "internships-1")
    new_draft(world, people["author"], "grants-1", **varied(world, "grants-1", "draft-a"))
    values = kpi_values(people["admin"])
    assert values["total"] == 4
    assert values["published"] == 1 and values["drafts"] == 1 and values["expired"] == 0
    # published + drafts + expired + (in review / approved / rejected / withdrawn / archived) = total
    assert values["published"] + values["drafts"] + values["expired"] <= values["total"]
    page = logged_in(people["admin"]).get(INDEX)
    assert page.status_code == 200
    body = page.content.decode()
    assert "Welcome back, " in body and "Needs attention" in body and "Recent activity" in body
    assert "Latest opportunities" in body


def test_numbers_are_scoped_to_what_the_person_may_see(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author"], "jobs-1", **varied(world, "jobs-1", "mine"))
    new_draft(world, people["author_editor"], "grants-1", **varied(world, "grants-1", "theirs"))
    assert kpi_values(people["author"])["total"] == 1  # a contributor sees only their own work
    assert kpi_values(people["editor"])["total"] == 0  # other people's drafts stay private to an editor
    assert kpi_values(people["admin"])["total"] == 2  # administrators read every draft (audited)


def test_review_count_needs_the_permission_and_excludes_your_own_submissions(
    world: World, people: dict[str, User]
) -> None:
    submitted(world, people["author_editor"], "tenders-1")  # authored and submitted by this editor
    submitted(world, people["author"], "grants-1", **varied(world, "grants-1", "other"))
    assert "review" not in attention_counts(people["author"])  # contributors cannot review
    assert attention_counts(people["author_editor"])["review"] == 1  # never their own submission
    assert attention_counts(people["editor"])["review"] == 2
    assert attention_counts(people["editor"])["employers"] == 0
    assert "reports" in attention_counts(people["editor"])
    assert "reports" not in attention_counts(people["author"])


def test_recent_activity_comes_from_the_workflow_history_and_respects_visibility(
    world: World, people: dict[str, User]
) -> None:
    submitted(world, people["author"], "tenders-1")
    new_draft(world, people["author_editor"], "grants-1", **varied(world, "grants-1", "secret-draft"))
    mine = staff_dashboard.recent_activity(people["author"])
    assert [a.verb for a in mine] == ["Submitted for review", "Draft created"]
    assert all(a.actor == "Test User" for a in mine)
    editor_titles = " ".join(a.subject for a in staff_dashboard.recent_activity(people["editor"]))
    assert "secret-draft" not in editor_titles
    assert "secret-draft" in " ".join(a.subject for a in staff_dashboard.recent_activity(people["admin"]))


def test_listing_rows_offer_only_actions_the_person_may_attempt(
    world: World, people: dict[str, User]
) -> None:
    opp = submitted(world, people["author"], "tenders-1")
    author_rows = staff_dashboard.listing_rows(people["author"])
    assert [r.pk for r in author_rows] == [str(opp.pk)]
    assert all("approve" not in url for url, _ in author_rows[0].actions)
    editor_urls = [url for url, _ in staff_dashboard.listing_rows(people["editor"])[0].actions]
    assert any(url.endswith("/approve/") for url in editor_urls)
    # the person who submitted a listing is never offered approval, even with the editor role
    mine = submitted(world, people["author_editor"], "grants-1", **varied(world, "grants-1", "own"))
    row = next(r for r in staff_dashboard.listing_rows(people["author_editor"]) if r.pk == str(mine.pk))
    assert all(not url.endswith(("/approve/", "/reject/")) for url, _ in row.actions)


def test_shell_shows_permitted_links_and_counts_only(world: World, people: dict[str, User]) -> None:
    submitted(world, people["author"], "tenders-1")
    editor = logged_in(people["editor"]).get(INDEX).content.decode()
    assert "Review queue" in editor and 'href="/staff/opportunities/opportunity/?queue=review"' in editor
    assert "Create opportunity" not in editor  # editors do not hold the draft-create permission
    assert "Audit log" not in editor and "Staff roles" not in editor
    author = logged_in(people["author"]).get(INDEX).content.decode()
    assert "Review queue" not in author and "Create opportunity" in author
    admin = logged_in(people["admin"]).get(INDEX).content.decode()
    assert "Audit log" in admin
    assert 'href="https://' in admin or "View public site" in admin


def test_shell_is_withheld_until_the_second_step_and_on_sign_in(
    world: World, people: dict[str, User], client: Any
) -> None:
    with override_settings(UPNEXT_STAFF_MFA_REQUIRED=True):
        c = logged_in(people["editor"])
        response = c.get("/staff/mfa/")
        body = response.content.decode()
        assert response.status_code == 200
        assert "Review queue" not in body and "staff-sidebar" not in body and "Waiting for you" not in body
    login = Client().get("/staff/login/").content.decode()
    assert "staff-sidebar" not in login and "Waiting for you" not in login


def test_pages_use_no_inline_script_or_event_handlers(world: World, people: dict[str, User]) -> None:
    client = logged_in(people["admin"])
    for url in (INDEX, "/staff/opportunities/opportunity/", "/staff/content-health/"):
        body = client.get(url).content.decode()
        assert "<script>" not in body and "javascript:" not in body, url
        assert " onclick=" not in body and " onchange=" not in body, url
        assert 'src="/static/core/staff.js"' in body and "staff-theme.js" in body, url


def test_illustration_is_in_the_banner_and_never_in_the_sidebar(
    world: World, people: dict[str, User]
) -> None:
    body = logged_in(people["editor"]).get(INDEX).content.decode()
    sidebar = body[body.index('id="staff-sidebar"') : body.index('class="scrim"')]
    assert "staff-welcome" not in sidebar
    banner = body[body.index('class="banner"') : body.index('class="kpi-section"')]
    assert "staff-welcome" in banner and 'alt=""' in banner


def test_closing_soon_card_links_to_the_matching_filter(world: World, people: dict[str, User]) -> None:
    cards = {k.key: k.href for k in staff_dashboard.kpis(people["admin"])}
    assert cards["closing"].endswith("?status__exact=published&deadline=soon")
    assert cards["drafts"].endswith("?status__exact=draft")


# --- opportunity list: columns and tabs ---------------------------------------------------------------------
def test_list_has_status_tabs_with_real_counts_and_an_action_menu(
    world: World, people: dict[str, User]
) -> None:
    published(world, people["author"], people["editor"], example="jobs-1")
    submitted(world, people["author"], "tenders-1")
    body = logged_in(people["editor"]).get("/staff/opportunities/opportunity/").content.decode()
    assert 'aria-label="Filter opportunities by status"' in body
    assert 'class="tabs__tab is-current"' in body  # "All" is current
    assert "Closing date" in body and "Location" in body and "Type" in body
    assert 'aria-label="Actions for ' in body and "View details" in body
    review = (
        logged_in(people["editor"]).get("/staff/opportunities/opportunity/?queue=review").content.decode()
    )
    assert "Submitted by" in review and "Submitted" in review


# --- search box ------------------------------------------------------------------------------------------
def search(client: Client, term: str) -> dict[str, Any]:
    response = client.get(reverse("staff-search"), {"q": term})
    assert response.status_code == 200
    assert response["Cache-Control"].startswith("max-age=0") or "no-cache" in response["Cache-Control"]
    data: dict[str, Any] = json.loads(response.content)
    return data


def test_search_requires_staff_sign_in(client: Any, people: dict[str, User]) -> None:
    assert Client().get(reverse("staff-search"), {"q": "solar"}).status_code == 302
    assert logged_in(people["seeker"]).get(reverse("staff-search"), {"q": "solar"}).status_code == 302


def test_search_finds_visible_listings_and_ignores_short_terms(world: World, people: dict[str, User]) -> None:
    submitted(world, people["author"], "tenders-1")
    editor = logged_in(people["editor"])
    assert search(editor, "s")["groups"] == []
    groups = search(editor, "solar")["groups"]
    assert groups and groups[0]["group"] == "Opportunities"
    assert groups[0]["items"][0]["label"].startswith("Supply of Solar")


def test_search_never_reveals_another_persons_draft(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author"], "grants-1", **varied(world, "grants-1", "zebra-secret"))
    assert search(logged_in(people["editor"]), "zebra-secret")["groups"] == []
    assert search(logged_in(people["author_editor"]), "zebra-secret")["groups"] == []
    assert search(logged_in(people["author"]), "zebra-secret")["groups"] != []
    assert search(logged_in(people["admin"]), "zebra-secret")["groups"] != []


def test_search_offers_organisations_only_to_people_who_may_open_them(
    world: World, people: dict[str, User]
) -> None:
    names = {g["group"] for g in search(logged_in(people["author"]), "example")["groups"]}
    assert "Organisations" in names  # contributors may create and view organisations
    assert search(logged_in(people["editor"]), "example")["groups"]


def test_activity_log_is_read_only_and_scoped(world: World, people: dict[str, User]) -> None:
    new_draft(world, people["author_editor"], "grants-1", **varied(world, "grants-1", "hidden-draft"))
    url = reverse("admin:opportunities_publishingevent_changelist")
    editor = logged_in(people["editor"]).get(url)
    assert editor.status_code == 200 and "hidden-draft" not in editor.content.decode()
    admin = logged_in(people["admin"]).get(url)
    assert "hidden-draft" in admin.content.decode()
    assert (
        logged_in(people["admin"]).get(reverse("admin:opportunities_publishingevent_add")).status_code == 403
    )
    assert logged_in(people["seeker"]).get(url).status_code == 302
