"""Merging duplicate listings and preventing them (AdSense audit 2026-11-16, D-79, ADR-0027).

The audit found two live pairs of one vacancy, among them a TotalEnergies vacancy whose two pages share the employer's
job id 82490 but disagree on the place and on whether a closing date is stated. These tests reproduce that shape:

* merging: the duplicate leaves every public list and the sitemap, its address answers with the kept listing (the web
  page turns that into one 308), its history and verification records stay, saved copies follow, a rerun is a no-op,
  and the redirect rows cannot be edited or deleted;
* prevention: the same issuer reference or specific application address (tracking parameters removed) is a hard
  duplicate in any category, is never published on one person's authority, and cannot reach the public site twice
  even when two pipelines run side by side; imports refuse a repeat.
"""

from __future__ import annotations

import io
import json
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from catalog.models import Organisation
from opportunities import importer, workflow
from opportunities.duplicates import (
    find_duplicates,
    normalise_reference,
    normalise_url,
    titles_compatible,
    url_identifies_vacancy,
)
from opportunities.errors import WorkflowError
from opportunities.models import (
    ArchiveReason,
    ListingStatus,
    Opportunity,
    OpportunityRedirect,
    PublishingEvent,
    SavedOpportunity,
    VerificationRecord,
)
from tests.factories import CHECKLIST, STANDARD, World, new_draft

pytestmark = pytest.mark.django_db

KEEP = "totalenergies-supply-assistant-harare"
OFFER = "https://jobs.totalenergies.example.org/en_US/careers/JobDetail/Supply-Assistant/82490"


@pytest.fixture
def total(people: dict[str, User]) -> Organisation:
    return Organisation.objects.create(name="TotalEnergies Marketing Zimbabwe", created_by=people["admin"])


def _content(org: Organisation, **extra: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "organisation_id": str(org.pk),
        "title": "Supply Assistant",
        "reference_number": "82490",
        "application_url": OFFER,
        "location_text": "Harare",
        "sources": [
            {
                "kind": "issuer_website",
                "name": "TotalEnergies careers",
                "url": OFFER,
                "citation": None,
                "observed_on": timezone.now().date().isoformat(),
                "is_primary": True,
            }
        ],
    }
    base.update(extra)
    return base


