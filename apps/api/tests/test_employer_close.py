"""An employer member closes their own organisation's published listing (opp.withdraw_own, T10 variant).

Closing removes content and never adds it, so it is a one-person safety action like T10; everything else about
review, verification and publication stays with staff (D-18, D-22)."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from accounts.models import User
from audit.models import AuditEvent
from employers import listings, services
from employers.models import MemberRole
from opportunities import workflow
from opportunities.errors import InvalidTransition, NotFoundError, PermissionDeniedError, ValidationFailed
from opportunities.models import ListingStatus, PublishingEvent
from tests.factories import World

from .test_employer_api import J, send, signed_in
from .test_employers import published_listing, verified_member

pytestmark = pytest.mark.django_db


@pytest.fixture
def employer(make_user: Callable[..., User]) -> User:
    return make_user(email="employer@example.org", display_name="Employer One")


REASON = "The position has been filled."


def test_a_member_closes_their_own_published_listing(
    employer: User,
    people: dict[str, User],
    world: World,
) -> None:
    _, opp = published_listing(employer, people, world)
    assert "close" in listings.next_actions(employer, opp)
    closed = listings.close(employer, opp.pk, opp.row_version, REASON)
    assert closed.status == ListingStatus.WITHDRAWN and closed.closed_at is not None
    event = PublishingEvent.objects.filter(opportunity=opp).order_by("occurred_at").last()
    assert event is not None and event.transition == "T10" and event.actor_id == employer.pk
    assert event.reason == REASON
    audit = AuditEvent.objects.filter(action="opportunity.withdraw", object_id=opp.pk).get()
    assert audit.changes["capacity"] == "employer"  # type: ignore[index]
    opp.refresh_from_db()
    assert "close" not in listings.next_actions(employer, opp)


def test_closing_needs_a_reason_and_a_published_listing(
    employer: User,
    people: dict[str, User],
    world: World,
) -> None:
    _, opp = published_listing(employer, people, world)
    with pytest.raises(ValidationFailed):
        listings.close(employer, opp.pk, opp.row_version, "short")
    listings.close(employer, opp.pk, opp.row_version, REASON)
    opp.refresh_from_db()
    with pytest.raises(InvalidTransition):
        listings.close(employer, opp.pk, opp.row_version, REASON)


def test_only_a_current_member_of_that_organisation_can_close(
    employer: User,
    people: dict[str, User],
    world: World,
    make_user: Callable[..., User],
) -> None:
    org, opp = published_listing(employer, people, world)
    stranger = make_user(email="stranger@example.org")
    with pytest.raises(NotFoundError):
        listings.close(stranger, opp.pk, opp.row_version, REASON)
    other = make_user(email="other-employer@example.org")
    verified_member(people["editor"], other, name="Another Company Limited")
    with pytest.raises(NotFoundError):
        listings.close(other, opp.pk, opp.row_version, REASON)
    # Directly through the service the capability check refuses too.
    with pytest.raises(PermissionDeniedError):
        workflow.withdraw_own(other, opp.pk, expected_row_version=opp.row_version, reason=REASON)
    # A revoked member loses the right at once.
    membership = services.active_membership(employer, org.pk)
    assert membership is not None
    services.revoke_membership(people["admin"], membership.pk, reason="Left the company in 2026.")
    with pytest.raises(NotFoundError):
        listings.close(employer, opp.pk, opp.row_version, REASON)
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED


def test_a_member_still_cannot_take_down_or_withdraw_through_the_staff_actions(
    employer: User,
    people: dict[str, User],
    world: World,
) -> None:
    _, opp = published_listing(employer, people, world)
    with pytest.raises(PermissionDeniedError):
        workflow.withdraw(employer, opp.pk, expected_row_version=opp.row_version, reason=REASON)
    with pytest.raises(PermissionDeniedError):
        workflow.takedown(
            employer, opp.pk, expected_row_version=opp.row_version, reason_code="error", reason=REASON
        )
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED


def test_the_api_closes_a_listing_and_validates_the_request(
    employer: User,
    people: dict[str, User],
    world: World,
) -> None:
    _, opp = published_listing(employer, people, world)
    web = signed_in(employer)
    url = f"{J}/listings/{opp.pk}/close"
    assert send(web, "post", url, {"reason": REASON}).status_code == 400  # no row_version
    assert send(web, "post", url, {"row_version": opp.row_version}).status_code == 400  # no reason
    assert send(web, "post", url, {"row_version": opp.row_version, "reason": "short"}).status_code == 400
    assert send(web, "post", url, {"row_version": opp.row_version + 9, "reason": REASON}).status_code == 409
    done = send(web, "post", url, {"row_version": opp.row_version, "reason": REASON})
    assert done.status_code == 200 and done.json()["status"] == "withdrawn"
    assert (
        send(web, "post", url, {"row_version": done.json()["row_version"], "reason": REASON}).status_code
        == 409
    )


def test_the_api_hides_listings_of_other_organisations_from_the_close_action(
    employer: User,
    people: dict[str, User],
    world: World,
    make_user: Callable[..., User],
) -> None:
    _, opp = published_listing(employer, people, world)
    other = make_user(email="rival@example.org")
    verified_member(people["editor"], other, name="Rival Company Limited", role=MemberRole.OWNER)
    response = send(
        signed_in(other),
        "post",
        f"{J}/listings/{opp.pk}/close",
        {"row_version": opp.row_version, "reason": REASON},
    )
    assert response.status_code == 404
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED
