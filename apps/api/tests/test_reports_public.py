"""Public reporting (M2): validation, abuse protection, privacy, and the rule that a report never changes a listing."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from opportunities.models import Opportunity, PublishingEvent
from reports import services
from reports.models import ListingReport, ReportEvent, ReportReason, ReportStatus
from tests.factories import World, published

pytestmark = pytest.mark.django_db

GOOD: dict[str, Any] = {
    "reason": "payment_scam",
    "details": "They asked me to pay a registration fee before the interview.",
}


@pytest.fixture(autouse=True)
def _clear_throttle() -> None:
    cache.clear()


@pytest.fixture
def listing(world: World, people: dict[str, User]) -> Opportunity:
    return published(world, people["author"], people["editor"])


def url(opp: Opportunity) -> str:
    return f"/api/v1/opportunities/{opp.slug}/reports"


def post(client: APIClient, opp: Opportunity, data: Any, **extra: Any) -> Any:
    return client.post(url(opp), data, format="json", **extra)


def test_report_is_accepted_and_stored(client: APIClient, listing: Opportunity) -> None:
    response = post(
        client,
        listing,
        {**GOOD, "evidence_url": "https://example.org/proof", "contact_email": "A@Example.org"},
    )
    assert response.status_code == 202
    reference = response.json()["reference"]
    report = ListingReport.objects.get(reference=reference)
    assert report.status == ReportStatus.OPEN
    assert report.reason == ReportReason.PAYMENT_SCAM
    assert report.evidence_url == "https://example.org/proof"
    assert report.contact_email == "a@example.org"
    assert report.opportunity_id == listing.pk
    assert report.live_version_id == listing.live_version_id
    assert list(report.events.values_list("action", flat=True)) == ["created"]


def test_a_report_never_changes_the_listing(client: APIClient, listing: Opportunity) -> None:
    before = (listing.status, listing.row_version, PublishingEvent.objects.count())
    for reason in ReportReason.values:
        client.defaults["REMOTE_ADDR"] = f"10.0.0.{len(reason)}{ReportReason.values.index(reason)}"
        cache.clear()
        assert post(client, listing, {**GOOD, "reason": reason}).status_code == 202
    listing.refresh_from_db()
    assert (listing.status, listing.row_version, PublishingEvent.objects.count()) == before
    assert listing.status == "published"


def test_audit_event_holds_no_free_text_and_no_address(client: APIClient, listing: Opportunity) -> None:
    post(
        client, listing, {**GOOD, "contact_email": "who@example.org", "evidence_url": "https://example.org/x"}
    )
    event = AuditEvent.objects.get(action="report.created")
    blob = str(event.changes) + str(event.object_id)
    assert "registration fee" not in blob and "who@example.org" not in blob and "example.org/x" not in blob
    assert event.actor_ref is None and event.actor_type == "anonymous"


@pytest.mark.parametrize(
    ("patch", "field"),
    [
        ({"reason": "nonsense"}, "reason"),
        ({"reason": None}, "reason"),
        ({"details": "short"}, "details"),
        ({"details": "x" * 2001}, "details"),
        ({"details": 12345}, "details"),
        ({"details": "bad \x00 control characters here"}, "details"),
        ({"evidence_url": "http://example.org/plain"}, "evidence_url"),
        ({"evidence_url": "javascript:alert(1)"}, "evidence_url"),
        ({"evidence_url": "https://example.org/" + "a" * 500}, "evidence_url"),
        ({"contact_email": "not-an-email"}, "contact_email"),
    ],
)
def test_invalid_input_is_refused_with_field_errors(
    client: APIClient, listing: Opportunity, patch: dict[str, Any], field: str
) -> None:
    response = post(client, listing, {**GOOD, **patch})
    assert response.status_code == 400
    body = response.json()["error"]
    assert body["code"] == "validation_failed"
    assert field in body["fields"]
    assert ListingReport.objects.count() == 0


def test_optional_fields_may_be_empty(client: APIClient, listing: Opportunity) -> None:
    assert post(client, listing, {**GOOD, "evidence_url": "", "contact_email": ""}).status_code == 202
    report = ListingReport.objects.get()
    assert report.contact_email is None and report.evidence_url is None


def test_body_must_be_a_json_object_and_not_huge(client: APIClient, listing: Opportunity) -> None:
    assert client.post(url(listing), "[1]", content_type="application/json").status_code == 400
    assert client.post(url(listing), "not json", content_type="application/json").status_code == 400
    big = post(client, listing, {**GOOD, "details": "x" * 20000})
    assert big.status_code == 413


def test_unknown_and_hidden_listings_look_identical(
    client: APIClient, world: World, people: dict[str, User]
) -> None:
    from tests.factories import approved

    unpublished = approved(world, people["author"], people["editor"])
    missing = client.post("/api/v1/opportunities/does-not-exist/reports", GOOD, format="json")
    hidden = client.post(f"/api/v1/opportunities/{unpublished.slug or 'x'}/reports", GOOD, format="json")
    assert missing.status_code == hidden.status_code == 404
    assert missing.json()["error"]["code"] == hidden.json()["error"]["code"] == "not_found"
    assert ListingReport.objects.count() == 0


def test_expired_listings_can_still_be_reported(client: APIClient, listing: Opportunity) -> None:
    Opportunity.objects.filter(pk=listing.pk).update(status="expired")
    assert post(client, listing, GOOD).status_code == 202


def test_honeypot_looks_like_success_but_stores_nothing(client: APIClient, listing: Opportunity) -> None:
    response = post(client, listing, {**GOOD, "website": "http://spam.example"})
    assert response.status_code == 202
    assert response.json()["reference"].startswith("R-")
    assert ListingReport.objects.count() == 0


def test_no_session_cookie_no_ip_stored(client: APIClient, listing: Opportunity) -> None:
    client.defaults["REMOTE_ADDR"] = "203.0.113.77"
    response = post(client, listing, GOOD)
    assert response.status_code == 202
    assert not response.cookies
    dumped = " ".join(str(v) for v in ListingReport.objects.values().first().values())  # type: ignore[union-attr]
    assert "203.0.113.77" not in dumped
    assert response["Cache-Control"].startswith("max-age=0") or "no-cache" in response["Cache-Control"]


def test_no_csrf_token_needed_for_anonymous_post(listing: Opportunity) -> None:
    strict = APIClient(enforce_csrf_checks=True)
    assert post(strict, listing, GOOD).status_code == 202


def test_rate_limit_per_client(client: APIClient, listing: Opportunity) -> None:
    codes = []
    for index in range(7):
        codes.append(post(client, listing, {**GOOD, "reason": ReportReason.values[index % 7]}).status_code)
    assert codes[:5] == [202] * 5
    assert codes[5:] == [429, 429]


def test_same_client_same_reason_collapses_into_one_open_report(
    client: APIClient, listing: Opportunity
) -> None:
    first = post(client, listing, GOOD).json()["reference"]
    second = post(client, listing, GOOD).json()["reference"]
    assert first == second
    report = ListingReport.objects.get()
    assert report.duplicate_count == 1
    assert list(report.events.values_list("action", flat=True)) == ["created", "repeated"]


def test_different_reason_or_client_is_a_separate_report(client: APIClient, listing: Opportunity) -> None:
    post(client, listing, GOOD)
    post(client, listing, {**GOOD, "reason": "expired"})
    other = APIClient(REMOTE_ADDR="198.51.100.9")
    post(other, listing, GOOD)
    assert ListingReport.objects.count() == 3


def test_repeat_after_closing_makes_a_new_report(
    client: APIClient, listing: Opportunity, people: dict[str, User]
) -> None:
    first = post(client, listing, GOOD).json()["reference"]
    ListingReport.objects.filter(reference=first).update(
        status="dismissed",
        resolution="spam",
        closed_by=people["admin"],
        closed_at=timezone.now(),
        dedupe_key="",
    )
    second = post(client, listing, GOOD).json()["reference"]
    assert second != first


def test_daily_cap_per_listing(listing: Opportunity, settings: Any) -> None:
    settings.UPNEXT_REPORT_LISTING_DAILY_CAP = 3
    for index in range(3):
        services.submit(listing.slug, GOOD, client_ident=f"client-{index}")
    with pytest.raises(services.ReportCapped):
        services.submit(listing.slug, GOOD, client_ident="client-9")
    # reports older than a day do not count
    ListingReport.objects.update(created_at=timezone.now() - timedelta(days=2))
    assert services.submit(listing.slug, GOOD, client_ident="client-9").reference


def test_slug_lookup_is_case_insensitive(listing: Opportunity) -> None:
    assert services.submit(listing.slug.upper(), GOOD, client_ident="c").reference


def test_reports_events_are_append_only(listing: Opportunity) -> None:
    services.submit(listing.slug, GOOD, client_ident="c")
    event = ReportEvent.objects.get()
    from django.db import DatabaseError, transaction

    with pytest.raises(DatabaseError), transaction.atomic():
        ReportEvent.objects.filter(pk=event.pk).update(note="changed")
    with pytest.raises(DatabaseError), transaction.atomic():
        event.delete()


def test_database_refuses_inconsistent_report_rows(listing: Opportunity, people: dict[str, User]) -> None:
    from django.db import IntegrityError, transaction

    services.submit(listing.slug, GOOD, client_ident="c")
    with pytest.raises(IntegrityError), transaction.atomic():
        ListingReport.objects.update(status="resolved")  # closed without outcome and closer
    with pytest.raises(IntegrityError), transaction.atomic():
        ListingReport.objects.update(resolution="spam")  # open with an outcome


def test_purge_clears_contact_and_key_of_old_closed_reports(
    listing: Opportunity, people: dict[str, User]
) -> None:
    services.submit(listing.slug, {**GOOD, "contact_email": "a@example.org"}, client_ident="c1")
    services.submit(
        listing.slug, {**GOOD, "reason": "expired", "contact_email": "b@example.org"}, client_ident="c2"
    )
    old, fresh = ListingReport.objects.order_by("created_at")
    now = timezone.now()
    ListingReport.objects.filter(pk=old.pk).update(
        status="resolved",
        resolution="no_action_needed",
        closed_by=people["admin"],
        closed_at=now - timedelta(days=31),
    )
    ListingReport.objects.filter(pk=fresh.pk).update(
        status="resolved",
        resolution="no_action_needed",
        closed_by=people["admin"],
        closed_at=now - timedelta(days=2),
    )
    assert services.purge_closed(now) == 1
    old.refresh_from_db(), fresh.refresh_from_db()
    assert old.contact_email is None and old.dedupe_key == ""
    assert fresh.contact_email == "b@example.org" and fresh.dedupe_key != ""
    assert services.purge_closed(now) == 0


def test_deleting_an_account_clears_its_address_from_reports(listing: Opportunity, make_user: Any) -> None:
    from datetime import timedelta as td

    from accounts import deletion

    user = make_user(email="reporter@example.org")
    services.submit(listing.slug, {**GOOD, "contact_email": "Reporter@Example.org"}, client_ident="a")
    services.submit(
        listing.slug, {**GOOD, "reason": "expired", "contact_email": "other@example.org"}, client_ident="b"
    )
    user.deletion_requested_at = timezone.now() - td(days=30)
    user.save()
    assert deletion.execute(user.pk) is True
    contacts = sorted(str(r.contact_email) for r in ListingReport.objects.all())
    assert contacts == ["None", "other@example.org"]