def _publish_reviewed(
    world: World, author: User, reviewer: User, org: Organisation, *, confirm: bool = False, **extra: Any
) -> Opportunity:
    """Draft by `author`, submitted (confirming a duplicate when asked), approved and published by `reviewer`."""
    opp = new_draft(world, author, "jobs-1", **_content(org, **extra))
    workflow.submit(
        author,
        opp.pk,
        expected_row_version=opp.row_version,
        duplicate_acknowledgement={"confirmed": True} if confirm else None,
    )
    opp.refresh_from_db()
    workflow.approve(reviewer, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    workflow.publish(reviewer, opp.pk, expected_row_version=opp.row_version)
    opp.refresh_from_db()
    return opp


@pytest.fixture
def pair(world: World, people: dict[str, User], total: Organisation) -> tuple[Opportunity, Opportunity]:
    """The live state the audit found: the kept page, and a later duplicate that disagrees on place and deadline."""
    keep = _publish_reviewed(world, people["author"], people["editor"], total, slug=KEEP)
    dup = _publish_reviewed(
        world,
        people["author"],
        people["editor"],
        total,
        confirm=True,  # how it got through: someone confirmed the warning
        location_text="Zimbabwe",
        deadline_at=None,
        application_url=f"{OFFER}?src=LinkedIn",
        sources=[
            {
                "kind": "newspaper",
                "name": "The Herald",
                "url": None,
                "citation": "The Herald, vacancies page, 14 November 2026",
                "observed_on": timezone.now().date().isoformat(),
                "is_primary": True,
            }
        ],
    )
    return keep, dup


def detail(client: APIClient, slug: str) -> Any:
    return client.get(f"/api/v1/opportunities/{slug}")


def merge(people: dict[str, User], keep: Opportunity, dup: Opportunity, **kw: Any) -> workflow.MergeResult:
    dup.refresh_from_db()
    return workflow.merge_duplicate(
        people["editor"],
        dup.pk,
        into_id=keep.pk,
        expected_row_version=dup.row_version,
        reason="Same TotalEnergies vacancy, job id 82490 on the issuer's notice.",
        **kw,
    )


# --- identifiers ----------------------------------------------------------------------------------------------
def test_references_and_addresses_are_normalised_without_losing_what_identifies_the_vacancy() -> None:
    assert normalise_reference("Job ID: 82490") == normalise_reference("REF 82490") == "82490"
    assert normalise_reference("GEE/2026/07") == "gee202607"
    assert normalise_reference("Nov2026/01") == "nov202601"  # "No" is a prefix only before a non-letter
    for blank in (None, "", "N/A", "TBA", "HR", "12"):
        assert normalise_reference(blank) == ""
    # src=LinkedIn and utm_* say where the visitor came from; jobId identifies the vacancy and is kept.
    assert (
        normalise_url(f"{OFFER}?src=LinkedIn")
        == normalise_url(f"https://WWW.{OFFER[8:]}/")
        == normalise_url(OFFER)
    )
    assert normalise_url("https://x.example.org/apply?jobId=82490&utm_source=fb") == (
        "https://x.example.org/apply?jobId=82490"
    )
    assert normalise_url("https://x.example.org/apply?jobId=1") != normalise_url(
        "https://x.example.org/apply?jobId=2"
    )
    assert normalise_url("mailto:hr@example.org") == "" and normalise_url("not a url") == ""
    # A specific address carries an id; a careers home page, a shared form or a dated news post does not.
    assert url_identifies_vacancy(normalise_url(OFFER))
    assert not url_identifies_vacancy(normalise_url("https://careers.example.org/apply"))
    assert not url_identifies_vacancy(normalise_url("https://acbf.example.org/2026/11/vacancies"))
    assert url_identifies_vacancy(
        normalise_url("https://acbf.example.org/vacancies/toa-17"), frozenset({"toa17"})
    )


def test_title_compatibility_allows_the_brand_or_place_in_one_title_but_not_another_post() -> None:
    assert titles_compatible("Supply Assistant", "TotalEnergies Supply Assistant - Harare")
    assert titles_compatible("Transport and Office Associate", "Transport & Office Associate")
    assert not titles_compatible("Supply Assistant", "Retail Network Engineer")
    assert not titles_compatible("Job 1", "Job 2")


def test_the_same_issuer_reference_is_a_hard_duplicate_whatever_the_place_date_or_category(
    world: World, people: dict[str, User], total: Organisation
) -> None:
    keep = _publish_reviewed(world, people["author"], people["editor"], total)
    other = new_draft(
        world,
        people["editor"],
        "graduate-programmes-1",  # another category
        **_content(total, location_text="Bulawayo", application_url=None, sources=[], deadline_at=None),
    )
    assert other.pending_version is not None
    found = find_duplicates(other.pending_version)
    assert [(d.opportunity_id, d.level, d.match) for d in found] == [(str(keep.pk), "hard", "identifier")]
    assert "82490" in found[0].reason


def test_the_same_specific_address_without_its_tracking_parameter_is_a_hard_duplicate(
    world: World, people: dict[str, User], total: Organisation
) -> None:
    keep = _publish_reviewed(world, people["author"], people["editor"], total, reference_number=None)
    other = new_draft(
        world,
        people["editor"],
        "jobs-1",
        **_content(total, reference_number=None, application_url=f"{OFFER}?src=LinkedIn&utm_medium=social"),
    )
    assert other.pending_version is not None
    assert [(d.opportunity_id, d.level, d.match) for d in find_duplicates(other.pending_version)] == [
        (str(keep.pk), "hard", "identifier")
    ]


def test_one_reference_for_several_different_posts_is_a_warning_for_review_not_a_block(
    world: World, people: dict[str, User], total: Organisation
) -> None:
    _publish_reviewed(world, people["author"], people["editor"], total)
    other = new_draft(
        world,
        people["editor"],
        "jobs-1",
        **_content(total, title="Retail Network Engineer", application_url=f"{OFFER[:-5]}90002", sources=[]),
    )
    assert other.pending_version is not None
    found = find_duplicates(other.pending_version)
    assert [(d.level, d.match) for d in found] == [("soft", "identifier")]
    assert "several posts" in found[0].reason
    other.refresh_from_db()
    published = workflow.publish_direct(
        people["editor"], other.pk, expected_row_version=other.row_version, checklist=CHECKLIST
    )
    assert published.status == ListingStatus.PUBLISHED  # a warning never blocks
    # ... nor through review and publication (T07), where the identity guard runs again
    reviewed = _publish_reviewed(
        world,
        people["author"],
        people["editor"],
        total,
        title="Depot Supervisor",
        application_url=f"{OFFER[:-5]}90003",
        sources=[],
    )
    assert reviewed.status == ListingStatus.PUBLISHED


def test_an_identifier_match_is_never_published_directly_and_goes_to_another_persons_review(
    world: World, people: dict[str, User], total: Organisation
) -> None:
    _publish_reviewed(world, people["author"], people["editor"], total)
    editor = people["author_editor"]
    again = new_draft(world, editor, "jobs-1", **_content(total, location_text="Zimbabwe"))
    for ack in (None, {"confirmed": True}):
        with pytest.raises(WorkflowError) as refused:
            workflow.publish_direct(
                editor,
                again.pk,
                expected_row_version=again.row_version,
                checklist=CHECKLIST,
                duplicate_acknowledgement=ack,
            )
        assert refused.value.code == "duplicate_review_required"
        again.refresh_from_db()
        assert again.status == ListingStatus.DRAFT
    # Submitted with the confirmation, it waits for someone else, who sees the match and decides.
    with pytest.raises(WorkflowError) as unconfirmed:
        workflow.submit(editor, again.pk, expected_row_version=again.row_version)
    assert unconfirmed.value.code == "duplicate_detected"
    workflow.submit(
        editor,
        again.pk,
        expected_row_version=again.row_version,
        duplicate_acknowledgement={"confirmed": True},
    )
    again.refresh_from_db()
    assert again.status == ListingStatus.IN_REVIEW
    assert again.pending_version is not None
    ack = again.pending_version.duplicate_acknowledgement
    assert ack is not None and ack["confirmed"] is True and len(ack["identifier_of"]) == 1


def test_two_pipelines_for_one_vacancy_cannot_both_reach_the_public_site(
    world: World, people: dict[str, User], total: Organisation
) -> None:
    """B is submitted before A exists in the pipeline, so B's reviewer never saw A. A is published first; B's
    publication is then refused under the identity lock."""
    author, reviewer = people["author"], people["editor"]
    b = new_draft(world, author, "jobs-1", **_content(total))
    a = new_draft(world, author, "jobs-1", **_content(total, location_text="Zimbabwe"))
    workflow.submit(author, b.pk, expected_row_version=b.row_version)
    a.refresh_from_db()
    workflow.submit(
        author, a.pk, expected_row_version=a.row_version, duplicate_acknowledgement={"confirmed": True}
    )
    for opp in (a, b):
        opp.refresh_from_db()
        workflow.approve(reviewer, opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    a.refresh_from_db()
    workflow.publish(reviewer, a.pk, expected_row_version=a.row_version)  # A saw B in review and confirmed
    b.refresh_from_db()
    with pytest.raises(WorkflowError) as refused:
        workflow.publish(reviewer, b.pk, expected_row_version=b.row_version)
    assert refused.value.code == "duplicate_detected"
    assert Opportunity.objects.filter(status=ListingStatus.PUBLISHED).count() == 1


def test_identity_checks_take_a_transaction_advisory_lock(
    world: World, people: dict[str, User], total: Organisation, django_assert_num_queries: Any
) -> None:
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    opp = new_draft(world, people["author"], "jobs-1", **_content(total))
    with CaptureQueriesContext(connection) as queries:
        workflow.submit(people["author"], opp.pk, expected_row_version=opp.row_version)
    locks = [q["sql"] for q in queries.captured_queries if "pg_advisory_xact_lock" in q["sql"]]
    assert len(locks) == 2  # one for the organisation's reference, one for the specific address


# --- importer -------------------------------------------------------------------------------------------------
def test_an_import_refuses_a_vacancy_already_in_the_catalogue_or_twice_in_one_file(
    world: World, people: dict[str, User], total: Organisation
) -> None:
    _publish_reviewed(world, people["author"], people["editor"], total)
    _, base = world.content("jobs-1")
    base.pop("organisation_id", None)
    base["category"] = "jobs"
    base["organisation"] = total.name
    base.pop("locations", None)
    base.pop("sector_ids", None)
    base.pop("skills", None)
    repeat = {**base, "reference_number": "Job ID 82490", "application_url": None, "sources": []}
    fresh = {
        **base,
        "title": "Depot Supervisor",
        "reference_number": "90001",
        "application_url": "https://jobs.totalenergies.example.org/offers/90001",
        "sources": [],
    }
    tracked_copy = {**fresh, "application_url": f"{fresh['application_url']}?utm_source=whatsapp"}
    results = importer.import_drafts(people["author"], [repeat, fresh, tracked_copy], dry_run=True)
    assert [r.status for r in results] == ["duplicate", "would_create", "duplicate"]
    assert "82490" in results[0].problems[0]
    assert "row 2" in results[2].problems[0]
    created = importer.import_drafts(people["author"], [fresh, tracked_copy], dry_run=False)
    assert [r.status for r in created] == ["created", "duplicate"]
    again = importer.import_drafts(people["author"], [fresh], dry_run=False)  # the same file imported twice
    assert [r.status for r in again] == ["duplicate"]


# --- merging --------------------------------------------------------------------------------------------------
def test_merging_removes_the_duplicate_from_public_discovery_and_keeps_its_history(
    client: APIClient, people: dict[str, User], pair: tuple[Opportunity, Opportunity], make_user: Any
) -> None:
    keep, dup = pair
    assert dup.slug and keep.slug == KEEP
    # Someone recorded a verification on the duplicate before the merge: it must survive.
    workflow.set_verification(people["editor2"], dup.pk, verified=True, **STANDARD)
    only_dup, both = make_user(), make_user()
    SavedOpportunity.objects.create(user=only_dup, opportunity=dup)
    SavedOpportunity.objects.create(user=both, opportunity=dup)
    SavedOpportunity.objects.create(user=both, opportunity=keep)
    listed = {r["slug"] for r in client.get("/api/v1/opportunities").json()["data"]}
    assert listed == {KEEP, dup.slug}
    history_before = PublishingEvent.objects.filter(opportunity=dup).count()

    result = merge(people, keep, dup, review_notes=["Location differs: Zimbabwe / Harare."])

    assert result.created and result.saved_moved == 1 and result.saved_already_on_canonical == 1
    dup.refresh_from_db()
    assert dup.status == ListingStatus.ARCHIVED and dup.archive_reason == ArchiveReason.MERGED
    assert dup.slug == result.redirect.from_slug  # the slug stays on the archived row; it is never reused
    assert result.redirect.review_notes == ["Location differs: Zimbabwe / Harare."]
    # public lists, the default search, category lists, search words and the sitemap: only the kept listing
    for url in (
        "/api/v1/opportunities",
        "/api/v1/opportunities?category=jobs",
        "/api/v1/opportunities?q=supply",
        "/api/v1/opportunities?include_expired=true",
    ):
        assert {r["slug"] for r in client.get(url).json()["data"]} == {KEEP}, url
    assert [e["slug"] for e in client.get("/api/v1/sitemap").json()["data"]] == [KEEP]
    # history: everything kept, one more event for the merge, an audit row on both listings
    assert PublishingEvent.objects.filter(opportunity=dup).count() == history_before + 1
    event = PublishingEvent.objects.filter(opportunity=dup).order_by("-occurred_at").first()
    assert event is not None and event.transition == "T16" and event.to_status == ListingStatus.ARCHIVED
    assert VerificationRecord.objects.filter(opportunity=dup).count() == 1
    assert AuditEvent.objects.filter(action="opportunity.merge", object_id=str(dup.pk)).exists()
    assert AuditEvent.objects.filter(action="opportunity.merge_received", object_id=str(keep.pk)).exists()
    # saved copies follow the vacancy: one each
    assert set(SavedOpportunity.objects.filter(opportunity=keep).values_list("user_id", flat=True)) == {
        only_dup.pk,
        both.pk,
    }
    assert not SavedOpportunity.objects.filter(opportunity=dup).exists()
    # the kept listing's content and verification are untouched
    keep.refresh_from_db()
    assert keep.status == ListingStatus.PUBLISHED and not keep.is_verified


def test_the_old_address_answers_with_the_kept_listing_so_the_page_moves_in_one_step(
    client: APIClient, people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    keep, dup = pair
    merge(people, keep, dup)
    for asked in (dup.slug, (dup.slug or "").upper()):
        response = detail(client, asked or "")
        assert response.status_code == 200, asked
        body = response.json()
        assert body["slug"] == KEEP and body["canonical_path"] == f"/opportunities/{KEEP}"
    assert detail(client, KEEP).json()["slug"] == KEEP
    assert detail(client, "never-existed-abc123").status_code == 404


def test_a_chain_of_merges_resolves_to_the_final_listing_and_never_to_a_hidden_one(
    world: World,
    client: APIClient,
    people: dict[str, User],
    pair: tuple[Opportunity, Opportunity],
    total: Organisation,
) -> None:
    keep, dup = pair
    merge(people, keep, dup)
    final = _publish_reviewed(
        world, people["author"], people["editor"], total, confirm=True, title="TotalEnergies Supply Assistant"
    )
    keep.refresh_from_db()
    workflow.merge_duplicate(
        people["editor"],
        keep.pk,
        into_id=final.pk,
        expected_row_version=keep.row_version,
        reason="Merged again later.",
    )
    assert detail(client, dup.slug or "").json()["slug"] == final.slug  # straight to the end of the chain
    final.refresh_from_db()
    workflow.takedown(
        people["editor"],
        final.pk,
        expected_row_version=final.row_version,
        reason_code="error",
        reason="Posted wrongly.",
    )
    assert detail(client, dup.slug or "").status_code == 404  # a redirect never exposes an archived listing


def test_a_rerun_changes_nothing_and_conflicts_block_the_merge(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity], world: World, total: Organisation
) -> None:
    keep, dup = pair
    first = merge(people, keep, dup)
    events = PublishingEvent.objects.count()
    again = merge(people, keep, dup)
    assert not again.created and again.redirect.pk == first.redirect.pk
    assert PublishingEvent.objects.count() == events
    # into itself, into an archived listing, from a listing that was merged elsewhere
    other = _publish_reviewed(
        world, people["author"], people["editor"], total, confirm=True, title="Supply Assistant II"
    )
    with pytest.raises(WorkflowError) as itself:
        workflow.merge_duplicate(
            people["editor"],
            other.pk,
            into_id=other.pk,
            expected_row_version=None,
            reason="Same listing twice.",
        )
    assert itself.value.code == "merge_conflict"
    with pytest.raises(WorkflowError) as into_archived:
        workflow.merge_duplicate(
            people["editor"],
            other.pk,
            into_id=dup.pk,
            expected_row_version=None,
            reason="Into a retired one.",
        )
    assert into_archived.value.code == "merge_conflict"
    with pytest.raises(WorkflowError) as elsewhere:
        workflow.merge_duplicate(
            people["editor"],
            dup.pk,
            into_id=other.pk,
            expected_row_version=None,
            reason="Somewhere else now.",
        )
    assert elsewhere.value.code == "merge_conflict"


def test_an_unpublished_revision_on_the_duplicate_blocks_the_merge_so_no_work_is_lost(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    keep, dup = pair
    workflow.amend(people["author"], dup.pk, expected_row_version=dup.row_version)
    with pytest.raises(WorkflowError) as blocked:
        merge(people, keep, dup)
    assert blocked.value.code == "merge_conflict" and "unpublished revision" in blocked.value.message


def test_only_editors_and_administrators_may_merge(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    keep, dup = pair
    for who in ("author", "seeker"):
        with pytest.raises(WorkflowError) as denied:
            workflow.merge_duplicate(
                people[who],
                dup.pk,
                into_id=keep.pk,
                expected_row_version=None,
                reason="Not allowed to do it.",
            )
        assert denied.value.code == "permission_denied"
    assert AuditEvent.objects.filter(action="opportunity.merge.denied").count() == 2


def test_redirect_rows_are_append_only(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    keep, dup = pair
    redirect = merge(people, keep, dup).redirect
    with pytest.raises(IntegrityError), transaction.atomic():
        OpportunityRedirect.objects.filter(pk=redirect.pk).update(reason="changed")
    with pytest.raises(IntegrityError), transaction.atomic():
        OpportunityRedirect.objects.filter(pk=redirect.pk).delete()


# --- the production cleanup command -------------------------------------------------------------------------
def run(*args: str) -> str:
    out = io.StringIO()
    call_command("merge_duplicate_listings", *args, stdout=out)
    return out.getvalue()


def test_the_dry_run_shows_both_listings_differences_and_the_redirect_and_changes_nothing(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    _keep, dup = pair
    report = json.loads(run("--duplicate", dup.slug or "", "--keep", KEEP, "--json"))
    assert report["status"] == "would merge" and report["mode"].startswith("dry-run")
    assert report["redirect"] == {
        "from": f"/opportunities/{dup.slug}",
        "to": f"/opportunities/{KEEP}",
        "status": 308,
        "exists": False,
    }
    assert any("82490" in s for s in report["shared_identifiers"])
    notes = " ".join(report["review_notes"])
    assert "Location differs" in notes and "Closing date is stated only on the kept listing" in notes
    assert report["conflicts"] == []
    dup.refresh_from_db()
    assert dup.status == ListingStatus.PUBLISHED and not OpportunityRedirect.objects.exists()


def test_apply_needs_evidence_and_an_editor_then_reruns_safely(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    _keep, dup = pair
    base = ("--duplicate", dup.slug or "", "--keep", KEEP, "--apply")
    with pytest.raises(CommandError, match="evidence"):
        run(*base, "--actor", "editor@example.org")
    with pytest.raises(CommandError, match="may not merge"):
        run(*base, "--actor", "author@example.org", "--evidence", "Issuer notice, job id 82490.")
    out = run(*base, "--actor", "editor@example.org", "--evidence", "Issuer notice, job id 82490.", "--json")
    applied = json.loads(out)
    assert applied["status"] == "merged" and applied["redirect_id"]
    redirect = OpportunityRedirect.objects.get()
    assert "Issuer notice, job id 82490." in redirect.reason
    assert redirect.review_notes == applied["review_notes"] and redirect.review_notes
    rerun = json.loads(
        run(*base, "--actor", "editor@example.org", "--evidence", "Issuer notice, again.", "--json")
    )
    assert rerun["status"] == "already merged" and OpportunityRedirect.objects.count() == 1
    dry = json.loads(run("--duplicate", dup.slug or "", "--keep", KEEP, "--json"))
    assert dry["status"] == "already merged" and dry["redirect"]["exists"] is True


def test_a_blocked_merge_fails_the_dry_run_and_the_scan_finds_identifier_pairs(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    keep, dup = pair
    with pytest.raises(CommandError, match="blocked"):
        run("--duplicate", KEEP, "--keep", KEEP)
    scan = json.loads(run("--scan", "--json"))
    assert len(scan["pairs"]) == 1
    assert {x["slug"] for x in scan["pairs"][0]["listings"]} == {KEEP, dup.slug}
    merge(people, keep, dup)
    assert json.loads(run("--scan", "--json"))["pairs"] == []


def test_the_merge_queues_a_removal_for_the_duplicate_address_when_indexing_is_live(
    people: dict[str, User], pair: tuple[Opportunity, Opportunity], settings: Any
) -> None:
    from indexing.models import IndexingNotification

    settings.UPNEXT_INDEXING_MODE = "record"
    keep, dup = pair
    merge(people, keep, dup)
    removal = IndexingNotification.objects.filter(transition="T16").first()
    assert (
        removal is not None
        and removal.url.endswith(f"/opportunities/{dup.slug}")
        and removal.action == "URL_DELETED"
    )


def test_old_whatsapp_links_with_tracking_parameters_still_resolve(
    client: APIClient, people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    """Shared links carry no parameters in the path the API sees; the web page drops the query on redirect. The API
    side only needs the slug to resolve."""
    keep, dup = pair
    merge(people, keep, dup)
    assert detail(client, dup.slug or "").json()["slug"] == KEEP


def test_a_listing_merged_while_its_deadline_has_passed_still_redirects(
    client: APIClient, people: dict[str, User], pair: tuple[Opportunity, Opportunity]
) -> None:
    keep, dup = pair
    merge(people, keep, dup)
    keep.refresh_from_db()
    workflow.expire(
        people["editor"], keep.pk, expected_row_version=keep.row_version, reason="The post has closed."
    )
    body = detail(
        client, dup.slug or ""
    ).json()  # the expired page stays readable (P2-01), so the link still works
    assert body["slug"] == KEEP and body["status"] == ListingStatus.EXPIRED
