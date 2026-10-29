"""Two editors publishing with the same requested address at the same instant: one wins, one is told (D-47)."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from accounts.models import User
from opportunities import workflow
from opportunities.errors import SlugTaken
from opportunities.models import ListingStatus, Opportunity
from tests.factories import build_world, new_draft, varied
from tests.test_concurrency import make, race

pytestmark = pytest.mark.django_db(transaction=True)


def test_concurrent_publication_with_the_same_slug_yields_one_listing_and_one_409() -> None:
    one, two = make("slug-one@example.org", "editor"), make("slug-two@example.org", "editor")
    world = build_world(one)
    drafts = [
        new_draft(world, who, "jobs-1", **varied(world, "jobs-1", tag, slug_request="the-contested-address"))
        for who, tag in ((one, "a"), (two, "b"))
    ]

    def publish(who: User, draft: Opportunity) -> Callable[[], Opportunity]:
        return lambda: workflow.publish_direct(who, draft.pk, expected_row_version=draft.row_version)

    results = race(publish(one, drafts[0]), publish(two, drafts[1]))
    winners = [r for r in results if isinstance(r, Opportunity)]
    losers = [r for r in results if isinstance(r, SlugTaken)]
    assert len(winners) == 1 and len(losers) == 1, results
    assert losers[0].http_status == 409 and losers[0].fields["slug_request"][0][0] == "slug_taken"
    assert (
        Opportunity.objects.filter(slug="the-contested-address", status=ListingStatus.PUBLISHED).count() == 1
    )
    loser = next(d for d in drafts if d.pk != winners[0].pk)
    loser.refresh_from_db()
    assert loser.status == ListingStatus.DRAFT and loser.slug is None  # untouched, can pick another address
