"""The editorial CMS in the Django Admin: visibility by role, safe editing, actions that go through the
service, audit and the staff login throttle."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from accounts.models import StaffRoleAssignment, User
from audit.models import AuditEvent
from opportunities import workflow
from opportunities.models import ListingStatus, Opportunity, OpportunityVersion
from tests.factories import CHECKLIST, World, approved, new_draft, published, submitted, varied

pytestmark = pytest.mark.django_db

CHANGELIST = "/staff/opportunities/opportunity/"


def logged_in(user: User) -> Client:
    client = Client()
    client.force_login(user)
    return client


def form_errors(response: Any) -> str:
    """Readable form and inline errors for a re-rendered admin form (assertion messages)."""
    context = getattr(response, "context_data", None) or {}
    parts = [str(context["adminform"].form.errors)] if "adminform" in context else []
    parts += [str(fs.errors) for fs in context.get("inline_admin_formsets", [])]
    return " | ".join(parts) or response.content.decode()[:300]


def action_url(opp: Opportunity, action: str) -> str:
    return reverse("admin:opportunities_opportunity_action", args=[opp.pk, action])


def titles_in(client: Client, query: str = "") -> str:
    response = client.get(CHANGELIST + query)
    assert response.status_code == 200, response.status_code
    return str(response.content.decode())


# --- access ------------------------------------------------------------------------------------------
def test_only_staff_reach_the_staff_site(people: dict[str, User]) -> None:
    anonymous = Client().get(CHANGELIST)
    assert anonymous.status_code == 302 and "/staff/login/" in anonymous["Location"]
    seeker = logged_in(people["seeker"]).get(CHANGELIST)
    assert seeker.status_code == 302 and "/staff/login/" in seeker["Location"]
    assert logged_in(people["author"]).get(CHANGELIST).status_code == 200


def test_listing_page_is_read_only_and_state_cannot_be_posted(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    admin_client = logged_in(people["admin"])
    url = reverse("admin:opportunities_opportunity_change", args=[opp.pk])
    assert admin_client.get(url).status_code == 200
    response = admin_client.post(url, {"status": "published", "slug": "forced-slug-123456"})
    assert response.status_code == 403
    assert admin_client.post(
        reverse("admin:opportunities_opportunity_delete", args=[opp.pk])
    ).status_code in {403, 404}
    opp.refresh_from_db()
    assert opp.status == ListingStatus.IN_REVIEW and opp.slug is None


def test_taxonomies_are_for_administrators_only(people: dict[str, User]) -> None:
    for who, code in (("author", 403), ("editor", 403), ("admin", 200)):
        assert logged_in(people[who]).get("/staff/catalog/sector/add/").status_code == code, who
    assert logged_in(people["admin"]).get("/staff/catalog/detailschema/add/").status_code == 403


def test_organisations_can_be_created_by_contributors_but_edited_only_by_editors(
    world: World, people: dict[str, User]
) -> None:
    contributor = logged_in(people["author"])
    assert contributor.get("/staff/catalog/organisation/add/").status_code == 200
    org_id = next(iter(world.organisations.values()))
    assert (
        contributor.get(f"/staff/catalog/organisation/{org_id}/change/").status_code == 200
    )  # read-only view
    assert (
        contributor.post(f"/staff/catalog/organisation/{org_id}/change/", {"name": "Hijack"}).status_code
        == 403
    )
    response = logged_in(people["editor"]).post(
        f"/staff/catalog/organisation/{org_id}/change/",
        {"name": "Example Power Services Ltd", "website_url": ""},
    )
    assert response.status_code == 302
    assert AuditEvent.objects.filter(action="organisation.update", object_id=org_id).exists()


# --- visibility by role (matrix §2.2) ---------------------------------------------------------------------
def test_each_role_sees_only_what_the_matrix_allows(world: World, people: dict[str, User]) -> None:
    mine = new_draft(world, people["author"], **varied(world, "jobs-1", "mine-visible"))
    other_draft = new_draft(
        world, people["author_editor"], "internships-1", **varied(world, "internships-1", "theirs-draft")
    )
    in_review = submitted(
        world, people["author_editor"], "scholarships-1", **varied(world, "scholarships-1", "theirs-review")
    )
    live = published(world, people["author_editor"], people["editor"], example="grants-1")
    contributor = titles_in(logged_in(people["author"]))
    assert (
        "mine-visible" in contributor
        and "theirs-draft" not in contributor
        and "theirs-review" not in contributor
    )
    editor = titles_in(logged_in(people["editor"]))
    assert "theirs-review" in editor and "Community Enterprise Growth Grant" in editor
    assert "mine-visible" not in editor and "theirs-draft" not in editor  # other people's drafts stay private
    admin = titles_in(logged_in(people["admin"]))
    assert "mine-visible" in admin and "theirs-draft" in admin and "theirs-review" in admin
    assert {mine.pk, other_draft.pk, in_review.pk, live.pk}


def test_administrator_reading_a_draft_is_audited(world: World, people: dict[str, User]) -> None:
    draft = new_draft(world, people["author"])
    response = logged_in(people["admin"]).get(
        reverse("admin:opportunities_opportunity_change", args=[draft.pk])
    )
    assert response.status_code == 200
    assert AuditEvent.objects.filter(
        action="opportunity.view_draft",
        object_id=draft.pk,
        actor_ref=people["admin"].pk,
        severity="privileged",
    ).exists()
    assert (
        logged_in(people["editor"])
        .get(reverse("admin:opportunities_opportunity_change", args=[draft.pk]))
        .status_code
        == 302
    )


# --- status indicators, filters and search (usability) -----------------------------------------------------
def test_status_is_written_in_words_and_filters_and_search_work(
    world: World, people: dict[str, User]
) -> None:
    live = published(world, people["author"], people["editor"], example="jobs-1")
    waiting = submitted(world, people["author"], "tenders-1")
    ready = approved(world, people["author"], people["editor"], "internships-1")
    admin = logged_in(people["admin"])
    page = titles_in(admin)
    for text in ("Published", "In review", "Approved - ready to publish", "Not verified", "Not stated"):
        assert text in page
    assert "Solar Water Heating" in titles_in(admin, "?status__exact=in_review")
    assert "Graduate Electrical Engineer" not in titles_in(admin, "?status__exact=in_review")
    assert "ICT Industrial Attachment" in titles_in(admin, "?queue=ready")
    assert "Solar Water Heating" in titles_in(admin, "?q=solar")
    assert "Solar Water Heating" not in titles_in(admin, "?q=electrical")
    assert "Graduate Electrical Engineer" in titles_in(admin, f"?category__id__exact={live.category_id}")
    assert "Solar Water Heating" in titles_in(logged_in(people["editor"]), "?queue=review")
    assert "Solar Water Heating" not in titles_in(logged_in(people["author"]), "?queue=ready")
    assert {waiting.pk, ready.pk}


def test_titles_are_escaped_in_the_staff_interface(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"], title="<script>alert(1)</script> Officer")
    page = titles_in(logged_in(people["author"]))
    assert "<script>alert(1)</script>" not in page and "&lt;script&gt;" in page
    assert opp.pk


# --- creating and editing drafts ---------------------------------------------------------------------------
def test_contributor_starts_a_draft_and_the_category_is_fixed(world: World, people: dict[str, User]) -> None:
    client = logged_in(people["author"])
    add = "/staff/opportunities/opportunity/add/"
    assert client.get(add).status_code == 200
    assert (
        logged_in(people["editor"]).get(add).status_code == 404
        or logged_in(people["editor"]).get(add).status_code == 403
    )
    category = next(iter(world.organisations))  # placeholder to keep the dict used
    assert category
    from catalog.models import Category

    response = client.post(
        add,
        {
            "category": Category.objects.get(code="tenders").pk,
            "organisation": next(iter(world.organisations.values())),
            "title": "New tender",
        },
    )
    assert response.status_code == 302
    opp = Opportunity.objects.latest("created_at")
    assert opp.category.code == "tenders" and opp.status == ListingStatus.DRAFT
    assert opp.created_by_id == people["author"].pk
    assert client.get(response["Location"]).status_code == 200


def version_post(opp: Opportunity, **overrides: Any) -> dict[str, Any]:
    version = opp.pending_version
    assert version is not None
    data: dict[str, Any] = {
        "organisation": str(version.organisation_id),
        "title": "Graduate Electrical Engineer",
        "summary": "Support distribution projects and site inspections at an electricity services company.",
        "description_md": "Example Power Services is recruiting a **Graduate Electrical Engineer** to assist engineers on network projects.",
        "requirements_md": "",
        "location_text": "",
        "geographic_eligibility": "",
        "work_mode": "on_site",
        "employment_type": "permanent",
        "experience_level": "entry",
        "salary_min": "700.00", "salary_max": "900.00", "salary_currency": "USD", "salary_period": "month",
        "funding_min": "", "funding_max": "", "funding_currency": "", "funding_period": "",
        "deadline_date": (timezone.now() + timedelta(days=30)).date().isoformat(), "deadline_time": "16:30",
        "deadline_timezone": "Africa/Harare",
        "application_method": "external_url", "application_url": "https://careers.example.org/graduate-electrical-engineer",
        "application_email": "", "application_instructions": "", "reference_number": "GEE-1", "contact_details": "",
        "detail": "{}",
        "locations-TOTAL_FORMS": "1", "locations-INITIAL_FORMS": "0", "locations-MIN_NUM_FORMS": "0", "locations-MAX_NUM_FORMS": "1000",
        "skills-TOTAL_FORMS": "0", "skills-INITIAL_FORMS": "0", "skills-MIN_NUM_FORMS": "0", "skills-MAX_NUM_FORMS": "1000",
        "sectors-TOTAL_FORMS": "0", "sectors-INITIAL_FORMS": "0", "sectors-MIN_NUM_FORMS": "0", "sectors-MAX_NUM_FORMS": "1000",
        "sources-TOTAL_FORMS": "1", "sources-INITIAL_FORMS": "0", "sources-MIN_NUM_FORMS": "0", "sources-MAX_NUM_FORMS": "1000",
        "locations-0-location": "", "locations-0-is_primary": "on",
        "sources-0-kind": "issuer_website", "sources-0-name": "Example Power Services careers page",
        "sources-0-url": "https://careers.example.org/vacancies/graduate-electrical-engineer", "sources-0-citation": "",
        "sources-0-observed_on": timezone.now().date().isoformat(), "sources-0-is_primary": "on",
        "_save": "Save",
    }  # fmt: skip
    data.update(overrides)
    return data


def test_author_edits_a_draft_in_the_cms_and_submits_it(world: World, people: dict[str, User]) -> None:
    from catalog.models import Location
    from tests.factories import new_draft as start

    opp = start(
        world, people["author"], "jobs-1", title="Placeholder title for edit", locations=[], sources=[]
    )
    client = logged_in(people["author"])
    url = reverse("admin:opportunities_opportunityversion_change", args=[opp.pending_version_id])
    assert client.get(url).status_code == 200
    refused = client.post(
        url,
        version_post(
            opp,
            **{
                "locations-0-location": str(Location.objects.get(slug="harare").pk),
                "application_url": "http://insecure.example.org/apply",
            },
        ),
        follow=True,
    )
    assert "must use https" in refused.content.decode()
    opp.refresh_from_db()
    assert (
        opp.pending_version is not None
        and opp.pending_version.application_url != "http://insecure.example.org/apply"
    )
    ok = client.post(
        url, version_post(opp, **{"locations-0-location": str(Location.objects.get(slug="harare").pk)})
    )
    assert ok.status_code == 302, form_errors(ok)
    opp.refresh_from_db()
    version = opp.pending_version
    assert version is not None
    assert (
        version.title == "Graduate Electrical Engineer"
        and version.locations.count() == 1
        and version.sources.count() == 1
    )
    assert version.deadline_at is not None and version.deadline_timezone == "Africa/Harare"
    # submitting goes through the service and freezes the revision
    response = client.post(action_url(opp, "submit"), {"row_version": opp.row_version})
    assert response.status_code == 302
    opp.refresh_from_db()
    assert opp.status == ListingStatus.IN_REVIEW
    assert client.post(url, version_post(opp)).status_code == 403  # frozen: no longer editable here


def test_other_people_cannot_edit_someone_elses_draft(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["author"])
    url = reverse("admin:opportunities_opportunityversion_change", args=[opp.pending_version_id])
    for who in ("author_editor", "editor"):
        assert logged_in(people[who]).post(url, version_post(opp)).status_code in {302, 403, 404}
    opp.refresh_from_db()
    assert opp.pending_version is not None and opp.pending_version.title != "Hacked"
    admin_response = logged_in(people["admin"]).post(url, version_post(opp, title="Hacked"))
    assert admin_response.status_code == 403  # support access is read-only
    opp.pending_version.refresh_from_db()
    assert opp.pending_version.title != "Hacked"


# --- actions go through the service ----------------------------------------------------------------------------
def test_editor_approves_and_publishes_through_the_cms(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    editor = logged_in(people["editor"])
    page = editor.get(reverse("admin:opportunities_opportunity_change", args=[opp.pk])).content.decode()
    assert action_url(opp, "approve") in page and action_url(opp, "reject") in page
    incomplete = editor.post(
        action_url(opp, "approve"), {"row_version": opp.row_version, "source_reviewed": "on"}
    )
    assert incomplete.status_code == 200  # form errors, nothing approved
    done = editor.post(
        action_url(opp, "approve"),
        {
            "row_version": opp.row_version,
            "source_reviewed": "on",
            "duplicates_reviewed": "on",
            "content_matches_source": "on",
        },
    )
    assert done.status_code == 302
    opp.refresh_from_db()
    assert opp.status == ListingStatus.APPROVED
    assert editor.post(action_url(opp, "publish"), {"row_version": opp.row_version}).status_code == 302
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED and opp.slug


def test_author_with_editor_authority_is_not_offered_and_cannot_force_approval(
    world: World, people: dict[str, User]
) -> None:
    author = people["author_editor"]
    opp = submitted(world, author)
    client = logged_in(author)
    page = client.get(reverse("admin:opportunities_opportunity_change", args=[opp.pk])).content.decode()
    assert action_url(opp, "approve") not in page
    forced = client.post(
        action_url(opp, "approve"),
        {
            "row_version": opp.row_version,
            "source_reviewed": "on",
            "duplicates_reviewed": "on",
            "content_matches_source": "on",
        },
    )
    assert forced.status_code == 302 and "/action/" not in forced["Location"]
    opp.refresh_from_db()
    assert opp.status == ListingStatus.IN_REVIEW and opp.row_version == opp.row_version
    # the same person may publish after someone else approved the exact revision
    workflow.approve(people["editor"], opp.pk, expected_row_version=opp.row_version, checklist=CHECKLIST)
    opp.refresh_from_db()
    assert (
        action_url(opp, "publish")
        in client.get(reverse("admin:opportunities_opportunity_change", args=[opp.pk])).content.decode()
    )
    assert client.post(action_url(opp, "publish"), {"row_version": opp.row_version}).status_code == 302
    opp.refresh_from_db()
    assert opp.status == ListingStatus.PUBLISHED


def test_stale_action_pages_are_refused(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    editor = logged_in(people["editor"])
    stale = opp.row_version - 1
    response = editor.post(
        action_url(opp, "reject"),
        {"row_version": stale, "reason_code": "x", "reason": "The source is unclear to me."},
    )
    assert response.status_code == 302
    opp.refresh_from_db()
    assert opp.status == ListingStatus.IN_REVIEW


def test_reject_withdraw_takedown_and_verify_forms(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    editor = logged_in(people["editor"])
    assert (
        editor.post(
            action_url(opp, "reject"),
            {"row_version": opp.row_version, "reason_code": "source", "reason": "short"},
        ).status_code
        == 200
    )
    assert (
        editor.post(
            action_url(opp, "reject"),
            {
                "row_version": opp.row_version,
                "reason_code": "source",
                "reason": "The cited source does not show a deadline.",
            },
        ).status_code
        == 302
    )
    opp.refresh_from_db()
    assert opp.status == ListingStatus.REJECTED
    live = published(world, people["author"], people["editor"], example="jobs-2")
    assert (
        editor.post(
            action_url(live, "verify"),
            {
                "row_version": live.row_version,
                "version_no": 1,
                "level": "issuer_verified",
                "method": "source_page_review",
                "outcome": "confirmed",
                "evidence_note": "Compared the page with the issuer notice.",
            },
        ).status_code
        == 200  # the service refuses; the form is shown again with the reason
    )
    live.refresh_from_db()
    assert live.verification_level == "not_verified"  # refused: a page review is not issuer verification
    assert (
        editor.post(
            action_url(live, "verify"),
            {
                "row_version": live.row_version,
                "version_no": 1,
                "level": "source_checked",
                "method": "source_page_review",
                "outcome": "confirmed",
                "evidence_note": "Compared the page with the issuer notice.",
            },
        ).status_code
        == 302
    )
    live.refresh_from_db()
    assert live.verification_level == "source_checked"
    assert (
        editor.post(
            action_url(live, "takedown"),
            {
                "row_version": live.row_version,
                "reason_code": "error",
                "reason": "Published in error by mistake.",
            },
        ).status_code
        == 302
    )
    live.refresh_from_db()
    assert live.status == ListingStatus.ARCHIVED and live.archive_reason == "takedown"


def test_unknown_actions_and_missing_listings_are_404(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    editor = logged_in(people["editor"])
    assert editor.get(action_url(opp, "nonsense")).status_code == 404
    assert Client().get(action_url(opp, "approve")).status_code == 302  # anonymous: sent to log in


def test_every_cms_action_is_audited_with_the_acting_role(world: World, people: dict[str, User]) -> None:
    opp = submitted(world, people["author"])
    logged_in(people["admin"]).post(
        action_url(opp, "approve"),
        {
            "row_version": opp.row_version,
            "source_reviewed": "on",
            "duplicates_reviewed": "on",
            "content_matches_source": "on",
        },
    )
    event = AuditEvent.objects.get(object_id=opp.pk, action="opportunity.approve")
    assert (
        event.changes
        and event.changes["capacity"] == "administrator"
        and event.actor_ref == people["admin"].pk
    )


# --- staff login throttle ----------------------------------------------------------------------------------------
def test_staff_login_is_throttled_and_does_not_reveal_which_part_was_wrong(people: dict[str, User]) -> None:
    cache.clear()
    client = Client()
    login = "/staff/login/?next=/staff/"
    statuses = []
    for _ in range(7):
        response = client.post(login, {"username": people["admin"].email, "password": "wrong-password-123"})
        statuses.append(response.status_code)
    assert set(statuses) == {200}
    body = client.post(
        login, {"username": people["admin"].email, "password": "correct horse battery staple 42"}
    ).content.decode()
    assert "Too many failed sign-in attempts" in body  # even the right password is refused while blocked
    cache.clear()
    ok = client.post(
        login, {"username": people["admin"].email, "password": "correct horse battery staple 42"}
    )
    assert ok.status_code == 302


# --- role management command -------------------------------------------------------------------------------------
def test_manage_staff_role_is_audited_and_requires_an_administrator(people: dict[str, User]) -> None:
    args = [
        "--email",
        people["seeker"].email,
        "--role",
        "contributor",
        "--reason",
        "Joins the editorial team.",
        "--by",
    ]
    with pytest.raises(CommandError):
        call_command("manage_staff_role", "grant", *args, people["editor"].email)
    call_command("manage_staff_role", "grant", *args, people["admin"].email)
    assert "contributor" in User.objects.get(pk=people["seeker"].pk).active_roles()
    with pytest.raises(CommandError):
        call_command("manage_staff_role", "grant", *args, people["admin"].email)  # already held
    call_command("manage_staff_role", "revoke", *args, people["admin"].email)
    row = StaffRoleAssignment.objects.filter(user=people["seeker"], role="contributor").latest("granted_at")
    assert row.revoked_at is not None and row.revoked_by_id == people["admin"].pk
    actions = list(AuditEvent.objects.filter(object_id=people["seeker"].pk).values_list("action", flat=True))
    assert actions == ["role.grant", "role.revoke"]
    with pytest.raises(CommandError):
        call_command(
            "manage_staff_role",
            "grant",
            "--email",
            "nobody@example.org",
            "--role",
            "editor",
            "--reason",
            "A valid reason here.",
            "--by",
            people["admin"].email,
        )
    with pytest.raises(CommandError):
        call_command("manage_staff_role", "revoke", *args, people["admin"].email)  # not held any more


def test_seed_demo_loads_every_category_and_respects_the_rules(people: dict[str, User]) -> None:
    call_command("seed_demo", "--force")
    live = Opportunity.objects.filter(status=ListingStatus.PUBLISHED)
    assert set(live.values_list("category__code", flat=True)) == {
        "jobs", "internships", "graduate-programmes", "scholarships", "tenders", "grants"
    }  # fmt: skip
    assert live.count() == 12
    for opp in live:
        assert opp.live_version is not None
        assert opp.live_version.approved_by_id != opp.live_version.author_id
    assert Opportunity.objects.exclude(status=ListingStatus.PUBLISHED).count() == 4
    call_command("seed_demo", "--force")  # idempotent
    assert Opportunity.objects.count() == 16
    assert OpportunityVersion.objects.filter(state="published").count() == 12
