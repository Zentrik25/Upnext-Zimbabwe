"""Staff handling of reports (M2): permissions, separation of duties, listing actions, audit, concurrency."""

from __future__ import annotations

from typing import Any

import pytest

from accounts.models import User
from audit.models import AuditEvent
from opportunities.errors import (
    InvalidTransition,
    PermissionDeniedError,
    SeparationOfDuties,
    StateConflict,
    ValidationFailed,
)
from opportunities.models import Opportunity, PublishingEvent
from reports import moderation, services
from reports.models import ListingReport, ReportEvent, ReportStatus
from tests.factories import World, published

pytestmark = pytest.mark.django_db

NOTE = "Checked the source page and called the employer."


@pytest.fixture
def listing(world: World, people: dict[str, User]) -> Opportunity:
    # authored and submitted by author_editor, approved and published by editor
    return published(world, people["author_editor"], people["editor"])


@pytest.fixture
def report(listing: Opportunity) -> ListingReport:
    services.submit(
        listing.slug,
        {"reason": "fake_job", "details": "The company does not exist, I checked."},
        client_ident="c",
    )
    return ListingReport.objects.get()


def v(report: ListingReport) -> int:
    report.refresh_from_db()
    return report.row_version


def test_full_path_open_investigate_note_resolve(report: ListingReport, people: dict[str, User]) -> None:
    editor2 = people["editor2"]
    moderation.investigate(editor2, report.pk, expected_row_version=v(report))
    moderation.add_note(editor2, report.pk, expected_row_version=v(report), note=NOTE)
    moderation.resolve(
        editor2, report.pk, expected_row_version=v(report), resolution="no_action_needed", note=NOTE
    )
    report.refresh_from_db()
    assert report.status == ReportStatus.RESOLVED
    assert report.resolution == "no_action_needed"
    assert report.closed_by_id == editor2.pk and report.closed_at is not None
    assert report.assigned_to_id == editor2.pk
    assert list(report.events.values_list("action", flat=True)) == [
        "created",
        "investigating",
        "note",
        "resolved",
    ]
    actions = set(AuditEvent.objects.filter(object_id=report.pk).values_list("action", flat=True))
    assert {"report.created", "report.investigating", "report.note", "report.resolved"} <= actions


def test_audit_never_holds_the_note_text(report: ListingReport, people: dict[str, User]) -> None:
    moderation.add_note(people["editor2"], report.pk, expected_row_version=v(report), note=NOTE)
    for event in AuditEvent.objects.filter(object_id=report.pk):
        assert NOTE not in str(event.changes)


def test_dismiss_needs_a_reason_from_the_list(report: ListingReport, people: dict[str, User]) -> None:
    with pytest.raises(ValidationFailed):
        moderation.dismiss(
            people["editor2"], report.pk, expected_row_version=v(report), resolution="x", note=NOTE
        )
    with pytest.raises(ValidationFailed):  # a resolved outcome is not a dismissal reason
        moderation.dismiss(
            people["editor2"],
            report.pk,
            expected_row_version=v(report),
            resolution="no_action_needed",
            note=NOTE,
        )
    moderation.dismiss(
        people["editor2"], report.pk, expected_row_version=v(report), resolution="spam", note=NOTE
    )
    report.refresh_from_db()
    assert report.status == ReportStatus.DISMISSED and report.resolution == "spam"


def test_listing_outcomes_cannot_be_chosen_without_acting(
    report: ListingReport, people: dict[str, User]
) -> None:
    for outcome in ("listing_expired", "listing_withdrawn", "listing_taken_down", "bogus"):
        with pytest.raises(ValidationFailed):
            moderation.resolve(
                people["editor2"], report.pk, expected_row_version=v(report), resolution=outcome, note=NOTE
            )


@pytest.mark.parametrize("note", [None, "", "short", "x" * 2001, "bad \x00 control chars in note"])
def test_notes_are_validated(report: ListingReport, people: dict[str, User], note: Any) -> None:
    with pytest.raises(ValidationFailed):
        moderation.add_note(people["editor2"], report.pk, expected_row_version=v(report), note=note)


def test_roles_without_report_permissions_are_refused(report: ListingReport, people: dict[str, User]) -> None:
    for name in ("author", "seeker"):
        user = people[name]
        with pytest.raises(PermissionDeniedError):
            moderation.investigate(user, report.pk, expected_row_version=v(report))
        with pytest.raises(PermissionDeniedError):
            moderation.resolve(
                user, report.pk, expected_row_version=v(report), resolution="no_action_needed", note=NOTE
            )
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN and report.events.count() == 1


def test_a_participant_cannot_decide_but_can_note_and_escalate(
    report: ListingReport, people: dict[str, User], listing: Opportunity
) -> None:
    author_editor = people["author_editor"]
    assert moderation.is_participant(author_editor, listing)
    assert not moderation.is_participant(people["editor2"], listing)
    moderation.add_note(author_editor, report.pk, expected_row_version=v(report), note=NOTE)
    with pytest.raises(SeparationOfDuties):
        moderation.resolve(
            author_editor, report.pk, expected_row_version=v(report), resolution="no_action_needed", note=NOTE
        )
    with pytest.raises(SeparationOfDuties):
        moderation.dismiss(
            author_editor, report.pk, expected_row_version=v(report), resolution="spam", note=NOTE
        )
    with pytest.raises(SeparationOfDuties):
        moderation.act_on_listing(
            author_editor, report.pk, expected_row_version=v(report), action="withdraw", reason=NOTE
        )
    moderation.escalate(author_editor, report.pk, expected_row_version=v(report), note=NOTE)
    report.refresh_from_db()
    assert report.status == ReportStatus.ESCALATED
    listing.refresh_from_db()
    assert listing.status == "published"


