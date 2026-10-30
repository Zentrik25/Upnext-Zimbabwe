"""The dashboard figures behind `/api/v1/staff/dashboard` (D-46): real counts scoped to what the person may see, no
review count for people who cannot review or for their own submissions, and activity from the workflow history."""

from __future__ import annotations

import pytest

from accounts.models import User
from core import staff_dashboard
from tests.factories import World, approved, new_draft, published, submitted, varied

pytestmark = pytest.mark.django_db


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
