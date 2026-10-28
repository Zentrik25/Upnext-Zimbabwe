"""Reports under concurrency (M2): real threads and real transactions on PostgreSQL."""

from __future__ import annotations

import pytest

from accounts.models import User
from opportunities.errors import InvalidTransition, StateConflict
from opportunities.models import Opportunity
from reports import moderation, services
from reports.models import ListingReport, ReportStatus
from tests.factories import World, published
from tests.test_concurrency import race

pytestmark = pytest.mark.django_db(transaction=True)

GOOD = {"reason": "fake_job", "details": "The company does not exist, I checked."}
NOTE = "Checked the source page and called the employer."


@pytest.fixture
def listing(world: World, people: dict[str, User]) -> Opportunity:
    return published(world, people["author_editor"], people["editor"])


def test_the_same_client_reporting_at_once_makes_one_report(listing: Opportunity) -> None:
    results = race(*[lambda: services.submit(listing.slug, GOOD, client_ident="same") for _ in range(6)])

    assert not [r for r in results if isinstance(r, Exception)], results
    assert len({r.reference for r in results}) == 1  # type: ignore[union-attr]
    report = ListingReport.objects.get()
    assert report.duplicate_count == 5
    assert report.events.filter(action="repeated").count() == 5


def test_different_clients_at_once_each_get_their_own_report(listing: Opportunity) -> None:
    results = race(*[lambda i=i: services.submit(listing.slug, GOOD, client_ident=f"c{i}") for i in range(5)])

    assert not [r for r in results if isinstance(r, Exception)], results
    assert ListingReport.objects.count() == 5


def test_two_staff_deciding_the_same_report_at_once_one_wins(
    listing: Opportunity, people: dict[str, User]
) -> None:
    services.submit(listing.slug, GOOD, client_ident="c")
    report = ListingReport.objects.get()
    version = report.row_version

    results = race(
        lambda: moderation.dismiss(
            people["editor"], report.pk, expected_row_version=version, resolution="spam", note=NOTE
        ),
        lambda: moderation.act_on_listing(
            people["editor2"], report.pk, expected_row_version=version, action="withdraw", reason=NOTE
        ),
    )

    errors = [r for r in results if isinstance(r, Exception)]
    assert all(isinstance(e, StateConflict | InvalidTransition) for e in errors), errors
    assert len(errors) == 1  # exactly one of the two decisions was applied
    report.refresh_from_db()
    assert report.status in (ReportStatus.DISMISSED, ReportStatus.RESOLVED)
    assert report.events.filter(action__in=["dismissed", "listing_action"]).count() == 1