def test_escalated_reports_are_closed_by_administrators_only(
    report: ListingReport, people: dict[str, User]
) -> None:
    moderation.escalate(people["author_editor"], report.pk, expected_row_version=v(report), note=NOTE)
    with pytest.raises(PermissionDeniedError):
        moderation.dismiss(
            people["editor2"], report.pk, expected_row_version=v(report), resolution="spam", note=NOTE
        )
    with pytest.raises(PermissionDeniedError):
        moderation.reopen(people["editor2"], report.pk, expected_row_version=v(report), note=NOTE)
    moderation.dismiss(
        people["admin"], report.pk, expected_row_version=v(report), resolution="spam", note=NOTE
    )
    report.refresh_from_db()
    assert report.status == ReportStatus.DISMISSED and report.closed_by_id == people["admin"].pk


def test_reopen_restores_an_open_report_for_administrators(
    report: ListingReport, people: dict[str, User]
) -> None:
    moderation.dismiss(
        people["editor2"], report.pk, expected_row_version=v(report), resolution="spam", note=NOTE
    )
    moderation.reopen(people["admin"], report.pk, expected_row_version=v(report), note=NOTE)
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN
    assert report.resolution == "" and report.closed_by_id is None and report.closed_at is None
    with pytest.raises(InvalidTransition):
        moderation.reopen(people["admin"], report.pk, expected_row_version=v(report), note=NOTE)


def test_closed_reports_cannot_be_worked(report: ListingReport, people: dict[str, User]) -> None:
    moderation.dismiss(
        people["editor2"], report.pk, expected_row_version=v(report), resolution="spam", note=NOTE
    )
    for call in (
        lambda: moderation.investigate(people["editor2"], report.pk, expected_row_version=v(report)),
        lambda: moderation.add_note(people["editor2"], report.pk, expected_row_version=v(report), note=NOTE),
        lambda: moderation.escalate(people["editor2"], report.pk, expected_row_version=v(report), note=NOTE),
        lambda: moderation.dismiss(
            people["editor2"], report.pk, expected_row_version=v(report), resolution="spam", note=NOTE
        ),
    ):
        with pytest.raises(InvalidTransition):
            call()


def test_stale_row_version_is_a_conflict(report: ListingReport, people: dict[str, User]) -> None:
    stale = v(report)
    moderation.add_note(people["editor2"], report.pk, expected_row_version=stale, note=NOTE)
    with pytest.raises(StateConflict):
        moderation.add_note(people["editor2"], report.pk, expected_row_version=stale, note=NOTE)


@pytest.mark.parametrize(
    ("action", "status", "outcome"),
    [("expire", "expired", "listing_expired"), ("withdraw", "withdrawn", "listing_withdrawn")],
)
def test_listing_action_goes_through_the_workflow(
    report: ListingReport,
    listing: Opportunity,
    people: dict[str, User],
    action: str,
    status: str,
    outcome: str,
) -> None:
    before = PublishingEvent.objects.filter(opportunity=listing).count()
    moderation.act_on_listing(
        people["editor2"], report.pk, expected_row_version=v(report), action=action, reason=NOTE
    )
    listing.refresh_from_db()
    report.refresh_from_db()
    assert listing.status == status
    assert report.status == ReportStatus.RESOLVED and report.resolution == outcome
    assert PublishingEvent.objects.filter(opportunity=listing).count() == before + 1
    event = report.events.get(action="listing_action")
    assert event.listing_event is not None and event.listing_event.opportunity_id == listing.pk
    assert event.listing_event.reason is not None and report.reference in event.listing_event.reason


def test_takedown_archives_and_needs_a_valid_code(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    with pytest.raises(ValidationFailed):
        moderation.act_on_listing(
            people["editor2"],
            report.pk,
            expected_row_version=v(report),
            action="takedown",
            reason=NOTE,
            reason_code="nonsense",
        )
    listing.refresh_from_db()
    assert listing.status == "published"  # a refused action changes nothing
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN
    moderation.act_on_listing(
        people["editor2"],
        report.pk,
        expected_row_version=v(report),
        action="takedown",
        reason=NOTE,
        reason_code="fraud",
    )
    listing.refresh_from_db()
    report.refresh_from_db()
    assert listing.status == "archived" and report.resolution == "listing_taken_down"


def test_unknown_action_and_unpermitted_staff_leave_the_listing_alone(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    with pytest.raises(ValidationFailed):
        moderation.act_on_listing(
            people["editor2"], report.pk, expected_row_version=v(report), action="delete", reason=NOTE
        )
    with pytest.raises(PermissionDeniedError):
        moderation.act_on_listing(
            people["author"], report.pk, expected_row_version=v(report), action="withdraw", reason=NOTE
        )
    listing.refresh_from_db()
    assert listing.status == "published"


def test_report_history_survives_and_is_ordered(report: ListingReport, people: dict[str, User]) -> None:
    moderation.investigate(people["editor2"], report.pk, expected_row_version=v(report))
    moderation.escalate(people["editor2"], report.pk, expected_row_version=v(report), note=NOTE)
    events = list(ReportEvent.objects.filter(report=report))
    assert [e.action for e in events] == ["created", "investigating", "escalated"]
    assert events[2].from_status == "investigating" and events[2].to_status == "escalated"
