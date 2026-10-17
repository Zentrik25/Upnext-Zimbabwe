"""Public read-only catalogue API: visibility, leak prevention, search, filters, sorting, pagination, contract."""

from __future__ import annotations

import json
import os
from datetime import timedelta
from pathlib import Path
from typing import Any

import yaml
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from jsonschema import Draft202012Validator

from accounts.models import AccountStatus, StaffRoleAssignment, User
from api.throttles import PublicReadThrottle
from opportunities import demo, public, workflow
from opportunities.models import Opportunity
from tests.factories import CHECKLIST, World, build_world, new_draft, varied

LIST = "/api/v1/opportunities"
INTERNAL_KEYS = (
    "author",
    "created_by",
    "content_hash",
    "row_version",
    "approved_by",
    "submitted",
    "duplicate_acknowledgement",
    "reviewer",
)


def make(email: str, *roles: str) -> User:
    user = User.objects.create_user(
        email,
        "pw-pw-pw-pw-12",
        email.split("@")[0],
        status=AccountStatus.ACTIVE,
        email_verified_at=timezone.now(),
    )
    for role in roles:
        StaffRoleAssignment.objects.create(user=user, role=role, reason="test fixture")
    return user


class PublicCatalogTests(TestCase):
    world: World
    author: User
    editor: User
    editor2: User
    admin: User
    live: dict[str, Opportunity]
    hidden: dict[str, Opportunity]

    @classmethod
    def setUpTestData(cls) -> None:
        cls.author = make("pa@example.org", "contributor")
        cls.editor = make("pe@example.org", "editor")
        cls.editor2 = make("pe2@example.org", "editor")
        cls.admin = make("padm@example.org", "administrator")
        cls.world = build_world(cls.admin)
        cls.live = {name: cls._publish(name) for name in demo.EXAMPLE_NAMES}
        cls.hidden = cls._hidden()

    @classmethod
    def _step(cls, opp: Opportunity) -> Opportunity:
        opp.refresh_from_db()
        return opp

    @classmethod
    def _publish(cls, example: str, **overrides: Any) -> Opportunity:
        _, content = cls.world.content(example, **overrides)
        opp = workflow.create_draft(
            cls.author, category_code=demo.load_example(example)["category"], content=content
        )
        opp = cls._step(opp)
        workflow.submit(cls.author, opp.pk, expected_row_version=opp.row_version)
        opp = cls._step(opp)
        workflow.approve(cls.editor, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
        opp = cls._step(opp)
        workflow.publish(cls.editor2, opp.pk, expected_row_version=opp.row_version)
        return cls._step(opp)

    @classmethod
    def _hidden(cls) -> dict[str, Opportunity]:
        w, a = cls.world, cls.author
        hidden: dict[str, Opportunity] = {}
        hidden["draft"] = new_draft(w, a, "jobs-1", **varied(w, "jobs-1", "hidden-draft"))
        in_review = new_draft(w, a, "jobs-1", **varied(w, "jobs-1", "hidden-review"))
        workflow.submit(a, in_review.pk, expected_row_version=in_review.row_version)
        hidden["in_review"] = cls._step(in_review)
        approved = new_draft(w, a, "jobs-1", **varied(w, "jobs-1", "hidden-approved"))
        workflow.submit(a, approved.pk, expected_row_version=approved.row_version)
        approved = cls._step(approved)
        workflow.approve(
            cls.editor, approved.pk, expected_row_version=approved.row_version, checklist=CHECKLIST
        )
        hidden["approved"] = cls._step(approved)
        rejected = new_draft(w, a, "jobs-1", **varied(w, "jobs-1", "hidden-rejected"))
        workflow.submit(a, rejected.pk, expected_row_version=rejected.row_version)
        rejected = cls._step(rejected)
        workflow.reject(
            cls.editor,
            rejected.pk,
            expected_row_version=rejected.row_version,
            reason_code="x",
            reason="The source is unclear.",
        )
        hidden["rejected"] = cls._step(rejected)
        for label, action in (("expired", "expire"), ("withdrawn", "withdraw"), ("archived", "takedown")):
            opp = cls._publish("jobs-1", **varied(w, "jobs-1", f"hidden-{label}"))
            kwargs: dict[str, Any] = {"expected_row_version": opp.row_version}
            if action == "takedown":
                workflow.takedown(
                    cls.editor, opp.pk, reason_code="legal", reason="Removed after a legal request.", **kwargs
                )
            else:
                getattr(workflow, action)(
                    cls.editor, opp.pk, reason="Closed ahead of the deadline.", **kwargs
                )
            hidden[label] = cls._step(opp)
        # a live listing with a pending, unpublished amendment that changes the title
        live = cls._publish("jobs-1", **varied(w, "jobs-1", "hidden-amended"))
        workflow.amend(a, live.pk, expected_row_version=live.row_version)
        live = cls._step(live)
        workflow.save_draft(
            a,
            live.pk,
            expected_row_version=live.row_version,
            content={"title": "UNPUBLISHED AMENDMENT TITLE"},
        )
        hidden["amended"] = cls._step(live)
        return hidden

    # ---- helpers
    def get(self, path: str, **params: Any) -> Any:
        return self.client.get(path, params)

    def slugs(self, **params: Any) -> list[str]:
        response = self.get(LIST, **params)
        assert response.status_code == 200, response.content
        return [row["slug"] for row in response.json()["data"]]

    def all_pages(self, **params: Any) -> list[str]:
        seen: list[str] = []
        cursor: str | None = None
        for _ in range(60):
            query = {**params, **({"cursor": cursor} if cursor else {})}
            body = self.get(LIST, **query).json()
            seen += [row["slug"] for row in body["data"]]
            cursor = body["page"]["next_cursor"]
            if not cursor:
                return seen
        raise AssertionError("pagination did not terminate")

    # ---- visibility and leaks (AC-PUB-03, SEC-04, API-09)
    def test_only_published_listings_are_listed(self) -> None:
        listed = set(self.slugs(limit=50))
        expected = {o.slug for n, o in self.live.items()}
        assert expected <= listed
        for label, opp in self.hidden.items():
            if label == "amended":
                assert opp.slug in listed  # the live revision of an amended listing stays public
            elif label == "expired":
                assert opp.slug not in listed
            else:
                assert opp.slug is None or opp.slug not in listed, label
        titles = json.dumps(self.get(LIST, limit=50).json())
        assert "UNPUBLISHED AMENDMENT TITLE" not in titles
        for forbidden in ("hidden-draft", "hidden-review", "hidden-approved", "hidden-rejected"):
            assert forbidden not in titles

    def test_non_public_listings_return_404_by_slug_and_by_guessing(self) -> None:
        for label in ("expired", "withdrawn", "archived"):
            slug = self.hidden[label].slug
            assert slug
            status = self.get(f"{LIST}/{slug}").status_code
            assert status == (404 if label == "archived" else 200), label
        for opp in (
            self.hidden["draft"],
            self.hidden["in_review"],
            self.hidden["approved"],
            self.hidden["rejected"],
        ):
            assert opp.slug is None
            assert self.get(f"{LIST}/{opp.pk}").status_code == 404  # ids are not public handles
        assert self.get(f"{LIST}/no-such-listing-abc123").status_code == 404
        assert self.get(f"{LIST}/Bad_Slug!").status_code == 404
        assert self.get(f"{LIST}/short").status_code == 404

    def test_expired_and_withdrawn_details_show_their_status(self) -> None:
        assert self.get(f"{LIST}/{self.hidden['expired'].slug}").json()["status"] == "expired"
        assert self.get(f"{LIST}/{self.hidden['withdrawn'].slug}").json()["status"] == "withdrawn"

    def test_include_expired_adds_expired_but_never_withdrawn_or_archived(self) -> None:
        with_expired = set(self.slugs(limit=50, include_expired="true"))
        assert self.hidden["expired"].slug in with_expired
        assert self.hidden["withdrawn"].slug not in with_expired
        assert self.hidden["archived"].slug not in with_expired

    def test_amendment_is_invisible_until_published_and_takedown_is_immediate(self) -> None:
        slug = self.hidden["amended"].slug
        assert self.get(f"{LIST}/{slug}").json()["title"] != "UNPUBLISHED AMENDMENT TITLE"
        opp = self.live["jobs-1"]
        assert self.get(f"{LIST}/{opp.slug}").status_code == 200
        workflow.takedown(
            self.editor,
            opp.pk,
            expected_row_version=opp.row_version,
            reason_code="error",
            reason="Published in error.",
        )
        assert self.get(f"{LIST}/{opp.slug}").status_code == 404
        assert opp.slug not in self.slugs(limit=50)

    def test_responses_never_contain_internal_fields(self) -> None:
        listing = self.get(LIST, limit=50).content.decode()
        detail = self.get(f"{LIST}/{self.live['jobs-1'].slug}").content.decode()
        for text in (listing, detail):
            for key in INTERNAL_KEYS:
                assert f'"{key}' not in text, key
        for email in ("pa@example.org", "pe@example.org", "padm@example.org"):
            assert email not in listing + detail

    # ---- detail content
    def test_detail_has_sanitised_html_sources_and_unknowns_stay_null(self) -> None:
        body = self.get(f"{LIST}/{self.live['jobs-1'].slug}").json()
        assert "<strong>Graduate Electrical Engineer</strong>" in body["description_html"]
        assert body["canonical_path"] == f"/opportunities/{body['slug']}"
        assert body["sources"][0]["is_primary"] is True and body["sources"][0]["observed_on"]
        assert body["verification"] == {"level": "not_verified", "checked_at": None}
        assert body["is_saved"] is None
        assert body["application"]["method"] == "external_url" and body["application"]["url"].startswith(
            "https://"
        )
        unknown = self.get(f"{LIST}/{self.live['jobs-2'].slug}").json()
        assert unknown["salary"] is None and unknown["funding"] is None
        assert unknown["deadline"] == {
            "at": None,
            "timezone": None,
            "is_date_only": False,
            "state": "unknown",
        }

    def test_slug_lookup_is_case_insensitive_but_canonical(self) -> None:
        slug = self.live["jobs-1"].slug
        assert slug
        assert self.get(f"{LIST}/{slug.upper()}").json()["slug"] == slug

    def test_money_is_a_decimal_string_with_currency_and_period(self) -> None:
        body = self.get(f"{LIST}/{self.live['jobs-1'].slug}").json()
        assert body["salary"] == {"min": "700.00", "max": "900.00", "currency": "USD", "period": "month"}

    # ---- search (API-02)
    def test_keyword_search_matches_title_organisation_and_body(self) -> None:
        assert self.live["jobs-1"].slug in self.slugs(q="electrical engineer")
        assert self.live["jobs-1"].slug in self.slugs(q="Example Power Services")
        assert self.live["tenders-1"].slug in self.slugs(q="solar water heating")
        assert self.slugs(q="zzzzqqqq") == []

    def test_search_results_are_ranked_by_relevance(self) -> None:
        body = self.get(LIST, q="engineering scholarship").json()
        assert body["data"][0]["slug"] == self.live["scholarships-1"].slug

    def test_websearch_syntax_and_injection_strings_are_treated_as_text(self) -> None:
        assert self.live["jobs-1"].slug in self.slugs(q='"graduate electrical" -nonsense')
        for payload in (
            "'; DROP TABLE opportunities_opportunity; --",
            "a & b | !c",
            "(((",
            "\\",
            "%",
            "a:*",
            "<script>",
        ):
            response = self.get(LIST, q=payload)
            assert response.status_code == 200, payload
        assert Opportunity.objects.count() > 0

    def test_search_term_bounds(self) -> None:
        assert self.get(LIST, q="").status_code == 400
        assert self.get(LIST, q="x" * 101).status_code == 400
        assert self.get(LIST, q="x" * 100).status_code == 200
        assert self.get(LIST, q="a\x00b").status_code == 400

    def test_relevance_sort_needs_a_search_term(self) -> None:
        assert self.get(LIST, sort="relevance").status_code == 400

    # ---- filters (API-03, API-08)
    def test_category_filter_and_unknown_category(self) -> None:
        jobs = self.get(LIST, category="jobs", limit=50).json()["data"]
        assert jobs and {row["category"]["code"] for row in jobs} == {"jobs"}
        both = {
            row["category"]["code"]
            for row in self.get(LIST, category="tenders,grants", limit=50).json()["data"]
        }
        assert both == {"tenders", "grants"}
        bad = self.get(LIST, category="jobs,wizards")
        assert bad.status_code == 400
        error = bad.json()["error"]
        assert error["code"] == "invalid_filter" and "category" in error["fields"] and error["request_id"]

    def test_location_filter_includes_places_inside_a_province(self) -> None:
        manicaland = self.slugs(location="manicaland", limit=50)
        assert self.live["tenders-1"].slug in manicaland  # Mutare is in Manicaland
        assert self.live["jobs-1"].slug not in manicaland
        assert self.live["jobs-1"].slug in self.slugs(location="harare", limit=50)
        assert self.get(LIST, location="atlantis").status_code == 400

    def test_enum_filters(self) -> None:
        rows = self.get(LIST, employment_type="internship", limit=50).json()["data"]
        assert rows and all(r["employment_type"] == "internship" for r in rows)
        rows = self.get(LIST, work_mode="remote", limit=50).json()["data"]
        assert all(r["work_mode"] == "remote" for r in rows)
        for param in ("work_mode", "employment_type", "experience_level", "deadline_state"):
            assert self.get(LIST, **{param: "bogus"}).status_code == 400

    def test_deadline_state_filter(self) -> None:
        unknown = self.get(LIST, deadline_state="unknown", limit=50).json()["data"]
        assert unknown and all(
            r["deadline"]["state"] == "unknown" and r["deadline"]["at"] is None for r in unknown
        )
        known = self.get(LIST, deadline_state="open,closing_soon", limit=50).json()["data"]
        assert known and all(r["deadline"]["at"] for r in known)

    def test_posted_within_days_organisation_and_bounds(self) -> None:
        assert self.live["jobs-1"].slug in self.slugs(posted_within_days=1, limit=50)
        org = self.get(f"{LIST}/{self.live['jobs-1'].slug}").json()["organisation"]["id"]
        assert self.slugs(organisation_id=org, limit=50)
        for bad in (0, 366, "x", "1.5"):
            assert self.get(LIST, posted_within_days=bad).status_code == 400
        assert self.get(LIST, organisation_id="not-a-uuid").status_code == 400

    def test_unknown_duplicate_and_overlong_parameters_are_rejected(self) -> None:
        assert self.get(LIST, bogus=1).status_code == 400
        assert self.client.get(f"{LIST}?category=jobs&category=grants").status_code == 400
        too_many = ",".join(["jobs"] * 11)
        assert self.get(LIST, category=too_many).status_code == 400
        assert self.get(LIST, include_expired="maybe").status_code == 400
        assert self.get(LIST, sort="random").status_code == 400

    # ---- sorting and pagination (API-04)
    def test_newest_sort_orders_by_first_publication(self) -> None:
        rows = self.get(LIST, sort="newest", limit=50).json()["data"]
        times = [r["published_at"] for r in rows]
        assert times == sorted(times, reverse=True)

    def test_closing_soon_sort_puts_unknown_deadlines_last(self) -> None:
        rows = self.get(LIST, sort="closing_soon", limit=50).json()["data"]
        flags = [r["deadline"]["at"] is None for r in rows]
        assert flags == sorted(flags)
        known = [r["deadline"]["at"] for r in rows if r["deadline"]["at"]]
        assert known == sorted(known)

    def test_paging_through_every_sort_returns_each_listing_once(self) -> None:
        everything = set(self.slugs(limit=50))
        for sort in ("newest", "closing_soon"):
            pages = self.all_pages(sort=sort, limit=3)
            assert len(pages) == len(set(pages)) and set(pages) == everything, sort
        ranked = self.all_pages(q="programme", limit=2)
        assert len(ranked) == len(set(ranked)) and ranked
        filtered = self.all_pages(category="jobs,internships", sort="closing_soon", limit=2)
        assert set(filtered) <= everything and len(filtered) == len(set(filtered))

    def test_page_info_and_total(self) -> None:
        first = self.get(LIST, limit=4).json()
        assert first["page"]["limit"] == 4 and first["page"]["has_more"] is True
        assert first["page"]["total"] == len(self.slugs(limit=50))
        second = self.get(LIST, limit=4, cursor=first["page"]["next_cursor"]).json()
        assert second["page"]["total"] is None
        empty = self.get(LIST, q="zzzzqqqq").json()
        assert empty == {
            "data": [],
            "page": {"limit": 20, "has_more": False, "next_cursor": None, "total": 0},
        }

    def test_limit_bounds(self) -> None:
        for bad in (0, 51, "x", -1):
            assert self.get(LIST, limit=bad).status_code == 400
        assert len(self.get(LIST, limit=50).json()["data"]) <= 50

    def test_tampered_or_foreign_cursors_are_rejected(self) -> None:
        cursor = self.get(LIST, limit=2).json()["page"]["next_cursor"]
        assert cursor
        for bad in (cursor[:-3] + "xyz", "garbage", cursor + "A", cursor.replace("A", "B", 1)):
            response = self.get(LIST, limit=2, cursor=bad)
            assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_cursor"
        other = self.get(LIST, limit=2, cursor=cursor, category="jobs")  # issued for different filters
        assert other.status_code == 400 and other.json()["error"]["code"] == "invalid_cursor"
        assert self.get(LIST, limit=2, cursor=cursor, sort="closing_soon").status_code == 400
        assert self.get(LIST, cursor="x" * 513).status_code == 400

    def contract_validator(self, name: str) -> Draft202012Validator:
        root = repo_root()
        assert root is not None
        doc = yaml.safe_load((root / "docs/engineering/openapi/openapi.yaml").read_text())
        return Draft202012Validator({"$ref": f"#/components/schemas/{name}", "components": doc["components"]})

    def test_responses_match_the_contract(self) -> None:
        """Real responses validate against the schemas of the Phase 0 contract (drift protection)."""
        if repo_root() is None:
            self.skipTest("repository docs/ not available")
        listing = self.get(LIST, limit=50).json()
        summary = self.contract_validator("OpportunitySummary")
        for row in listing["data"]:
            summary.validate(row)
        self.contract_validator("PageInfo").validate(listing["page"])
        detail = self.contract_validator("OpportunityDetail")
        for opp in self.live.values():
            detail.validate(self.get(f"{LIST}/{opp.slug}").json())
        error = self.contract_validator("Error")
        error.validate(self.get(LIST, bogus=1).json())
        error.validate(self.get(f"{LIST}/nothing-here-123456").json())
        for path, schema in (("categories", "Category"), ("locations", "Location"), ("sectors", "Sector")):
            validator = self.contract_validator(schema)
            for row in self.get(f"/api/v1/{path}").json()["data"]:
                validator.validate(row)

    # ---- reference lists
    def test_reference_lists(self) -> None:
        categories = self.get("/api/v1/categories").json()["data"]
        assert [c["code"] for c in categories] == [
            "jobs",
            "internships",
            "graduate-programmes",
            "scholarships",
            "tenders",
            "grants",
        ]
        locations = self.get("/api/v1/locations").json()["data"]
        assert {"harare", "remote", "zimbabwe", "manicaland"} <= {loc["slug"] for loc in locations}
        assert next(loc for loc in locations if loc["slug"] == "mutare")["parent_slug"] == "manicaland"
        assert self.get("/api/v1/sectors").json()["data"]
        skills = self.get("/api/v1/skills", q="rep").json()["data"]
        assert [s["name"] for s in skills][:1] == ["Report writing"]
        assert self.get("/api/v1/skills").status_code == 400
        assert self.get("/api/v1/skills", q="r").status_code == 400
        assert self.get("/api/v1/skills", q="rep", limit=21).status_code == 400
        assert self.get("/api/v1/skills", q="rep", bogus=1).status_code == 400

    # ---- headers, anonymity, cost
    def test_responses_are_not_cached_and_ignore_sessions(self) -> None:
        response = self.get(LIST, limit=2)
        assert "no-store" in response["Cache-Control"] or "no-cache" in response["Cache-Control"]
        self.client.force_login(self.admin)
        body = self.get(LIST, limit=2).json()
        assert all(row["is_saved"] is None for row in body["data"])

    def test_list_query_count_does_not_grow_with_page_size(self) -> None:
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as small:
            self.get(LIST, limit=2)
        with CaptureQueriesContext(connection) as large:
            self.get(LIST, limit=50)
        assert len(large) <= len(small) + 2

    def test_past_deadline_listings_leave_the_default_list_even_before_the_expiry_job(self) -> None:
        query = public.parse_query(self.client.get(LIST).wsgi_request.GET)  # an empty, valid query
        far = timezone.now() + timedelta(days=3650)
        with_deadline = {
            o.slug for n, o in self.live.items() if o.live_version and o.live_version.deadline_at
        }
        without = {o.slug for n, o in self.live.items() if o.live_version and not o.live_version.deadline_at}
        listed = {v.opportunity.slug for v in public.search(public.Query(limit=50), now=far).items}
        assert not (with_deadline & listed) and without <= listed
        assert query.limit == 20


def repo_root() -> Path | None:
    configured = os.environ.get("UPNEXT_REPO_ROOT")
    candidates = [Path(configured)] if configured else []
    candidates += [p / "docs" for p in Path(__file__).resolve().parents]
    for candidate in candidates:
        base = candidate if (candidate / "docs").is_dir() else candidate.parent
        if (base / "docs/engineering/openapi/openapi.yaml").is_file():
            return base
    return None


class PublicThrottleTests(TestCase):
    def test_rate_limit_returns_429_with_retry_after(self) -> None:
        cache.clear()
        PublicReadThrottle.THROTTLE_RATES = {**PublicReadThrottle.THROTTLE_RATES, "public_read": "2/1m"}
        try:
            statuses = [self.client.get("/api/v1/categories").status_code for _ in range(4)]
            blocked = self.client.get("/api/v1/categories")
        finally:
            PublicReadThrottle.THROTTLE_RATES = {**PublicReadThrottle.THROTTLE_RATES, "public_read": "240/1m"}
            cache.clear()
        assert statuses[:2] == [200, 200] and 429 in statuses
        assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "rate_limited"
        assert int(blocked["Retry-After"]) > 0
