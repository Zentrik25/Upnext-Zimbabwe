"""Draft-only import and content health (P5-06). The editorial rules must hold for everything an import makes."""

from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client

from accounts.models import User
from audit.models import AuditEvent
from opportunities import health, importer, workflow
from opportunities.errors import WorkflowError
from opportunities.models import Opportunity, OpportunityVersion, VersionState
from tests.factories import CHECKLIST, World, published


def item(world: World, n: int = 1, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "category": "jobs",
        "organisation": "Example Power Services",
        "title": f"Imported maintenance technician {n}",
        "summary": "A technician post; the notice does not state the pay.",
        "description_md": "Maintains substations. Pay is not stated in the notice.",
        "locations": ["harare"],
        "sectors": ["engineering"],
        "application_method": "external_url",
        "application_url": f"https://careers.example.org/apply/{n}",
        "sources": [
            {
                "kind": "issuer_website",
                "name": "Employer careers page",
                "url": f"https://careers.example.org/jobs/{n}",
                "citation": None,
                "observed_on": "2026-10-10",
                "is_primary": True,
            }
        ],
    }
    base.update(overrides)
    return base


@pytest.fixture
def writer(people: dict[str, User]) -> User:
    return people["author"]


def test_a_valid_row_becomes_a_draft_authored_by_the_importer(db: None, world: World, writer: User) -> None:
    results = importer.import_drafts(writer, [item(world)], dry_run=False)
    assert [r.status for r in results] == ["created"], results[0].problems
    assert results[0].opportunity_id is not None
    opp = Opportunity.objects.get(pk=results[0].opportunity_id)
    assert opp.pending_version_id is not None
    version = OpportunityVersion.objects.get(pk=opp.pending_version_id)
    assert version.state == VersionState.DRAFT and version.author_id == writer.pk
    assert opp.status == "draft" and opp.live_version_id is None
    event = AuditEvent.objects.get(action="opportunity.import_batch")
    assert event.actor_ref == writer.pk and (event.changes or {})["created"] == 1


def test_a_dry_run_writes_nothing(db: None, world: World, writer: User) -> None:
    before = Opportunity.objects.count()
    results = importer.import_drafts(writer, [item(world)], dry_run=True)
    assert [r.status for r in results] == ["would_create"]
    assert Opportunity.objects.count() == before
    assert not AuditEvent.objects.filter(action="opportunity.import_batch").exists()


@pytest.mark.parametrize(
    ("change", "fragment"),
    [
        ({"organisation": "No Such Issuer"}, "does not exist"),
        ({"category": "nonsense"}, "category"),
        ({"locations": ["atlantis"]}, "unknown location"),
        ({"sectors": ["nonsense"]}, "unknown sector"),
        ({"skills": ["Telepathy"]}, "unknown or unapproved skill"),
        ({"title": "x" * 300}, "title"),
        ({"surprise": 1}, "surprise"),
    ],
)
def test_invalid_rows_are_reported_with_a_reason(
    db: None, world: World, writer: User, change: dict[str, Any], fragment: str
) -> None:
    results = importer.import_drafts(writer, [item(world, **change)], dry_run=True)
    assert results[0].status == "invalid"
    assert any(fragment in p for p in results[0].problems), results[0].problems


def test_a_primary_source_already_in_the_catalogue_is_a_duplicate(
    db: None, world: World, people: dict[str, User], writer: User
) -> None:
    importer.import_drafts(writer, [item(world, 1)], dry_run=False)
    again = importer.import_drafts(writer, [item(world, 1, title="Same listing again")], dry_run=True)
    assert again[0].status == "duplicate"


