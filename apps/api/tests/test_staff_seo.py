"""The administrator's SEO page: who may open it, and that it never invents figures (ADR-0027)."""

from __future__ import annotations

from typing import Any, cast

import pytest
from django.core.cache import caches
from django.utils import timezone

from accounts.models import User
from seo import console, google
from seo.models import IndexingNotification
from tests.test_staff_api import S, signed_in

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_cache() -> None:
    caches["local"].clear()


def test_only_administrators_may_open_the_page(people: dict[str, User]) -> None:
    for who in ("author", "editor"):
        assert signed_in(people[who]).get(f"{S}/seo").status_code == 403
    assert signed_in(people["admin"]).get(f"{S}/seo").status_code == 200


def test_without_setup_it_says_setup_required_and_shows_no_figures(
    people: dict[str, User], settings: Any
) -> None:
    settings.UPNEXT_SEARCH_CONSOLE_SITE = ""
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = ""
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE = ""
    body = signed_in(people["admin"]).get(f"{S}/seo").json()
    sc = body["search_console"]
    assert sc["state"] == "setup_required" and len(sc["steps"]) == 2
    assert not {"totals", "queries", "pages", "inspections"} & sc.keys()
    assert body["submissions"]["enabled"] is False and body["submissions"]["credentials"] == "missing"
    assert "does not mean the page is crawled, indexed or shown" in body["definitions"]["accepted"]


def test_history_distinguishes_queued_from_accepted(people: dict[str, User]) -> None:
    IndexingNotification.objects.create(
        url="https://upnext.co.zw/opportunities/aaaaaaaa", kind="URL_UPDATED", trigger="T07"
    )
    IndexingNotification.objects.create(
        url="https://upnext.co.zw/opportunities/bbbbbbbb",
        kind="URL_UPDATED",
        trigger="T07",
        status="sent",
        http_status=200,
        sent_at=timezone.now(),
    )
    data = signed_in(people["admin"]).get(f"{S}/seo").json()["submissions"]
    assert data["counts"]["pending"] == 1 and data["counts"]["sent"] == 1
    assert {r["status"] for r in data["recent"]} == {"pending", "sent"}
    assert all("private_key" not in str(r) for r in data["recent"])


class FakeConsole:
    def __init__(self, fail: google.ApiError | None = None) -> None:
        self.fail = fail
        self.calls = 0

    def analytics(self, site: str, *, start: str, end: str, dimensions: list[str], row_limit: int):  # type: ignore[no-untyped-def]
        self.calls += 1
        if self.fail:
            raise self.fail
        if not dimensions:
            return [{"clicks": 12, "impressions": 340, "ctr": 0.0353, "position": 8.456}]
        return [
            {"keys": [f"{dimensions[0]}-1"], "clicks": 5, "impressions": 90, "ctr": 0.05, "position": 3.2}
        ]

    def sitemaps(self, site: str):  # type: ignore[no-untyped-def]
        return [{"path": "https://upnext.co.zw/sitemap.xml", "errors": "0", "warnings": "1", "isPending": False,
                 "contents": [{"type": "web", "submitted": "40", "indexed": "0"}]}]  # fmt: skip

    def inspect(self, site: str, url: str):  # type: ignore[no-untyped-def]
        return {
            "indexStatusResult": {
                "verdict": "NEUTRAL",
                "coverageState": "Discovered - currently not indexed",
            },
            "richResultsResult": {
                "verdict": "FAIL",
                "detectedItems": [
                    {
                        "richResultType": "Job postings",
                        "items": [{"issues": [{"issueMessage": "Missing field datePosted"}]}],
                    }
                ],
            },
        }


def test_ready_report_keeps_search_performance_and_indexing_status_apart(settings: Any) -> None:
    settings.UPNEXT_SEARCH_CONSOLE_SITE = "sc-domain:upnext.co.zw"
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = ""
    IndexingNotification.objects.create(
        url="https://upnext.co.zw/opportunities/aaaaaaaa", kind="URL_UPDATED", trigger="T07", status="sent",
        http_status=200, sent_at=timezone.now(),
    )  # fmt: skip
    # no key in settings: credentials_status says 'missing', so we expect the setup state, not the fake's figures
    assert console.build(lambda: (cast(Any, FakeConsole()), "x@y"))["state"] == "setup_required"


def test_ready_report_with_credentials(settings: Any) -> None:
    import json

    from tests.test_indexing import make_key

    settings.UPNEXT_SEARCH_CONSOLE_SITE = "sc-domain:upnext.co.zw"
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE = ""
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = json.dumps(
        {
            "type": "service_account",
            "client_email": "sc@proj.iam.gserviceaccount.com",
            "private_key": make_key(),
        }
    )
    IndexingNotification.objects.create(
        url="https://upnext.co.zw/opportunities/aaaaaaaa", kind="URL_UPDATED", trigger="T07", status="sent",
        http_status=200, sent_at=timezone.now(),
    )  # fmt: skip
    data = console.build(lambda: (cast(Any, FakeConsole()), "sc@proj.iam.gserviceaccount.com"))
    assert data["state"] == "ready"
    assert data["totals"] == {"clicks": 12, "impressions": 340, "ctr": 0.0353, "position": 8.5}
    assert data["queries"][0]["key"] == "query-1" and data["pages"][0]["key"] == "page-1"
    assert data["sitemaps"][0]["warnings"] == 1 and data["sitemaps"][0]["submitted"] == {"web": 40}
    (inspection,) = data["inspections"]
    assert (
        inspection["verdict"] == "NEUTRAL"
        and "Missing field datePosted" in inspection["rich_results_issues"][0]
    )
    assert "indexed" not in data["sitemaps"][0]  # the deprecated sitemap 'indexed' count is not shown


@pytest.mark.parametrize("kind", ["permission", "auth", "quota", "not_found"])
def test_google_refusal_is_an_error_state_with_a_next_step_and_no_numbers(settings: Any, kind: str) -> None:
    import json

    from tests.test_indexing import make_key

    settings.UPNEXT_SEARCH_CONSOLE_SITE = "sc-domain:upnext.co.zw"
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE = ""
    settings.UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON = json.dumps(
        {
            "type": "service_account",
            "client_email": "sc@proj.iam.gserviceaccount.com",
            "private_key": make_key(),
        }
    )
    data = console.build(lambda: (cast(Any, FakeConsole(google.ApiError(kind, 403, "no"))), "x"))
    assert data["state"] == "error" and data["steps"] and "totals" not in data
