"""Report moderation in the Django Admin (M2): who sees what, the queue, actions, separation of duties, audit."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.cache import cache
from django.test import Client
from django.urls import reverse

from accounts.models import User
from audit.models import AuditEvent
from opportunities.models import Opportunity
from reports import services
from reports.models import ListingReport, ReportStatus
from tests.factories import World, published
from tests.test_admin import logged_in

pytestmark = pytest.mark.django_db

CHANGELIST = "/staff/reports/listingreport/"
NOTE = "Checked the source page and called the employer."


@pytest.fixture(autouse=True)
def _clear() -> None:
    cache.clear()


@pytest.fixture
def listing(world: World, people: dict[str, User]) -> Opportunity:
    return published(world, people["author_editor"], people["editor"])


@pytest.fixture
def report(listing: Opportunity) -> ListingReport:
    services.submit(
        str(listing.slug),
        {
            "reason": "payment_scam",
            "details": "They ask for a fee <script>alert(1)</script> before the interview.",
            "evidence_url": "https://example.org/proof",
            "contact_email": "reporter@example.org",
        },
        client_ident="c",
    )
    return ListingReport.objects.get()


def detail(report: ListingReport) -> str:
    return reverse("admin:reports_listingreport_change", args=[report.pk])


def act(client: Client, report: ListingReport, name: str, **data: Any) -> Any:
    report.refresh_from_db()
    payload = {"row_version": report.row_version, **data}
    return client.post(reverse("admin:reports_listingreport_action", args=[report.pk, name]), payload)


# --- access -----------------------------------------------------------------------------------------------
def test_staff_without_report_access_cannot_open_the_queue(
    report: ListingReport, people: dict[str, User]
) -> None:
    assert Client().get(CHANGELIST).status_code == 302
    assert logged_in(people["seeker"]).get(CHANGELIST).status_code == 302
    assert logged_in(people["author"]).get(CHANGELIST).status_code == 403
    assert logged_in(people["author"]).get(detail(report)).status_code in (403, 404)
    response = act(logged_in(people["author"]), report, "investigate")
    assert response.status_code in (403, 404)
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


def test_editors_and_administrators_see_the_queue(report: ListingReport, people: dict[str, User]) -> None:
    for name in ("editor", "editor2", "admin"):
        page = logged_in(people[name]).get(CHANGELIST)
        assert page.status_code == 200
        assert report.reference in page.content.decode()


def test_generic_admin_cannot_add_edit_or_delete(report: ListingReport, people: dict[str, User]) -> None:
    client = logged_in(people["admin"])
    assert client.get(CHANGELIST + "add/").status_code == 403
    assert client.get(CHANGELIST + f"{report.pk}/delete/").status_code in (403, 404)
    assert client.post(detail(report), {"status": "resolved"}).status_code == 405
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


# --- queue ---------------------------------------------------------------------------------------------------
def test_queue_filters_and_search(
    report: ListingReport, people: dict[str, User], listing: Opportunity
) -> None:
    client = logged_in(people["editor2"])
    assert report.reference in client.get(CHANGELIST + "?queue=new").content.decode()
    assert report.reference not in client.get(CHANGELIST + "?queue=mine").content.decode()
    assert report.reference not in client.get(CHANGELIST + "?queue=escalated").content.decode()
    assert report.reference not in client.get(CHANGELIST + "?queue=closed").content.decode()
    assert report.reference in client.get(CHANGELIST + "?reason__exact=payment_scam").content.decode()
    assert report.reference not in client.get(CHANGELIST + "?reason__exact=expired").content.decode()
    assert report.reference in client.get(CHANGELIST + f"?q={report.reference}").content.decode()
    act(client, report, "investigate")
    assert report.reference in client.get(CHANGELIST + "?queue=mine").content.decode()
    assert report.reference not in client.get(CHANGELIST + "?queue=new").content.decode()


def test_repeat_filter_lists_listings_with_several_open_reports(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    client = logged_in(people["editor2"])
    assert report.reference not in client.get(CHANGELIST + "?repeat=yes").content.decode()
    services.submit(
        str(listing.slug),
        {"reason": "expired", "details": "The closing date passed last month."},
        client_ident="d",
    )
    other = ListingReport.objects.exclude(pk=report.pk).get()
    body = client.get(CHANGELIST + "?repeat=yes").content.decode()
    assert report.reference in body and other.reference in body


def test_escalated_reports_are_listed_first(
    listing: Opportunity, report: ListingReport, people: dict[str, User]
) -> None:
    services.submit(
        str(listing.slug),
        {"reason": "expired", "details": "The closing date passed last month."},
        client_ident="d",
    )
    later = ListingReport.objects.exclude(pk=report.pk).get()
    client = logged_in(people["editor2"])
    act(client, later, "escalate", note=NOTE)
    body = client.get(CHANGELIST).content.decode()
    assert body.index(later.reference) < body.index(report.reference)


# --- case page ---------------------------------------------------------------------------------------------
def test_case_page_escapes_reporter_text_and_protects_the_link(
    report: ListingReport, people: dict[str, User]
) -> None:
    page = logged_in(people["editor2"]).get(detail(report))
    html = page.content.decode()
    assert page.status_code == 200
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;" in html
    assert 'href="https://example.org/proof" rel="noopener noreferrer nofollow" target="_blank"' in html
    assert "reporter@example.org" in html


def test_a_stored_non_https_link_is_not_rendered_as_a_link(
    report: ListingReport, people: dict[str, User]
) -> None:
    ListingReport.objects.filter(pk=report.pk).update(evidence_url="javascript:alert(1)")
    html = logged_in(people["editor2"]).get(detail(report)).content.decode()
    assert "javascript:alert" not in html


def test_participant_sees_notes_and_escalate_but_not_decisions(
    report: ListingReport, people: dict[str, User]
) -> None:
    html = logged_in(people["author_editor"]).get(detail(report)).content.decode()
    assert "Add investigation note" in html and "Escalate to an Administrator" in html
    assert "Dismiss" not in html.split("<h2>Actions</h2>")[1].split("<h2>History</h2>")[0]
    assert "separation of duties" in html


def test_independent_editor_sees_decision_forms(report: ListingReport, people: dict[str, User]) -> None:
    html = logged_in(people["editor2"]).get(detail(report)).content.decode()
    for label in ("Take for investigation", "Resolve", "Dismiss", "Act on the listing"):
        assert label in html


# --- actions -----------------------------------------------------------------------------------------------
def test_full_moderation_path_through_the_admin(report: ListingReport, people: dict[str, User]) -> None:
    client = logged_in(people["editor2"])
    assert act(client, report, "investigate").status_code == 302
    assert act(client, report, "note", note=NOTE).status_code == 302
    assert act(client, report, "resolve", resolution="no_action_needed", note=NOTE).status_code == 302
    report.refresh_from_db()
    assert report.status == ReportStatus.RESOLVED and report.closed_by_id == people["editor2"].pk
    page = client.get(detail(report)).content.decode()
    assert NOTE in page and "Resolved" in page
    assert AuditEvent.objects.filter(action="report.resolved", object_id=report.pk).exists()


def test_invalid_form_is_shown_again_with_errors_and_changes_nothing(
    report: ListingReport, people: dict[str, User]
) -> None:
    client = logged_in(people["editor2"])
    response = act(client, report, "dismiss", resolution="spam", note="short")
    assert response.status_code in (302, 400)
    body = (
        client.get(detail(report)).content.decode()
        if response.status_code == 302
        else response.content.decode()
    )
    assert "at least" in body or "Write at least" in body
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN
    response = act(client, report, "dismiss", resolution="not-a-reason", note=NOTE)
    assert response.status_code == 400
    assert act(client, report, "no-such-action").status_code == 404


def test_listing_action_through_the_admin_changes_the_listing_via_the_workflow(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    client = logged_in(people["editor2"])
    response = act(client, report, "listing", action="takedown", reason_code="fraud", reason=NOTE)
    assert response.status_code == 302
    listing.refresh_from_db()
    report.refresh_from_db()
    assert listing.status == "archived" and report.resolution == "listing_taken_down"
    assert AuditEvent.objects.filter(action="opportunity.takedown", object_id=listing.pk).exists()


def test_participant_cannot_decide_through_the_admin(
    report: ListingReport, listing: Opportunity, people: dict[str, User]
) -> None:
    client = logged_in(people["author_editor"])
    response = act(client, report, "dismiss", resolution="spam", note=NOTE)
    assert response.status_code == 302
    message = "".join(str(m) for m in response.wsgi_request._messages)
    assert "separation_of_duties" in message
    act(client, report, "listing", action="withdraw", reason=NOTE)
    listing.refresh_from_db()
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN and listing.status == "published"


def test_stale_form_is_refused(report: ListingReport, people: dict[str, User]) -> None:
    client = logged_in(people["editor2"])
    stale = report.row_version
    act(client, report, "note", note=NOTE)
    response = client.post(
        reverse("admin:reports_listingreport_action", args=[report.pk, "note"]),
        {"row_version": stale, "note": NOTE},
    )
    assert response.status_code == 302
    assert "changed" in "".join(str(m) for m in response.wsgi_request._messages)  # type: ignore[attr-defined]
    assert report.events.filter(action="note").count() == 1


def test_get_on_an_action_url_changes_nothing(report: ListingReport, people: dict[str, User]) -> None:
    client = logged_in(people["editor2"])
    response = client.get(reverse("admin:reports_listingreport_action", args=[report.pk, "investigate"]))
    assert response.status_code == 302
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN


def test_only_administrators_see_reopen(report: ListingReport, people: dict[str, User]) -> None:
    editor = logged_in(people["editor2"])
    act(editor, report, "dismiss", resolution="spam", note=NOTE)
    assert "Reopen" not in editor.get(detail(report)).content.decode().split("<h2>History</h2>")[0]
    admin_client = logged_in(people["admin"])
    assert "Reopen" in admin_client.get(detail(report)).content.decode()
    assert act(admin_client, report, "reopen", note=NOTE).status_code == 302
    report.refresh_from_db()
    assert report.status == ReportStatus.OPEN
