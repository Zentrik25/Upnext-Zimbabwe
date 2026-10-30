"""Whose address the anonymous-read limit counts (hardening audit, Part 3 / Part 10).

In production the web container renders public pages and reads the API over the internal network, so every such
read arrives from that one container address. The limit is only per visitor if the web tier passes the visitor's
address on in `X-Forwarded-For` (nginx has already replaced that header with the real client address, so a
browser cannot choose it). This pins the contract the web tier relies on.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.core.cache import cache, caches
from rest_framework.test import APIClient

from api.throttles import PublicReadThrottle

pytestmark = pytest.mark.django_db

WEB_CONTAINER = "172.20.0.5"


@pytest.fixture
def tight_limit() -> Iterator[None]:
    original = PublicReadThrottle.THROTTLE_RATES
    PublicReadThrottle.THROTTLE_RATES = {**original, "public_read": "3/1m"}
    cache.clear()
    caches["local"].clear()
    try:
        yield
    finally:
        PublicReadThrottle.THROTTLE_RATES = original
        cache.clear()
        caches["local"].clear()


def read(client: APIClient, forwarded_for: str | None = None) -> int:
    extra: dict[str, Any] = {"REMOTE_ADDR": WEB_CONTAINER}
    if forwarded_for:
        extra["HTTP_X_FORWARDED_FOR"] = forwarded_for
    return client.get("/api/v1/categories", **extra).status_code


def test_reads_without_a_forwarded_address_all_count_against_the_web_container(tight_limit: None) -> None:
    client = APIClient()
    statuses = [read(client) for _ in range(5)]  # five different visitors, none identified
    assert statuses == [200, 200, 200, 429, 429]


def test_each_forwarded_visitor_has_their_own_allowance(tight_limit: None) -> None:
    client = APIClient()
    for _ in range(3):
        assert read(client, "198.51.100.7") == 200
    assert read(client, "198.51.100.7") == 429  # this visitor is over their allowance
    assert read(client, "198.51.100.8") == 200  # another visitor behind the same container is not
