"""Career Insights CMS (D-78): workflow, permissions, separation of duties, sanitising, public reads and SEO feeds."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditEvent
from insights import public, sanitize, services
from insights.models import Article, ArticleCategory, ArticleReview, ArticleStatus, ArticleTag
from opportunities.errors import (
    InvalidTransition,
    PermissionDeniedError,
    SeparationOfDuties,
    StateConflict,
    ValidationFailed,
)
from opportunities.models import MediaAsset

from .test_staff_api import send, signed_in

pytestmark = pytest.mark.django_db
S = ArticleStatus
CHECKS = dict.fromkeys(services.CHECKLIST, True)
BODY = "<h2>Start here</h2>" + "".join(
    f"<p>Paragraph {i} explains a practical step for job seekers in Zimbabwe, with an example.</p>"
    for i in range(8)
)


def picture() -> str:
    name = f"listings/{uuid.uuid4().hex}.jpg"
    MediaAsset.objects.create(name=name, title="Interview room")
    return name


def draft(author: User, **extra: Any) -> Article:
    data = {
        "headline": "How to prepare a CV for Zimbabwean employers",
        "summary": "A practical structure for a CV that screeners can read in a minute, with examples.",
        "body_html": BODY,
        "category": "cvs-and-interviews",
        **extra,
    }
    return services.create(author, data)


def approved(people: dict[str, User], **extra: Any) -> Article:
    article = draft(people["author"], **extra)
    services.submit(people["author"], article.pk)
    services.approve(people["editor"], article.pk, CHECKS)
    article.refresh_from_db()
    return article


def published(people: dict[str, User], **extra: Any) -> Article:
    article = approved(people, **extra)
    services.publish(people["editor2"], article.pk)
    article.refresh_from_db()
    return article


# --- the full journey (acceptance criteria 1-14) -------------------------------------------------------------
def test_create_save_submit_review_approve_publish_edit_archive(people: dict[str, User]) -> None:
    author, editor, publisher = people["author"], people["editor"], people["editor2"]
    image = picture()
    article = services.create(author, {"headline": "Finding industrial attachment in Zimbabwe"})
    assert article.status == S.DRAFT and article.slug == "finding-industrial-attachment-in-zimbabwe"
    article = services.save(
        author,
        article.pk,
        {
            "expected_row_version": article.row_version,
            "summary": "Where engineering and business students find attachment places, and how to apply.",
            "body_html": BODY,
            "in_short": ["Start a semester early", "Get your institution's letter first"],
            "why_it_matters": "Most degree and diploma programmes require attachment before graduation.",
            "category": "graduates-and-internships",
            "tags": ["Attachment", "attachment ", "Engineering"],
            "featured_image": image,
            "image_alt": "Two students at a workbench",
            "image_credit": "UPNEXT Careers",
            "search_title": "Finding industrial attachment in Zimbabwe",
            "search_description": "How students find attachment places and what employers ask for.",
            "opportunity_categories": ["internships"],
            "sources": [
                {
                    "title": "Attachment handbook",
                    "publisher": "Example University",
                    "url": "https://example.ac.zw/a",
                }
            ],
        },
    )
    assert sorted(t.slug for t in article.tags.all()) == [
        "attachment",
        "engineering",
    ]  # normalised, no duplicate
    services.submit(author, article.pk)
    services.start_review(editor, article.pk)
    services.approve(editor, article.pk, CHECKS, "Checked against the handbook.")
    services.publish(publisher, article.pk)
    article.refresh_from_db()
    assert article.status == S.PUBLISHED and article.live and article.first_published_at
    shown = APIClient().get(f"/api/v1/insights/articles/{article.slug}").json()
    assert shown["headline"] == "Finding industrial attachment in Zimbabwe"
    assert shown["in_short"] == ["Start a semester early", "Get your institution's letter first"]
    assert (
        shown["image"]["alt"] == "Two students at a workbench"
        and shown["image"]["credit"] == "UPNEXT Careers"
    )
    assert shown["category"]["slug"] == "graduates-and-internships" and shown["reading_minutes"] >= 1
    # Edit through the CMS: readers keep the live version until the change is reviewed and published again.
    services.save(
        author,
        article.pk,
        {"expected_row_version": article.row_version, "headline": "Finding attachment: a guide"},
    )
    article.refresh_from_db()
    assert article.status == S.DRAFT and not article.approved_hash  # material change cleared the approval
    assert (
        APIClient()
        .get(f"/api/v1/insights/articles/{article.live_slug}")
        .json()["headline"]
        .startswith("Finding industrial")
    )
    services.archive(publisher, article.pk)
    assert APIClient().get(f"/api/v1/insights/articles/{article.live_slug}").status_code == 404
    actions = set(AuditEvent.objects.filter(object_id=article.pk).values_list("action", flat=True))
    assert {
        "article.created",
        "article.submitted",
        "article.approved",
        "article.published",
        "article.archived",
    } <= actions


# --- permissions and separation of duties --------------------------------------------------------------------
def test_seekers_cannot_write_and_contributors_cannot_publish(people: dict[str, User]) -> None:
    with pytest.raises(PermissionDeniedError):
        services.create(people["seeker"], {"headline": "Not allowed to write this"})
    article = approved(people)
    with pytest.raises(PermissionDeniedError):
        services.publish(people["author"], article.pk)


def test_nobody_reviews_their_own_article(people: dict[str, User]) -> None:
    article = draft(people["editor"])
    services.submit(people["editor"], article.pk)
    with pytest.raises(SeparationOfDuties):
        services.approve(people["editor"], article.pk, CHECKS)
    with pytest.raises(SeparationOfDuties):
        services.send_back(people["editor"], article.pk, decision="returned", note="Mine")


def test_the_database_refuses_a_review_by_the_author_and_edits_to_history(people: dict[str, User]) -> None:
    article = draft(people["editor"])
    with pytest.raises(IntegrityError), transaction.atomic():
        ArticleReview.objects.create(
            article=article, decision="approved", content_hash="x", decided_by=people["editor"]
        )
    services.submit(people["editor"], article.pk)
    services.approve(people["editor2"], article.pk, CHECKS)
    review = ArticleReview.objects.get(article=article)
    with pytest.raises(IntegrityError), transaction.atomic():
        ArticleReview.objects.filter(pk=review.pk).update(note="changed")


def test_the_database_refuses_a_live_version_that_was_not_approved(people: dict[str, User]) -> None:
    article = draft(people["author"])
    with pytest.raises(IntegrityError), transaction.atomic():
        Article.objects.filter(pk=article.pk).update(
            live={"headline": "x"}, live_hash="abc", first_published_at="2026-11-14T00:00:00Z"
        )


def test_approval_needs_the_whole_checklist_and_sending_back_needs_a_reason(people: dict[str, User]) -> None:
    article = draft(people["author"])
    services.submit(people["author"], article.pk)
    with pytest.raises(ValidationFailed):
        services.approve(people["editor"], article.pk, {**CHECKS, "accuracy": False})
    with pytest.raises(ValidationFailed):
        services.send_back(people["editor"], article.pk, decision="rejected", note=" ")
    services.send_back(
        people["editor"], article.pk, decision="rejected", note="Sources do not support the claim."
    )
    article.refresh_from_db()
    assert article.status == S.DRAFT
    assert ArticleReview.objects.get(article=article).decision == "rejected"


def test_submission_needs_a_complete_article(people: dict[str, User]) -> None:
    article = services.create(people["author"], {"headline": "An article with nothing in it yet"})
    with pytest.raises(ValidationFailed) as refused:
        services.submit(people["author"], article.pk)
    assert {"summary", "body_html", "category"} <= set(refused.value.fields)


def test_editing_is_refused_while_under_review_and_with_a_stale_version(people: dict[str, User]) -> None:
    article = draft(people["author"])
    with pytest.raises(StateConflict):
        services.save(
            people["author"],
            article.pk,
            {"expected_row_version": article.row_version - 1, "summary": "x" * 40},
        )
    services.submit(people["author"], article.pk)
    article.refresh_from_db()
    with pytest.raises(InvalidTransition):
        services.save(
            people["author"], article.pk, {"expected_row_version": article.row_version, "summary": "y" * 40}
        )


def test_a_non_material_change_keeps_the_approval(people: dict[str, User]) -> None:
    article = approved(people)
    services.save(
        people["author"],
        article.pk,
        {"expected_row_version": article.row_version, "search_title": "CVs in Zimbabwe", "tags": ["CV"]},
    )
    article.refresh_from_db()
    assert article.status == S.APPROVED and article.approved_hash == article.content_hash


def test_placement_only_for_live_articles_and_only_by_publishers(people: dict[str, User]) -> None:
    article = approved(people)
    with pytest.raises(ValidationFailed):
        services.set_placement(people["editor"], article.pk, {"is_featured": True})
    services.publish(people["editor"], article.pk)
    with pytest.raises(PermissionDeniedError):
        services.set_placement(people["author"], article.pk, {"is_featured": True})
    services.set_placement(people["editor"], article.pk, {"is_featured": True, "is_top_story": True})
    home = APIClient().get("/api/v1/insights/home").json()
    assert home["featured"]["slug"] == article.slug and home["top_story"]["slug"] == article.slug


# --- URLs, canonical and search metadata --------------------------------------------------------------------
def test_slugs_are_unique_and_a_published_address_change_redirects(people: dict[str, User]) -> None:
    first = draft(people["author"])
    second = draft(people["author"])
    assert second.slug == f"{first.slug}-2"
    article = published(people)
    with pytest.raises(ValidationFailed):
        services.save(
            people["author"],
            article.pk,
            {"expected_row_version": article.row_version, "slug": "new-cv-guide"},
        )
    services.save(
        people["author"],
        article.pk,
        {"expected_row_version": article.row_version, "slug": "new-cv-guide", "confirm_slug_change": True},
    )
    article.refresh_from_db()
    services.publish(people["editor"], article.pk)  # a slug change is not material: approval still holds
    old = article.live_slug
    article.refresh_from_db()
    shown = APIClient().get(f"/api/v1/insights/articles/{old}").json()
    assert shown["slug"] == "new-cv-guide"  # the web answers the old address with a permanent redirect


def test_canonical_must_be_https_and_the_own_address_is_not_stored(people: dict[str, User]) -> None:
    article = draft(people["author"])
    with pytest.raises(ValidationFailed):
        services.save(
            people["author"],
            article.pk,
            {"expected_row_version": article.row_version, "canonical_url": "http://example.org/a"},
        )
    services.save(
        people["author"],
        article.pk,
        {"expected_row_version": article.row_version, "canonical_url": services.public_url(article.slug)},
    )
    article.refresh_from_db()
    assert article.canonical_url == ""


def test_seo_fields_have_limits_and_images_come_from_the_library(people: dict[str, User]) -> None:
    article = draft(people["author"])
    with pytest.raises(ValidationFailed) as refused:
        services.save(
            people["author"],
            article.pk,
            {
                "expected_row_version": article.row_version,
                "search_title": "x" * 71,
                "featured_image": "https://evil.example/x.jpg",
            },
        )
    assert {"search_title", "featured_image"} <= set(refused.value.fields)


# --- sanitising --------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("dirty", "forbidden"),
    [
        ('<p onclick="steal()">Hi</p>', "onclick"),
        ("<script>alert(1)</script><p>ok</p>", "script"),
        ('<a href="javascript:alert(1)">x</a>', "javascript"),
        ('<img src="data:image/png;base64,AAAA" alt="x">', "data:"),
        ('<img src="http://insecure.example/x.jpg" alt="x">', "http://"),
        ('<p style="color:red">x</p>', "style"),
        ("<iframe src='https://x'></iframe>", "iframe"),
        ("<h1>Title</h1>", "<h1"),
    ],
)
def test_bodies_are_sanitised(dirty: str, forbidden: str) -> None:
    assert forbidden not in sanitize.clean_body(dirty)


def test_allowed_formatting_survives_sanitising() -> None:
    html = (
        "<h2>A</h2><h3>B</h3><p><strong>b</strong> <em>i</em> <u>u</u> <a href='https://x.org'>l</a></p>"
        "<ul><li>1</li></ul><ol><li>2</li></ol><blockquote><p>q</p></blockquote>"
        "<img src='/media/listings/a.jpg' alt='A chart'>"
        "<table><tbody><tr><th colspan='1'>H</th></tr><tr><td>D</td></tr></tbody></table>"
    )
    clean = sanitize.clean_body(html)
    for tag in (
        "<h2>",
        "<h3>",
        "<strong>",
        "<em>",
        "<u>",
        "<ul>",
        "<ol>",
        "<blockquote>",
        "<table>",
        "<th",
        "<td>",
        "<img",
    ):
        assert tag in clean, tag
    assert 'rel="noopener noreferrer"' in clean


def test_plain_fields_refuse_markup(people: dict[str, User]) -> None:
    with pytest.raises(ValidationFailed):
        services.create(people["author"], {"headline": "<b>Bold headline please</b>"})


# --- public reads, search, categories, authors and feeds ----------------------------------------------------
def test_drafts_are_never_public_and_staff_preview_is_staff_only(people: dict[str, User]) -> None:
    article = draft(people["author"])
    assert APIClient().get(f"/api/v1/insights/articles/{article.slug}").status_code == 404
    assert APIClient().get(f"/api/v1/staff/insights/articles/{article.pk}/preview").status_code in (401, 403)
    other = signed_in(people["author_editor"])
    assert other.get(f"/api/v1/staff/insights/articles/{article.pk}/preview").status_code == 200  # a reviewer
    assert signed_in(people["seeker"]).get(f"/api/v1/staff/insights/articles/{article.pk}").status_code == 403


def test_search_categories_tags_and_related(people: dict[str, User]) -> None:
    first = published(people, tags=["Interviews"])
    second = published(people, headline="Answering interview questions with confidence", tags=["Interviews"])
    found = APIClient().get("/api/v1/insights/articles?q=interview").json()
    assert second.slug in [r["slug"] for r in found["data"]]
    by_tag = APIClient().get("/api/v1/insights/articles?tag=interviews").json()["data"]
    assert {r["slug"] for r in by_tag} == {first.slug, second.slug}
    cats = {c["slug"]: c["count"] for c in APIClient().get("/api/v1/insights/categories").json()["data"]}
    assert cats["cvs-and-interviews"] == 2 and cats["career-advice"] == 0
    detail = APIClient().get(f"/api/v1/insights/articles/{first.slug}").json()
    assert [r["slug"] for r in detail["related"]] == [second.slug]
    empty = APIClient().get("/api/v1/insights/articles?q=zzzznotaword").json()
    assert empty["data"] == [] and empty["page"]["total"] == 0


def test_articles_are_linked_to_opportunity_categories(people: dict[str, User]) -> None:
    article = published(people, opportunity_categories=["graduate-programmes"])
    rows = (
        APIClient().get("/api/v1/insights/articles?opportunity_category=graduate-programmes").json()["data"]
    )
    assert [r["slug"] for r in rows] == [article.slug]
    assert APIClient().get("/api/v1/insights/articles?opportunity_category=tenders").json()["data"] == []


def test_author_archive_appears_only_with_enough_articles(people: dict[str, User]) -> None:
    services.save_profile(
        people["author"], people["author"], {"display_name": "Tendai Moyo", "bio": "Careers writer."}
    )
    profile_slug = people["author"].author_profile.slug
    published(people)
    assert APIClient().get(f"/api/v1/insights/authors/{profile_slug}").status_code == 404
    published(people)
    published(people)
    archive = APIClient().get(f"/api/v1/insights/authors/{profile_slug}").json()
    assert archive["name"] == "Tendai Moyo" and len(archive["articles"]) == public.AUTHOR_ARCHIVE_MIN


def test_sitemap_lists_live_articles_and_non_empty_categories(people: dict[str, User]) -> None:
    article = published(people)
    draft(people["author"])
    feed = APIClient().get("/api/v1/insights/sitemap").json()
    assert [a["slug"] for a in feed["articles"]] == [article.slug]
    assert [c["slug"] for c in feed["categories"]] == ["cvs-and-interviews"]
    assert feed["articles"][0]["updated_at"]


def test_categories_are_managed_by_administrators(people: dict[str, User]) -> None:
    with pytest.raises(PermissionDeniedError):
        services.save_category(people["editor"], {"name": "Something"})
    category = services.save_category(
        people["admin"], {"name": "Entrepreneurship", "description": "Starting out."}
    )
    assert category.slug == "entrepreneurship"
    with pytest.raises(ValidationFailed):
        services.save_category(people["admin"], {"name": "Another", "slug": "entrepreneurship"})
    assert ArticleCategory.objects.filter(active=True).count() == 8


# --- staff API ---------------------------------------------------------------------------------------------
def test_staff_api_creates_saves_and_runs_actions(people: dict[str, User]) -> None:
    author, editor = signed_in(people["author"]), signed_in(people["editor"])
    created = send(
        author, "post", "/api/v1/staff/insights/articles", {"headline": "Writing a cover letter that works"}
    )
    assert created.status_code == 201
    art = created.json()
    assert art["actions"] == ["save", "submit"]
    saved = send(
        author,
        "patch",
        f"/api/v1/staff/insights/articles/{art['id']}",
        {
            "expected_row_version": art["row_version"],
            "summary": "What to put in a cover letter for Zimbabwean employers, with an example letter.",
            "body_html": BODY + "<script>x()</script>",
            "category": "cvs-and-interviews",
        },
    )
    assert saved.status_code == 200 and "<script" not in saved.json()["body_html"]
    stale = send(
        author,
        "patch",
        f"/api/v1/staff/insights/articles/{art['id']}",
        {"expected_row_version": 1, "summary": "y" * 40},
    )
    assert stale.status_code == 409
    assert (
        send(author, "post", f"/api/v1/staff/insights/articles/{art['id']}/actions/submit").status_code == 200
    )
    detail = editor.get(f"/api/v1/staff/insights/articles/{art['id']}").json()
    assert "approve" in detail["actions"] and "publish" not in detail["actions"]
    approved_ = send(
        editor, "post", f"/api/v1/staff/insights/articles/{art['id']}/actions/approve", {"checklist": CHECKS}
    )
    assert approved_.status_code == 200 and "publish" in approved_.json()["actions"]
    assert (
        send(author, "post", f"/api/v1/staff/insights/articles/{art['id']}/actions/publish").status_code
        == 403
    )
    listing = author.get("/api/v1/staff/insights/articles?status=approved").json()
    assert [r["id"] for r in listing["data"]] == [art["id"]]
    meta = editor.get("/api/v1/staff/insights/meta").json()
    assert len(meta["checklist"]) == len(services.CHECKLIST) and meta["permissions"]["publish"] is True
    history = editor.get(f"/api/v1/staff/insights/articles/{art['id']}/history").json()
    assert [e["action"] for e in history["events"]][:2] == ["approved", "submitted"]


def test_contributors_see_only_their_own_articles(people: dict[str, User]) -> None:
    draft(people["editor"])
    mine = draft(people["author"])
    rows = signed_in(people["author"]).get("/api/v1/staff/insights/articles").json()["data"]
    assert [r["id"] for r in rows] == [str(mine.pk)]


def test_tags_are_normalised() -> None:
    assert services.normalise_tag("  Graduate   Trainee ") == ("Graduate Trainee", "graduate-trainee")
    ArticleTag.objects.create(name="CV", slug="cv")
    assert services.normalise_tag("cv")[1] == "cv"
