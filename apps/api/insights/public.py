"""Public reads of Career Insights (D-78). Only the live snapshot is ever served: drafts,
approved-but-unpublished
versions and archived articles are invisible here. Nothing is counted or ranked that is not recorded (there
are no
popularity figures: the site records no per-article analytics)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.models import Count, Max, Q, QuerySet

from opportunities import images

from .models import Article, ArticleCategory, ArticleSlugRedirect, AuthorProfile

# A public author archive exists only once an author has this many live articles (no thin archive pages).
AUTHOR_ARCHIVE_MIN = 3
GRADUATE_CATEGORY = "graduates-and-internships"


def live() -> QuerySet[Article]:
    return Article.objects.filter(live__isnull=False).select_related("live_category", "author")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


def _profiles(articles: list[Article]) -> dict[Any, AuthorProfile]:
    ids = {a.author_id for a in articles}
    return {p.user_id: p for p in AuthorProfile.objects.filter(user_id__in=ids)}


def _author_counts(ids: set[Any]) -> dict[Any, int]:
    rows = live().filter(author_id__in=ids).values("author_id").annotate(n=Count("id"))
    return {r["author_id"]: r["n"] for r in rows}


def _author(article: Article, profile: AuthorProfile | None, counts: dict[Any, int]) -> dict[str, Any]:
    name = profile.display_name if profile else (article.live or {}).get("author_name") or "UPNEXT Careers"
    archive = bool(profile and profile.is_public and counts.get(article.author_id, 0) >= AUTHOR_ARCHIVE_MIN)
    return {"name": name, "slug": profile.slug if archive and profile else None}


def card(article: Article, profile: AuthorProfile | None, counts: dict[Any, int]) -> dict[str, Any]:
    snap = article.live or {}
    image = images.url_of(snap.get("featured_image"))
    return {
        "slug": article.live_slug,
        "headline": article.live_headline,
        "summary": article.live_summary,
        "category": snap.get("category"),
        "author": _author(article, profile, counts),
        "published_at": _iso(article.first_published_at),
        "updated_at": _iso(article.material_updated_at),
        "reading_minutes": snap.get("reading_minutes", 1),
        "image": {"url": image, "alt": snap.get("image_alt", "")} if image else None,
    }


def cards(articles: list[Article]) -> list[dict[str, Any]]:
    profiles = _profiles(articles)
    counts = _author_counts({a.author_id for a in articles})
    return [card(a, profiles.get(a.author_id), counts) for a in articles]


def detail(article: Article) -> dict[str, Any]:
    snap = article.live or {}
    profile = AuthorProfile.objects.filter(user_id=article.author_id).first()
    counts = _author_counts({article.author_id})
    out = card(article, profile, counts)
    image = images.url_of(snap.get("featured_image"))
    social_image = images.url_of(snap.get("social_image")) or image
    out.update(
        {
            "body_html": snap.get("body_html", ""),
            "in_short": snap.get("in_short", []),
            "why_it_matters": snap.get("why_it_matters", ""),
            "tags": snap.get("tags", []),
            "sources": snap.get("sources", []),
            "image": (
                {
                    "url": image,
                    "alt": snap.get("image_alt", ""),
                    "caption": snap.get("image_caption", ""),
                    "credit": snap.get("image_credit", ""),
                }
                if image
                else None
            ),
            "canonical_url": snap.get("canonical_url") or None,
            "seo": {
                "title": snap.get("search_title") or None,
                "description": snap.get("search_description") or None,
                "social_title": snap.get("social_title") or None,
                "social_description": snap.get("social_description") or None,
                "social_image": social_image,
            },
            "opportunity_categories": snap.get("opportunity_categories", []),
            "word_count": snap.get("word_count", 0),
        }
    )
    if profile and profile.is_public:
        out["author"].update(
            {
                "bio": profile.bio or None,
                "expertise": list(profile.expertise),
                "image": images.url_of(profile.image) if profile.image else None,
            }
        )
    out["related"] = cards(related(article))
    return out


def related(article: Article, limit: int = 3) -> list[Article]:
    """Same category first, then shared tags; newest first. A transparent rule, never a guess."""
    base = live().exclude(pk=article.pk)
    chosen: list[Article] = []
    if article.live_category_id:
        chosen += list(
            base.filter(live_category_id=article.live_category_id).order_by("-first_published_at")[:limit]
        )
    if len(chosen) < limit and article.live_tags:
        tag_match = Q()
        for slug in article.live_tags:
            tag_match |= Q(live_tags__contains=[slug])
        more = base.filter(tag_match).exclude(pk__in=[a.pk for a in chosen]).order_by("-first_published_at")
        chosen += list(more[: limit - len(chosen)])
    return chosen


def find(slug: str) -> Article | None:
    """The live article at this address, or the one an earlier address of it now points to."""
    found = live().filter(live_slug=slug.lower()).first()
    if found:
        return found
    redirect = ArticleSlugRedirect.objects.filter(old_slug=slug.lower()).select_related("article").first()
    if redirect and redirect.article.live is not None:
        return live().filter(pk=redirect.article_id).first()
    return None


def search(
    *, q: str = "", category: str = "", tag: str = "", author: str = "", opportunity_category: str = ""
) -> QuerySet[Article]:
    qs = live()
    if category:
        qs = qs.filter(live_category__slug=category)
    if tag:
        qs = qs.filter(live_tags__contains=[tag])
    if author:
        qs = qs.filter(author__author_profile__slug=author, author__author_profile__is_public=True)
    if opportunity_category:
        qs = qs.filter(live_opportunity_categories__contains=[opportunity_category])
    terms = " ".join(q.split())[:100]
    if terms:
        vector = (
            SearchVector("live_headline", weight="A", config="english")
            + SearchVector("live_summary", weight="B", config="english")
            + SearchVector("live_text", weight="C", config="english")
        )
        query = SearchQuery(terms, search_type="websearch", config="english")
        return (
            qs.annotate(rank=SearchRank(vector, query))
            .filter(rank__gt=0)
            .order_by("-rank", "-first_published_at", "id")
        )
    return qs.order_by("-first_published_at", "id")


def categories_with_counts() -> list[dict[str, Any]]:
    counts = {
        r["live_category_id"]: (r["n"], r["latest"])
        for r in live().values("live_category_id").annotate(n=Count("id"), latest=Max("material_updated_at"))
    }
    out = []
    for c in ArticleCategory.objects.filter(active=True).order_by("display_order", "name"):
        n, latest = counts.get(c.pk, (0, None))
        out.append(
            {
                "slug": c.slug,
                "name": c.name,
                "description": c.description,
                "seo_title": c.seo_title or None,
                "seo_description": c.seo_description or None,
                "count": n,
                "updated_at": _iso(latest),
            }
        )
    return out


def home() -> dict[str, Any]:
    recent = live().order_by("-first_published_at", "id")
    featured = recent.filter(is_featured=True).first()
    top = recent.filter(is_top_story=True).first()
    carousel = list(recent.filter(is_carousel=True)[:6])
    latest = list((recent.exclude(pk=featured.pk) if featured else recent)[:6])
    graduate = list(recent.filter(live_category__slug=GRADUATE_CATEGORY)[:3])
    singles = [a for a in (featured, top) if a]
    return {
        "featured": cards([featured])[0] if featured else None,
        "top_story": cards([top])[0] if top else None,
        "carousel": cards(carousel),
        "latest": cards(latest),
        "graduate": cards(graduate),
        "categories": categories_with_counts(),
        "total": recent.count(),
        "has_articles": bool(singles or latest),
    }


def author_archive(slug: str) -> tuple[AuthorProfile, list[Article]] | None:
    profile = AuthorProfile.objects.filter(slug=slug, is_public=True).first()
    if profile is None:
        return None
    articles = list(live().filter(author_id=profile.user_id).order_by("-first_published_at"))
    if len(articles) < AUTHOR_ARCHIVE_MIN:
        return None
    return profile, articles


def sitemap() -> dict[str, Any]:
    rows = live().order_by("live_slug").values_list("live_slug", "material_updated_at", "published_at")
    articles = [{"slug": s, "updated_at": _iso(m or p)} for s, m, p in rows]
    cats = [c for c in categories_with_counts() if c["count"] > 0]
    authors = []
    for p in AuthorProfile.objects.filter(is_public=True):
        if live().filter(author_id=p.user_id).count() >= AUTHOR_ARCHIVE_MIN:
            authors.append({"slug": p.slug})
    latest = max((a["updated_at"] for a in articles if a["updated_at"]), default=None)
    return {
        "articles": articles,
        "categories": [{"slug": c["slug"], "updated_at": c["updated_at"]} for c in cats],
        "authors": authors,
        "updated_at": latest,
    }