def test_an_importer_cannot_approve_or_verify_their_own_drafts(
    db: None, world: World, people: dict[str, User], writer: User
) -> None:
    writer_editor = people["author_editor"]  # holds the editor role too: still the author of what they import
    result = importer.import_drafts(writer_editor, [item(world, 7)], dry_run=False)[0]
    assert result.opportunity_id is not None
    opp = Opportunity.objects.get(pk=result.opportunity_id)
    # The imported row is a minimal draft; the author completes it like any other draft before submitting.
    _, full = world.content("jobs-1")
    workflow.save_draft(writer_editor, opp.pk, expected_row_version=opp.row_version, content=full)
    opp.refresh_from_db()
    workflow.submit(writer_editor, opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    with pytest.raises(WorkflowError):
        workflow.approve(writer_editor, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    workflow.approve(
        people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST
    )  # someone else can


def test_a_seeker_cannot_import(db: None, world: World, people: dict[str, User]) -> None:
    with pytest.raises(WorkflowError):
        importer.import_drafts(people["seeker"], [item(world)], dry_run=False)


def test_the_importer_can_reach_no_other_editorial_transition() -> None:
    """Static guarantee: importer.py imports create_draft from the workflow and nothing else of it."""
    tree = ast.parse(Path(importer.__file__).read_text())
    from_workflow = [
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module == "workflow"
        for alias in node.names
    ]
    assert from_workflow == ["create_draft"]
    plain = [
        alias.name
        for n in ast.walk(tree)
        if isinstance(n, ast.ImportFrom) and n.level == 1 and n.module is None
        for alias in n.names
    ]
    assert "workflow" not in plain  # no `from . import workflow`, which would expose every transition
    names = {
        n.attr if isinstance(n, ast.Attribute) else n.id
        for n in ast.walk(tree)
        if isinstance(n, (ast.Name, ast.Attribute))
    }
    for forbidden in (
        "submit",
        "approve",
        "publish",
        "record_verification",
        "withdraw",
        "takedown",
        "reject",
    ):
        assert forbidden not in names


def test_the_command_refuses_to_write_when_any_row_is_bad(
    db: None, world: World, writer: User, tmp_path: Path
) -> None:
    f = tmp_path / "in.json"
    f.write_text(json.dumps([item(world, 1), item(world, 2, organisation="Nobody")]))
    with pytest.raises(CommandError, match="nothing was written"):
        call_command("import_drafts", str(f), "--as", writer.email)
    assert Opportunity.objects.count() == 0
    call_command("import_drafts", str(f), "--as", writer.email, "--skip-invalid")
    assert Opportunity.objects.count() == 1


def test_the_command_reads_json_lines_and_rejects_a_bad_file(
    db: None, world: World, writer: User, tmp_path: Path
) -> None:
    f = tmp_path / "in.jsonl"
    f.write_text("\n".join(json.dumps(item(world, n)) for n in (1, 2)))
    call_command("import_drafts", str(f), "--as", writer.email, "--dry-run")
    assert Opportunity.objects.count() == 0
    call_command("import_drafts", str(f), "--as", writer.email)
    assert Opportunity.objects.count() == 2
    bad = tmp_path / "bad.json"
    bad.write_text('{"not": "a list"} 5')
    with pytest.raises((CommandError, ValueError)):
        call_command("import_drafts", str(bad), "--as", writer.email)
    with pytest.raises(CommandError):
        call_command("import_drafts", str(f), "--as", "nobody@example.org")


# --- content health -------------------------------------------------------------------------------------------------


def test_health_counts_live_listings_and_the_target(db: None, world: World, people: dict[str, User]) -> None:
    published(world, people["author"], people["editor"])
    data = health.report()
    assert data["target"]["listings"]["current_live"] == 1
    assert data["target"]["issuers"]["have"] == 1
    assert data["target"]["met"] is False
    assert data["target"]["categories"]["goal"] == 6
    assert data["live_per_category"]["jobs"] == 1
    assert data["sod_violations"] == []


def test_the_audit_finds_a_broken_rule_when_the_triggers_are_bypassed(
    db: None, world: World, people: dict[str, User]
) -> None:
    from django.db import connection

    opp = published(world, people["author"], people["editor"])
    version_id = opp.live_version_id
    with connection.cursor() as cur:
        cur.execute("SET session_replication_role = replica")  # what a restore or a bad migration could do
        cur.execute(
            "UPDATE opportunities_opportunityversion SET approved_by_id = author_id WHERE id = %s",
            [version_id],
        )
        cur.execute("SET session_replication_role = DEFAULT")
    violations = health.sod_violations()
    assert {"rule": "approved_by_author_or_submitter", "version_id": str(version_id)} in violations
    with pytest.raises(CommandError):
        call_command("content_health")


def test_the_command_prints_the_report(db: None, capsys: pytest.CaptureFixture[str]) -> None:
    call_command("content_health")
    assert "target met: False" in capsys.readouterr().out
    call_command("content_health", "--json")


def test_the_staff_page_is_for_editors_and_administrators_only(
    db: None, people: dict[str, User], world: World
) -> None:
    published(world, people["author"], people["editor"])

    def get(user: User | None) -> Any:
        c = Client(HTTP_HOST="localhost")
        if user is not None:
            c.force_login(user)
            s = c.session
            s["mfa_ok"] = True
            s.save()
        return c.get("/django-admin/content-health/", secure=True)

    assert get(None).status_code == 302  # to the staff sign-in
    assert get(people["seeker"]).status_code in (302, 403)
    assert get(people["author"]).status_code == 403  # a contributor has no use for it
    page = get(people["editor"])
    assert page.status_code == 200
    html = page.content.decode()
    assert "Launch target" in html and "Separation-of-duties audit" in html
    assert get(people["admin"]).status_code == 200
