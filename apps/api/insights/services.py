"""The Career Insights publishing service (D-78): every change to an article goes through here.

Rules, enforced in the same transaction as the change and re-checked by database constraints and triggers:

* Authors write and submit their own articles (`insights.write`); editors with `insights.review` may also edit
  others' drafts. Nobody reviews, approves, rejects or returns an article they wrote, created or submitted.
* Approval needs every item of the editorial checklist and covers the exact material content
(`approved_hash`).
  A material change after approval clears it and the article returns to draft (D-18, D-22 applied to
  articles).
* Publication (`insights.publish`) copies the approved working copy to the live snapshot; until then readers
see the
  previous live version, if any. Archiving removes the live version. Placement flags change public placement
  only.
* Every save carries the `row_version` the editor loaded; a stale one is refused (no silent overwrite).
* Every action is recorded as an `ArticleEvent` and in the audit log.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Mapping
from datetime import date
from typing import Any
from urllib.parse import urlparse

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

from access.registry import Permission
from accounts.models import AccountStatus, User
from audit import services as audit
from catalog.models import Category
from opportunities import images
from opportunities.errors import (
    FieldErrors,
    InvalidTransition,
    NotFoundError,
    PermissionDeniedError,
    SeparationOfDuties,
    StateConflict,
    ValidationFailed,
)
from opportunities.models import MediaAsset

from . import sanitize
from .models import (
    Article,
    ArticleCategory,
    ArticleEvent,
    ArticleReview,
    ArticleSlugRedirect,
    ArticleStatus,
    ArticleTag,
    AuthorProfile,
    ReviewDecision,
)

S = ArticleStatus
P = Permission

# The editorial review checklist (D-78): every item must be confirmed to approve.
CHECKLIST = (
    "accuracy",
    "originality",
    "source_quality",
    "reader_usefulness",
    "clarity",
    "formatting",
    "image_rights",
    "internal_links",
    "seo_metadata",
    "publication_readiness",
)
CHECKLIST_LABELS = {
    "accuracy": "Facts are accurate and checked against the listed sources; nothing is invented",
    "originality": "The article is original and offers value beyond what it cites",
    "source_quality": "Sources are credible and primary where possible; links open the stated source",
    "reader_usefulness": "It solves a real reader problem, with Zimbabwe-specific context where relevant",
    "clarity": "It is clearly written, without filler or a misleading headline",
    "formatting": "Headings, lists and tables are used correctly; reader aids match the body",
    "image_rights": "Images may be used; alt text, caption and credit are accurate",
    "internal_links": "Internal links work and point to relevant UPNEXT pages",
    "seo_metadata": "Search and social text is accurate and not misleading",
    "publication_readiness": "The article is ready to publish as it stands",
}

MATERIAL_FIELDS = (
    "headline",
    "summary",
    "body_html",
    "in_short",
    "why_it_matters",
    "category_id",
    "sources",
    "featured_image",
    "image_alt",
    "image_caption",
    "image_credit",
    "opportunity_categories",
)
LIMITS = {
    "headline": (10, 160),
    "summary": (0, 400),
    "why_it_matters": (0, 600),
    "image_alt": (0, 250),
    "image_caption": (0, 300),
    "image_credit": (0, 200),
    "search_title": (0, 70),
    "search_description": (0, 170),
    "social_title": (0, 95),
    "social_description": (0, 200),
}
MAX_TAKEAWAYS = 6
MAX_SOURCES = 20
MAX_TAGS = 8


# --- helpers -----------------------------------------------------------------------------------------------
def _can(user: User, code: Permission) -> bool:
    return bool(user.is_active and user.has_permission_code(code))


def _require(user: User, code: Permission) -> None:
    if not _can(user, code):
        raise PermissionDeniedError()


def _people(article: Article) -> set[uuid.UUID]:
    """Everyone who wrote or put the article forward; none of them may review it."""
    ids = {article.author_id, article.created_by_id}
    if article.submitted_by_id:
        ids.add(article.submitted_by_id)
    return {i for i in ids if i}


def material_hash(article: Article) -> str:
    data = {name: getattr(article, name) for name in MATERIAL_FIELDS}
    data["category_id"] = str(data["category_id"]) if data["category_id"] else None
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def public_url(slug: str) -> str:
    return f"{settings.UPNEXT_PUBLIC_BASE_URL.rstrip('/')}/insights/{slug}"


def _event(
    article: Article, actor: User, action: str, before: str, detail: dict[str, Any] | None = None
) -> None:
    ArticleEvent.objects.create(
        article=article,
        action=action,
        from_status=before,
        to_status=article.status,
        actor=actor,
        detail=detail or {},
    )
    audit.record(
        action=f"article.{action}",
        object_type="insights.article",
        object_id=article.pk,
        actor_id=actor.pk,
        changes={"from": before, "to": article.status, **(detail or {})},
    )


def _lock(article_id: uuid.UUID | str) -> Article:
    try:
        return Article.objects.select_for_update().get(pk=article_id)
    except (Article.DoesNotExist, ValueError, TypeError) as exc:
        raise NotFoundError() from exc


def may_edit(user: User, article: Article) -> bool:
    if _can(user, P.INSIGHTS_REVIEW):
        return True
    return _can(user, P.INSIGHTS_WRITE) and user.pk in (article.author_id, article.created_by_id)


def may_view(user: User, article: Article) -> bool:
    """Drafts are private: their writers and editorial reviewers only."""
    return may_edit(user, article) or _can(user, P.INSIGHTS_PUBLISH)


def _taken(candidate: str, exclude: uuid.UUID | None) -> bool:
    articles = Article.objects.filter(Q(slug=candidate) | Q(live_slug=candidate))
    redirects = ArticleSlugRedirect.objects.filter(old_slug=candidate)
    if exclude is not None:
        articles = articles.exclude(pk=exclude)
        redirects = redirects.exclude(article_id=exclude)
    return articles.exists() or redirects.exists()


def writers() -> list[User]:
    """Active staff who may write articles (the choices for author reassignment)."""
    people = (
        User.objects.filter(status=AccountStatus.ACTIVE, role_assignments__revoked_at__isnull=True)
        .distinct()
        .order_by("display_name")[:300]
    )
    return [u for u in people if u.has_permission_code(P.INSIGHTS_WRITE)]


def unique_slug(base: str, *, exclude: uuid.UUID | None = None) -> str:
    root = (slugify(base)[:100] or "article").strip("-") or "article"
    candidate, n = root, 1
    while _taken(candidate, exclude):
        n += 1
        candidate = f"{root}-{n}"
    return candidate


def normalise_tag(name: str) -> tuple[str, str]:
    clean = " ".join(name.split())[:60]
    return clean, slugify(clean)[:60]


# --- validation of the editable payload -----------------------------------------------------------------
def _text(data: Mapping[str, Any], key: str, errors: FieldErrors) -> str | None:
    if key not in data:
        return None
    value = data[key]
    if value is None:
        value = ""
    if not isinstance(value, str):
        errors[key] = [("invalid", "Must be text.")]
        return None
    value = value.strip()
    lo, hi = LIMITS.get(key, (0, 10_000))
    if len(value) > hi:
        errors[key] = [("too_long", f"At most {hi} characters.")]
    elif value and len(value) < lo:
        errors[key] = [("too_short", f"At least {lo} characters.")]
    elif sanitize.has_markup(value):
        errors[key] = [("markup", "Plain text only.")]
    return value


def _https(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc) and " " not in value


def _library_name(value: str, key: str, errors: FieldErrors) -> str:
    """A Media Library picture, by its storage name or its public address."""
    if not value:
        return ""
    name = value
    marker = "/media/"
    if marker in name:
        name = name.split(marker, 1)[1]
    if not images.is_stored_name(name) or not MediaAsset.objects.filter(name=name).exists():
        errors[key] = [("invalid", "Choose a picture from the Media Library.")]
        return ""
    return name


def _date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        return "invalid"


def _sources(raw: Any, errors: FieldErrors) -> list[dict[str, Any]] | None:
    if not isinstance(raw, list) or len(raw) > MAX_SOURCES:
        errors["sources"] = [("invalid", f"A list of at most {MAX_SOURCES} sources.")]
        return None
    out = []
    for item in raw:
        if not isinstance(item, Mapping):
            errors["sources"] = [("invalid", "Each source needs a title.")]
            return None
        title = str(item.get("title") or "").strip()
        publisher = str(item.get("publisher") or "").strip()
        url = str(item.get("url") or "").strip()
        published = _date(item.get("published_on"))
        accessed = _date(item.get("accessed_on"))
        if not title or len(title) > 300 or len(publisher) > 200 or sanitize.has_markup(title + publisher):
            errors["sources"] = [("invalid", "Each source needs a plain title (300 characters at most).")]
            return None
        if url and (not _https(url) or len(url) > 1000):
            errors["sources"] = [("invalid", "Source links must be full https addresses.")]
            return None
        if "invalid" in (published, accessed):
            errors["sources"] = [("invalid", "Dates must be in the form YYYY-MM-DD.")]
            return None
        out.append(
            {
                "title": title,
                "publisher": publisher,
                "url": url,
                "published_on": published,
                "accessed_on": accessed,
            }
        )
    return out


def _apply(actor: User, article: Article, data: Mapping[str, Any], *, creating: bool) -> list[str]:
    """Validate and copy the editable fields onto the article. Returns the tag names to set (or []
    unchanged)."""
    errors: FieldErrors = {}
    allowed = {
        "headline", "summary", "body_html", "in_short", "why_it_matters", "category", "sources",
        "featured_image", "image_alt", "image_caption", "image_credit", "opportunity_categories", "tags",
        "canonical_url", "search_title", "search_description", "social_title", "social_description",
        "social_image", "slug", "confirm_slug_change", "author_id", "expected_row_version",
    }  # fmt: skip
    unknown = set(data) - allowed
    if unknown:
        errors["body"] = [("unknown_fields", "Unknown fields: " + ", ".join(sorted(unknown)))]
    for key in (
        "headline", "summary", "why_it_matters", "image_alt", "image_caption", "image_credit",
        "search_title", "search_description", "social_title", "social_description",
    ):  # fmt: skip
        value = _text(data, key, errors)
        if value is not None and key not in errors:
            setattr(article, key, value)
    if creating and not article.headline:
        errors["headline"] = [("required", "Write a headline.")]
    if "body_html" in data:
        raw = data["body_html"] or ""
        if not isinstance(raw, str) or len(raw) > 400_000:
            errors["body_html"] = [("invalid", "The body is too long.")]
        else:
            article.body_html = sanitize.clean_body(raw)
            article.body_text = sanitize.plain_text(article.body_html)
    if "in_short" in data:
        items = data["in_short"]
        if not isinstance(items, list) or len(items) > MAX_TAKEAWAYS:
            errors["in_short"] = [("invalid", f"At most {MAX_TAKEAWAYS} takeaways.")]
        else:
            clean = [str(i).strip() for i in items if str(i).strip()]
            if any(len(i) > 200 or sanitize.has_markup(i) for i in clean):
                errors["in_short"] = [("invalid", "Each takeaway is plain text of 200 characters at most.")]
            else:
                article.in_short = clean
    if "category" in data:
        slug = data["category"]
        if slug in (None, ""):
            article.category = None
        else:
            found = ArticleCategory.objects.filter(slug=str(slug), active=True).first()
            if found is None:
                errors["category"] = [("invalid", "Choose an active category.")]
            else:
                article.category = found
    if "sources" in data:
        sources = _sources(data["sources"], errors)
        if sources is not None:
            article.sources = sources
    if "opportunity_categories" in data:
        codes = data["opportunity_categories"]
        known = set(Category.objects.filter(active=True).values_list("code", flat=True))
        if not isinstance(codes, list) or any(c not in known for c in codes):
            errors["opportunity_categories"] = [("invalid", "Choose from the opportunity categories.")]
        else:
            article.opportunity_categories = sorted(set(codes))
    for key in ("featured_image", "social_image"):
        if key in data:
            value = data[key] or ""
            article.__setattr__(key, _library_name(str(value).strip(), key, errors) if value else "")
    if "canonical_url" in data:
        value = str(data["canonical_url"] or "").strip()
        if value.rstrip("/") == public_url(article.slug):
            # The article's own address is the default: storing it would only risk a stale copy after a slug
            # change.
            article.canonical_url = ""
        elif value and (not _https(value) or len(value) > 500):
            errors["canonical_url"] = [("invalid", "Use a full https address, or leave it empty.")]
        else:
            article.canonical_url = value
    if "slug" in data:
        wanted = slugify(str(data["slug"] or ""))[:120]
        if not wanted:
            errors["slug"] = [("invalid", "Use letters, numbers and hyphens.")]
        elif wanted != article.slug:
            if article.first_published_at and not data.get("confirm_slug_change"):
                errors["slug"] = [
                    (
                        "published",
                        "This article is public. Confirm the change: its old address will redirect.",
                    )
                ]
            elif unique_slug(wanted, exclude=article.pk) != wanted:
                errors["slug"] = [("taken", "Another article uses this address.")]
            else:
                article.slug = wanted
    if "author_id" in data and data["author_id"] and str(data["author_id"]) != str(article.author_id):
        if not _can(actor, P.INSIGHTS_PUBLISH):
            errors["author_id"] = [("permission_denied", "Only an editor may change the author.")]
        else:
            new_author = User.objects.filter(pk=data["author_id"], status=AccountStatus.ACTIVE).first()
            if new_author is None or not new_author.has_permission_code(P.INSIGHTS_WRITE):
                errors["author_id"] = [("invalid", "The author must be an active staff writer.")]
            else:
                article.author = new_author
    tags: list[str] = []
    if "tags" in data:
        raw_tags = data["tags"]
        if not isinstance(raw_tags, list) or len(raw_tags) > MAX_TAGS:
            errors["tags"] = [("invalid", f"At most {MAX_TAGS} tags.")]
        else:
            tags = [normalise_tag(str(t))[0] for t in raw_tags if str(t).strip()]
            if any(sanitize.has_markup(t) or not normalise_tag(t)[1] for t in tags):
                errors["tags"] = [("invalid", "Tags are short plain words.")]
            tags = tags or ["__clear__"]
    if errors:
        raise ValidationFailed(errors)
    return tags


def _set_tags(article: Article, names: list[str]) -> None:
    if not names:
        return
    if names == ["__clear__"]:
        article.tags.clear()
        return
    chosen = []
    for name in names:
        clean, slug = normalise_tag(name)
        tag, _ = ArticleTag.objects.get_or_create(slug=slug, defaults={"name": clean})
        if tag not in chosen:
            chosen.append(tag)
    article.tags.set(chosen)


# --- creating and saving ------------------------------------------------------------------------------------
def create(actor: User, data: Mapping[str, Any]) -> Article:
    _require(actor, P.INSIGHTS_WRITE)
    with transaction.atomic():
        headline = str(data.get("headline") or "").strip()
        article = Article(
            author=actor,
            created_by=actor,
            headline=headline,
            slug=unique_slug(str(data.get("slug") or headline)),
        )
        payload = {k: v for k, v in data.items() if k != "slug"}
        tags = _apply(actor, article, payload, creating=True)
        article.content_hash = material_hash(article)
        try:
            article.save()
        except IntegrityError as exc:  # two people taking the same address at once
            raise StateConflict("That address was just taken; try again.") from exc
        _set_tags(article, tags)
        _event(article, actor, "created", "")
        return article


def save(actor: User, article_id: uuid.UUID | str, data: Mapping[str, Any]) -> Article:
    """Save the working copy. Refused while the article is with a reviewer; clears an approval on a material
    change."""
    with transaction.atomic():
        article = _lock(article_id)
        if not may_edit(actor, article):
            raise PermissionDeniedError()
        expected = data.get("expected_row_version")
        if not isinstance(expected, int) or expected != article.row_version:
            raise StateConflict(
                "Someone else saved this article since you opened it. Reload to see their changes."
            )
        if article.status in (S.SUBMITTED, S.IN_REVIEW):
            raise InvalidTransition("The article is with a reviewer. Ask them to return it before editing.")
        before = article.status
        tags = _apply(actor, article, data, creating=False)
        article.content_hash = material_hash(article)
        detail: dict[str, Any] = {}
        if article.status in (S.APPROVED, S.PUBLISHED) and article.content_hash != article.approved_hash:
            article.status = S.DRAFT
            article.approved_by = None
            article.approved_at = None
            article.approved_hash = ""
            detail["approval_cleared"] = True
        elif article.status == S.PUBLISHED and _working_differs_from_live(article, tags):
            article.status = S.APPROVED  # only non-material changes: still approved, republish to apply them
        elif article.status == S.ARCHIVED:
            article.status = S.DRAFT
        article.row_version += 1
        try:
            article.save()
        except IntegrityError as exc:
            raise StateConflict("That address was just taken; choose another.") from exc
        _set_tags(article, tags)
        _event(article, actor, "saved", before, detail)
        return article


def _working_differs_from_live(article: Article, tags: list[str]) -> bool:
    live = article.live or {}
    if tags:
        return True
    return any(
        live.get(key) != getattr(article, key)
        for key in (
            "slug", "canonical_url", "search_title", "search_description", "social_title",
            "social_description", "social_image",
        )
    )  # fmt: skip


# --- workflow -----------------------------------------------------------------------------------------------
def _completeness(article: Article) -> FieldErrors:
    errors: FieldErrors = {}
    if len(article.summary) < 30:
        errors["summary"] = [("required", "Write a summary of at least 30 characters.")]
    if len(article.body_text.split()) < 50:
        errors["body_html"] = [("required", "The body needs some substance before review.")]
    if article.category_id is None:
        errors["category"] = [("required", "Choose a category.")]
    if article.featured_image and not article.image_alt:
        errors["image_alt"] = [("required", "Describe the picture for people who cannot see it.")]
    return errors


def submit(actor: User, article_id: uuid.UUID | str) -> Article:
    with transaction.atomic():
        article = _lock(article_id)
        _require(actor, P.INSIGHTS_WRITE)
        if not may_edit(actor, article):
            raise PermissionDeniedError()
        if article.status != S.DRAFT:
            raise InvalidTransition("Only a draft can be submitted.")
        errors = _completeness(article)
        if errors:
            raise ValidationFailed(errors, "The article is not ready for review.")
        before = article.status
        article.status = S.SUBMITTED
        article.submitted_by = actor
        article.submitted_at = timezone.now()
        article.row_version += 1
        article.save()
        _event(article, actor, "submitted", before)
        return article


def _reviewer(actor: User, article: Article) -> None:
    _require(actor, P.INSIGHTS_REVIEW)
    if actor.pk in _people(article):
        raise SeparationOfDuties("You cannot review an article you wrote, created or submitted.")


def start_review(actor: User, article_id: uuid.UUID | str) -> Article:
    with transaction.atomic():
        article = _lock(article_id)
        _reviewer(actor, article)
        if article.status != S.SUBMITTED:
            raise InvalidTransition("Only a submitted article can be taken for review.")
        before = article.status
        article.status = S.IN_REVIEW
        article.row_version += 1
        article.save()
        _event(article, actor, "review_started", before)
        return article


def approve(
    actor: User, article_id: uuid.UUID | str, checklist: Mapping[str, Any], note: str = ""
) -> Article:
    with transaction.atomic():
        article = _lock(article_id)
        _reviewer(actor, article)
        if article.status not in (S.SUBMITTED, S.IN_REVIEW):
            raise InvalidTransition("Only an article under review can be approved.")
        missing = [k for k in CHECKLIST if checklist.get(k) is not True]
        if missing:
            raise ValidationFailed(
                {"checklist": [("incomplete", "Confirm every item of the review checklist.")]},
                "The review checklist is not complete.",
            )
        before = article.status
        now = timezone.now()
        article.status = S.APPROVED
        article.approved_by = actor
        article.approved_at = now
        article.approved_hash = article.content_hash
        article.row_version += 1
        article.save()
        ArticleReview.objects.create(
            article=article,
            decision=ReviewDecision.APPROVED,
            checklist=dict.fromkeys(CHECKLIST, True),
            note=note.strip()[:2000],
            content_hash=article.content_hash,
            decided_by=actor,
            decided_at=now,
        )
        _event(article, actor, "approved", before)
        return article


def send_back(actor: User, article_id: uuid.UUID | str, *, decision: str, note: str) -> Article:
    """Reject or return an article under review to its author, with the reason (required)."""
    if decision not in (ReviewDecision.REJECTED, ReviewDecision.RETURNED):
        raise InvalidTransition()
    with transaction.atomic():
        article = _lock(article_id)
        _reviewer(actor, article)
        if article.status not in (S.SUBMITTED, S.IN_REVIEW):
            raise InvalidTransition("Only an article under review can be sent back.")
        reason = (note or "").strip()
        if not reason:
            raise ValidationFailed({"note": [("required", "Tell the author why.")]})
        before = article.status
        article.status = S.DRAFT
        article.row_version += 1
        article.save()
        ArticleReview.objects.create(
            article=article,
            decision=decision,
            checklist={},
            note=reason[:2000],
            content_hash=article.content_hash,
            decided_by=actor,
        )
        _event(article, actor, decision, before, {"note": reason[:500]})
        return article


def _snapshot(article: Article) -> dict[str, Any]:
    profile = AuthorProfile.objects.filter(user=article.author).first()
    return {
        "slug": article.slug,
        "headline": article.headline,
        "summary": article.summary,
        "body_html": article.body_html,
        "in_short": list(article.in_short),
        "why_it_matters": article.why_it_matters,
        "category": {"slug": article.category.slug, "name": article.category.name}
        if article.category
        else None,
        "tags": [{"slug": t.slug, "name": t.name} for t in article.tags.order_by("name")],
        "sources": list(article.sources),
        "featured_image": article.featured_image,
        "image_alt": article.image_alt,
        "image_caption": article.image_caption,
        "image_credit": article.image_credit,
        "opportunity_categories": list(article.opportunity_categories),
        "canonical_url": article.canonical_url,
        "search_title": article.search_title,
        "search_description": article.search_description,
        "social_title": article.social_title,
        "social_description": article.social_description,
        "social_image": article.social_image,
        "author_name": profile.display_name if profile else article.author.display_name,
        "reading_minutes": sanitize.reading_minutes(article.body_text),
        "word_count": len(article.body_text.split()),
    }


def publish(actor: User, article_id: uuid.UUID | str) -> Article:
    with transaction.atomic():
        article = _lock(article_id)
        _require(actor, P.INSIGHTS_PUBLISH)
        if article.status != S.APPROVED or not article.approved_hash:
            raise InvalidTransition("Only an approved article can be published.")
        if article.approved_hash != article.content_hash:
            raise InvalidTransition("The approval does not cover the current text; it needs a new review.")
        before = article.status
        now = timezone.now()
        old_slug = article.live_slug
        if old_slug and old_slug != article.slug:
            ArticleSlugRedirect.objects.update_or_create(old_slug=old_slug, defaults={"article": article})
        ArticleSlugRedirect.objects.filter(
            old_slug=article.slug
        ).delete()  # the address is this article's again
        snapshot = _snapshot(article)
        if article.live_hash != article.content_hash:
            article.material_updated_at = now
        article.live = snapshot
        article.live_slug = article.slug
        article.live_headline = article.headline
        article.live_summary = article.summary
        article.live_category = article.category
        article.live_tags = [t["slug"] for t in snapshot["tags"]]
        article.live_opportunity_categories = list(article.opportunity_categories)
        article.live_text = " ".join(
            [
                article.headline,
                article.summary,
                article.body_text,
                article.category.name if article.category else "",
                " ".join(t["name"] for t in snapshot["tags"]),
            ]
        )
        article.live_hash = article.content_hash
        article.first_published_at = article.first_published_at or now
        article.published_at = now
        article.archived_at = None
        article.status = S.PUBLISHED
        article.row_version += 1
        article.save()
        _event(
            article, actor, "published", before, {"slug": article.slug, "redirected_from": old_slug or None}
        )
        return article


def archive(actor: User, article_id: uuid.UUID | str) -> Article:
    with transaction.atomic():
        article = _lock(article_id)
        _require(actor, P.INSIGHTS_PUBLISH)
        if article.status == S.ARCHIVED:
            raise InvalidTransition("The article is already archived.")
        before = article.status
        article.live = None
        article.live_hash = ""
        article.is_featured = article.is_carousel = article.is_top_story = False
        article.status = S.ARCHIVED
        article.archived_at = timezone.now()
        article.row_version += 1
        article.save()
        _event(article, actor, "archived", before)
        return article


def set_placement(actor: User, article_id: uuid.UUID | str, flags: Mapping[str, Any]) -> Article:
    with transaction.atomic():
        article = _lock(article_id)
        _require(actor, P.INSIGHTS_PUBLISH)
        changed = {}
        for key in ("is_featured", "is_carousel", "is_top_story"):
            if key in flags:
                if not isinstance(flags[key], bool):
                    raise ValidationFailed({key: [("invalid", "true or false")]})
                if flags[key] and article.live is None:
                    raise ValidationFailed({key: [("not_live", "Only a published article can be placed.")]})
                if getattr(article, key) != flags[key]:
                    setattr(article, key, flags[key])
                    changed[key] = flags[key]
        if changed:
            article.row_version += 1
            article.save()
            _event(article, actor, "placement", article.status, changed)
        return article


# --- categories, tags and author profiles ---------------------------------------------------------------
def save_category(
    actor: User, data: Mapping[str, Any], category: ArticleCategory | None = None
) -> ArticleCategory:
    _require(actor, P.INSIGHTS_MANAGE)
    errors: FieldErrors = {}
    target = category or ArticleCategory()
    for key, limit in (("name", 80), ("description", 600), ("seo_title", 70), ("seo_description", 170)):
        if key in data:
            value = str(data[key] or "").strip()
            if len(value) > limit or sanitize.has_markup(value):
                errors[key] = [("invalid", f"Plain text, at most {limit} characters.")]
            else:
                setattr(target, key, value)
    if not target.name:
        errors["name"] = [("required", "Name the category.")]
    if "slug" in data or not target.slug:
        slug = slugify(str(data.get("slug") or target.name))[:80]
        clash = ArticleCategory.objects.filter(slug=slug).exclude(pk=target.pk).exists()
        if not slug or clash:
            errors["slug"] = [("taken", "Another category uses this address.")]
        else:
            target.slug = slug
    if "display_order" in data:
        try:
            target.display_order = max(0, min(1000, int(data["display_order"])))
        except TypeError, ValueError:
            errors["display_order"] = [("invalid", "A number.")]
    if "active" in data:
        target.active = bool(data["active"])
    if errors:
        raise ValidationFailed(errors)
    with transaction.atomic():
        try:
            target.save()
        except IntegrityError as exc:
            raise ValidationFailed({"name": [("taken", "Another category has this name.")]}) from exc
        audit.record(
            action="article_category.saved",
            object_type="insights.category",
            object_id=target.pk,
            actor_id=actor.pk,
            changes={"slug": target.slug, "active": target.active},
        )
    return target


def save_profile(actor: User, user: User, data: Mapping[str, Any]) -> AuthorProfile:
    """Your own author profile, or anyone's with `insights.manage`. Nothing is filled in for the author."""
    if actor.pk != user.pk:
        _require(actor, P.INSIGHTS_MANAGE)
    else:
        _require(actor, P.INSIGHTS_WRITE)
    profile = AuthorProfile.objects.filter(user=user).first() or AuthorProfile(
        user=user, display_name=user.display_name
    )
    errors: FieldErrors = {}
    if "display_name" in data:
        value = str(data["display_name"] or "").strip()
        if not value or len(value) > 120 or sanitize.has_markup(value):
            errors["display_name"] = [("invalid", "A plain name of 120 characters at most.")]
        else:
            profile.display_name = value
    if "bio" in data:
        value = str(data["bio"] or "").strip()
        if len(value) > 1500 or sanitize.has_markup(value):
            errors["bio"] = [("invalid", "Plain text, 1,500 characters at most.")]
        else:
            profile.bio = value
    if "expertise" in data:
        items = data["expertise"]
        if not isinstance(items, list) or len(items) > 8:
            errors["expertise"] = [("invalid", "At most 8 areas.")]
        else:
            clean = [" ".join(str(i).split())[:60] for i in items if str(i).strip()]
            if any(sanitize.has_markup(i) for i in clean):
                errors["expertise"] = [("invalid", "Plain text.")]
            else:
                profile.expertise = clean
    if "image" in data:
        profile.image = (
            _library_name(str(data["image"] or "").strip(), "image", errors) if data["image"] else ""
        )
    if "is_public" in data:
        profile.is_public = bool(data["is_public"])
    if not profile.slug:
        base = slugify(profile.display_name)[:100] or "author"
        slug, n = base, 1
        while AuthorProfile.objects.filter(slug=slug).exclude(user=user).exists():
            n += 1
            slug = f"{base}-{n}"
        profile.slug = slug
    if errors:
        raise ValidationFailed(errors)
    with transaction.atomic():
        profile.save()
        audit.record(
            action="author_profile.saved",
            object_type="insights.author",
            object_id=user.pk,
            actor_id=actor.pk,
            changes={"public": profile.is_public},
        )
    return profile
