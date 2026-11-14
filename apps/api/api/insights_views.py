"""Career Insights API (D-78).

Public (`/api/v1/insights/...`, no session): the live snapshot only. Staff (`/api/v1/staff/insights/...`,
signed-in
staff with two-step proof): the working copy, the workflow actions, placement, categories, tags and author
profiles.
Every rule is enforced by `insights.services`; these views only parse requests and shape answers.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Q
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from access.registry import Permission
from accounts.models import AccountStatus, User
from catalog.models import Category
from insights import public, sanitize, services
from insights.models import (
    Article,
    ArticleCategory,
    ArticleStatus,
    ArticleTag,
    AuthorProfile,
)
from opportunities import images
from opportunities.errors import WorkflowError

from .employer_views import _body, _refused
from .errors import error_response
from .public_views import PublicView
from .staff_views import StaffView

P = Permission
S = ArticleStatus
PAGE_MAX = 24


def _iso(value: Any) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


def _int(raw: Any, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(raw)))
    except TypeError, ValueError:
        return default


def _not_found() -> Response:
    return error_response("not_found", "Not found.", status.HTTP_404_NOT_FOUND)


def _page(request: Request) -> tuple[int, int]:
    return _int(request.query_params.get("page"), 1, 1, 10_000), _int(
        request.query_params.get("limit"), 12, 1, PAGE_MAX
    )


# ===== public ===============================================================================================
class InsightsHomeView(PublicView):
    @extend_schema(operation_id="getInsightsHome", tags=["public"], responses={200: OpenApiResponse()})
    def get(self, request: Request) -> Response:
        return Response(public.home())


class InsightsArticleListView(PublicView):
    @extend_schema(
        operation_id="listInsightsArticles",
        tags=["public"],
        responses={200: OpenApiResponse(description="Published articles, newest first or by relevance")},
    )
    def get(self, request: Request) -> Response:
        page, limit = _page(request)
        params = request.query_params
        qs = public.search(
            q=params.get("q", ""),
            category=params.get("category", ""),
            tag=params.get("tag", ""),
            author=params.get("author", ""),
            opportunity_category=params.get("opportunity_category", ""),
        )
        total = qs.count()
        rows = list(qs[(page - 1) * limit : page * limit])
        pages = max(1, -(-total // limit))
        return Response(
            {
                "data": public.cards(rows),
                "page": {"page": page, "pages": pages, "total": total, "limit": limit},
            }
        )


class InsightsArticleDetailView(PublicView):
    @extend_schema(
        operation_id="getInsightsArticle",
        tags=["public"],
        responses={
            200: OpenApiResponse(
                description="The live article; `slug` differs when an old address was asked"
            ),
            404: None,
        },
    )
    def get(self, request: Request, slug: str) -> Response:
        article = public.find(slug)
        if article is None:
            return _not_found()
        return Response(public.detail(article))


class InsightsCategoryListView(PublicView):
    @extend_schema(operation_id="listInsightsCategories", tags=["public"], responses={200: OpenApiResponse()})
    def get(self, request: Request) -> Response:
        return Response({"data": public.categories_with_counts()})


class InsightsAuthorView(PublicView):
    @extend_schema(
        operation_id="getInsightsAuthor",
        tags=["public"],
        responses={200: OpenApiResponse(description="A public author archive"), 404: None},
    )
    def get(self, request: Request, slug: str) -> Response:
        found = public.author_archive(slug)
        if found is None:
            return _not_found()
        profile, articles = found
        return Response(
            {
                "name": profile.display_name,
                "slug": profile.slug,
                "bio": profile.bio or None,
                "expertise": list(profile.expertise),
                "image": images.url_of(profile.image) if profile.image else None,
                "articles": public.cards(articles),
            }
        )


class InsightsSitemapView(PublicView):
    @extend_schema(operation_id="getInsightsSitemap", tags=["public"], responses={200: OpenApiResponse()})
    def get(self, request: Request) -> Response:
        return Response(public.sitemap())


# ===== staff ================================================================================================
def _may_any(user: User) -> bool:
    return any(
        user.has_permission_code(c)
        for c in (P.INSIGHTS_WRITE, P.INSIGHTS_REVIEW, P.INSIGHTS_PUBLISH, P.INSIGHTS_MANAGE)
    )


def _person(user: User | None) -> dict[str, Any] | None:
    return {"id": str(user.pk), "name": user.display_name} if user else None


def actions_for(user: User, article: Article) -> list[str]:
    out: list[str] = []
    people = {article.author_id, article.created_by_id, article.submitted_by_id}
    reviewer = user.has_permission_code(P.INSIGHTS_REVIEW) and user.pk not in people
    if services.may_edit(user, article) and article.status not in (S.SUBMITTED, S.IN_REVIEW):
        out.append("save")
    if (
        article.status == S.DRAFT
        and services.may_edit(user, article)
        and user.has_permission_code(P.INSIGHTS_WRITE)
    ):
        out.append("submit")
    if article.status == S.SUBMITTED and reviewer:
        out.append("start_review")
    if article.status in (S.SUBMITTED, S.IN_REVIEW) and reviewer:
        out += ["approve", "reject", "return"]
    if user.has_permission_code(P.INSIGHTS_PUBLISH):
        if (
            article.status == S.APPROVED
            and article.approved_hash
            and article.approved_hash == article.content_hash
        ):
            out.append("publish")
        if article.status != S.ARCHIVED:
            out.append("archive")
        if article.live is not None:
            out.append("placement")
    return out


def _row(user: User, a: Article) -> dict[str, Any]:
    return {
        "id": str(a.pk),
        "headline": a.headline,
        "slug": a.slug,
        "status": a.status,
        "category": {"slug": a.category.slug, "name": a.category.name} if a.category else None,
        "author": _person(a.author),
        "created_at": _iso(a.created_at),
        "updated_at": _iso(a.updated_at),
        "published_at": _iso(a.first_published_at),
        "live": a.live is not None,
        "live_slug": a.live_slug or None,
        "is_featured": a.is_featured,
        "is_carousel": a.is_carousel,
        "is_top_story": a.is_top_story,
        "actions": actions_for(user, a),
    }


def _detail(user: User, a: Article) -> dict[str, Any]:
    out = _row(user, a)
    last_review = a.reviews.order_by("-decided_at").first()
    out.update(
        {
            "row_version": a.row_version,
            "summary": a.summary,
            "body_html": a.body_html,
            "in_short": a.in_short,
            "why_it_matters": a.why_it_matters,
            "sources": a.sources,
            "tags": [t.name for t in a.tags.order_by("name")],
            "featured_image": a.featured_image or None,
            "featured_image_url": images.url_of(a.featured_image) if a.featured_image else None,
            "image_alt": a.image_alt,
            "image_caption": a.image_caption,
            "image_credit": a.image_credit,
            "opportunity_categories": a.opportunity_categories,
            "canonical_url": a.canonical_url,
            "search_title": a.search_title,
            "search_description": a.search_description,
            "social_title": a.social_title,
            "social_description": a.social_description,
            "social_image": a.social_image or None,
            "social_image_url": images.url_of(a.social_image) if a.social_image else None,
            "public_url": services.public_url(a.live_slug or a.slug),
            "reading_minutes": sanitize.reading_minutes(a.body_text),
            "word_count": len(a.body_text.split()),
            "created_by": _person(a.created_by),
            "submitted_by": _person(a.submitted_by),
            "approved_by": _person(a.approved_by),
            "approval_valid": bool(a.approved_hash and a.approved_hash == a.content_hash),
            "last_review": (
                {
                    "decision": last_review.decision,
                    "note": last_review.note,
                    "by": last_review.decided_by.display_name,
                    "at": _iso(last_review.decided_at),
                }
                if last_review
                else None
            ),
        }
    )
    return out


def _visible(user: User, article_id: uuid.UUID) -> Article | None:
    article = (
        Article.objects.select_related("category", "author", "created_by", "submitted_by", "approved_by")
        .filter(pk=article_id)
        .first()
    )
    if article is None or not services.may_view(user, article):
        return None
    return article


class StaffInsightsView(StaffView):
    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        super().initial(request, *args, **kwargs)
        if not _may_any(self.user_of(request)):
            self.permission_denied(request)


class StaffArticleListView(StaffInsightsView):
    @extend_schema(
        operation_id="listStaffArticles",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Articles this person may see"), 403: None},
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        params = request.query_params
        qs = Article.objects.select_related("category", "author")
        if not (user.has_permission_code(P.INSIGHTS_REVIEW) or user.has_permission_code(P.INSIGHTS_PUBLISH)):
            qs = qs.filter(Q(author=user) | Q(created_by=user))
        if term := " ".join(params.get("q", "").split())[:100]:
            qs = qs.filter(headline__icontains=term)
        if (wanted := params.get("status")) in S.values:
            qs = qs.filter(status=wanted)
        if category := params.get("category"):
            qs = qs.filter(category__slug=category)
        if author := params.get("author"):
            try:
                qs = qs.filter(author_id=uuid.UUID(author))
            except ValueError:
                return error_response("invalid_filter", "Unknown author.", 400)
        order = {
            "created": "-created_at",
            "updated": "-updated_at",
            "published": "-first_published_at",
        }.get(params.get("sort", "updated"), "-updated_at")
        qs = qs.order_by(order, "id")
        page, limit = _page(request)
        total = qs.count()
        rows = list(qs[(page - 1) * limit : page * limit])
        return Response(
            {
                "data": [_row(user, a) for a in rows],
                "page": {"page": page, "pages": max(1, -(-total // limit)), "total": total, "limit": limit},
            }
        )

    @extend_schema(
        operation_id="createStaffArticle",
        tags=["staff"],
        request=None,
        responses={201: OpenApiResponse(description="The new draft"), 400: None, 403: None, 409: None},
    )
    def post(self, request: Request) -> Response:
        user = self.user_of(request)
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        try:
            article = services.create(user, data)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(_detail(user, article), status=status.HTTP_201_CREATED)


class StaffArticleView(StaffInsightsView):
    @extend_schema(
        operation_id="getStaffArticle",
        tags=["staff"],
        responses={200: OpenApiResponse(), 403: None, 404: None},
    )
    def get(self, request: Request, article_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        article = _visible(user, article_id)
        return Response(_detail(user, article)) if article else _not_found()

    @extend_schema(
        operation_id="saveStaffArticle",
        tags=["staff"],
        request=None,
        responses={200: OpenApiResponse(), 400: None, 403: None, 404: None, 409: None},
    )
    def patch(self, request: Request, article_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        if _visible(user, article_id) is None:
            return _not_found()
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        try:
            article = services.save(user, article_id, data)
        except WorkflowError as exc:
            return _refused(exc)
        fresh = _visible(user, article.pk)
        assert fresh is not None
        return Response(_detail(user, fresh))


class StaffArticleActionView(StaffInsightsView):
    @extend_schema(
        operation_id="runStaffArticleAction",
        tags=["staff"],
        request=None,
        responses={200: OpenApiResponse(), 400: None, 403: None, 404: None, 409: None},
    )
    def post(self, request: Request, article_id: uuid.UUID, action: str) -> Response:
        user = self.user_of(request)
        if _visible(user, article_id) is None:
            return _not_found()
        data = _body(request) or {}
        note = str(data.get("note") or "")
        try:
            if action == "submit":
                services.submit(user, article_id)
            elif action == "start_review":
                services.start_review(user, article_id)
            elif action == "approve":
                checklist = data.get("checklist")
                services.approve(user, article_id, checklist if isinstance(checklist, dict) else {}, note)
            elif action in ("reject", "return"):
                services.send_back(
                    user, article_id, decision="rejected" if action == "reject" else "returned", note=note
                )
            elif action == "publish":
                services.publish(user, article_id)
            elif action == "archive":
                services.archive(user, article_id)
            else:
                return _not_found()
        except WorkflowError as exc:
            return _refused(exc)
        fresh = _visible(user, article_id)
        return Response(_detail(user, fresh)) if fresh else _not_found()


class StaffArticlePlacementView(StaffInsightsView):
    @extend_schema(
        operation_id="setStaffArticlePlacement",
        tags=["staff"],
        request=None,
        responses={200: OpenApiResponse(), 400: None, 403: None, 404: None},
    )
    def put(self, request: Request, article_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        if _visible(user, article_id) is None:
            return _not_found()
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        try:
            article = services.set_placement(user, article_id, data)
        except WorkflowError as exc:
            return _refused(exc)
        fresh = _visible(user, article.pk)
        assert fresh is not None
        return Response(_detail(user, fresh))


class StaffArticlePreviewView(StaffInsightsView):
    @extend_schema(
        operation_id="previewStaffArticle",
        tags=["staff"],
        responses={
            200: OpenApiResponse(description="The working copy in the public shape"),
            403: None,
            404: None,
        },
    )
    def get(self, request: Request, article_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        article = _visible(user, article_id)
        if article is None:
            return _not_found()
        snap = services._snapshot(article)
        image = images.url_of(article.featured_image) if article.featured_image else None
        profile = AuthorProfile.objects.filter(user_id=article.author_id).first()
        return Response(
            {
                "slug": article.slug,
                "headline": article.headline,
                "summary": article.summary,
                "category": snap["category"],
                "author": {
                    "name": profile.display_name if profile else article.author.display_name,
                    "slug": None,
                },
                "published_at": _iso(article.first_published_at),
                "updated_at": _iso(article.material_updated_at),
                "reading_minutes": snap["reading_minutes"],
                "image": (
                    {
                        "url": image,
                        "alt": article.image_alt,
                        "caption": article.image_caption,
                        "credit": article.image_credit,
                    }
                    if image
                    else None
                ),
                "body_html": article.body_html,
                "in_short": article.in_short,
                "why_it_matters": article.why_it_matters,
                "tags": snap["tags"],
                "sources": article.sources,
                "canonical_url": article.canonical_url or None,
                "seo": {
                    "title": article.search_title or None,
                    "description": article.search_description or None,
                    "social_title": article.social_title or None,
                    "social_description": article.social_description or None,
                    "social_image": images.url_of(article.social_image) if article.social_image else image,
                },
                "opportunity_categories": article.opportunity_categories,
                "word_count": snap["word_count"],
                "related": [],
                "status": article.status,
            }
        )


class StaffArticleHistoryView(StaffInsightsView):
    @extend_schema(
        operation_id="listStaffArticleHistory",
        tags=["staff"],
        responses={200: OpenApiResponse(), 403: None, 404: None},
    )
    def get(self, request: Request, article_id: uuid.UUID) -> Response:
        user = self.user_of(request)
        article = _visible(user, article_id)
        if article is None:
            return _not_found()
        events = article.events.select_related("actor").order_by("-at")[:100]
        reviews = article.reviews.select_related("decided_by").order_by("-decided_at")[:50]
        return Response(
            {
                "events": [
                    {
                        "action": e.action,
                        "from": e.from_status,
                        "to": e.to_status,
                        "by": e.actor.display_name,
                        "at": _iso(e.at),
                    }
                    for e in events
                ],
                "reviews": [
                    {
                        "decision": r.decision,
                        "note": r.note,
                        "checklist": r.checklist,
                        "by": r.decided_by.display_name,
                        "at": _iso(r.decided_at),
                    }
                    for r in reviews
                ],
            }
        )


class StaffInsightsMetaView(StaffInsightsView):
    @extend_schema(
        operation_id="getStaffInsightsMeta",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Choices for the editor"), 403: None},
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        writers: list[dict[str, Any]] = []
        if user.has_permission_code(P.INSIGHTS_PUBLISH):
            writers = [{"id": str(p.pk), "name": p.display_name} for p in services.writers()]
        return Response(
            {
                "categories": [
                    {"slug": c.slug, "name": c.name}
                    for c in ArticleCategory.objects.filter(active=True).order_by("display_order", "name")
                ],
                "opportunity_categories": [
                    {"code": c.code, "name": c.name}
                    for c in Category.objects.filter(active=True).order_by("name")
                ],
                "checklist": [{"key": k, "label": services.CHECKLIST_LABELS[k]} for k in services.CHECKLIST],
                "writers": writers,
                "permissions": {
                    "write": user.has_permission_code(P.INSIGHTS_WRITE),
                    "review": user.has_permission_code(P.INSIGHTS_REVIEW),
                    "publish": user.has_permission_code(P.INSIGHTS_PUBLISH),
                    "manage": user.has_permission_code(P.INSIGHTS_MANAGE),
                },
                "limits": {k: v[1] for k, v in services.LIMITS.items()},
            }
        )


class StaffTagListView(StaffInsightsView):
    @extend_schema(
        operation_id="listStaffArticleTags",
        tags=["staff"],
        responses={200: OpenApiResponse(description="Tag suggestions"), 403: None},
    )
    def get(self, request: Request) -> Response:
        term = " ".join(request.query_params.get("q", "").split())[:60]
        qs = ArticleTag.objects.all()
        if term:
            qs = qs.filter(name__icontains=term)
        return Response({"data": [{"name": t.name, "slug": t.slug} for t in qs.order_by("name")[:30]]})


def _category(c: ArticleCategory) -> dict[str, Any]:
    return {
        "id": str(c.pk),
        "name": c.name,
        "slug": c.slug,
        "description": c.description,
        "seo_title": c.seo_title,
        "seo_description": c.seo_description,
        "display_order": c.display_order,
        "active": c.active,
    }


class StaffCategoryListView(StaffInsightsView):
    @extend_schema(
        operation_id="listStaffArticleCategories",
        tags=["staff"],
        responses={200: OpenApiResponse(), 403: None},
    )
    def get(self, request: Request) -> Response:
        return Response(
            {"data": [_category(c) for c in ArticleCategory.objects.order_by("display_order", "name")]}
        )

    @extend_schema(
        operation_id="createStaffArticleCategory",
        tags=["staff"],
        request=None,
        responses={201: OpenApiResponse(), 400: None, 403: None},
    )
    def post(self, request: Request) -> Response:
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        try:
            category = services.save_category(self.user_of(request), data)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(_category(category), status=status.HTTP_201_CREATED)


class StaffCategoryView(StaffInsightsView):
    @extend_schema(
        operation_id="updateStaffArticleCategory",
        tags=["staff"],
        request=None,
        responses={200: OpenApiResponse(), 400: None, 403: None, 404: None},
    )
    def patch(self, request: Request, category_id: uuid.UUID) -> Response:
        category = ArticleCategory.objects.filter(pk=category_id).first()
        if category is None:
            return _not_found()
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        try:
            saved = services.save_category(self.user_of(request), data, category)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(_category(saved))


def _profile(p: AuthorProfile | None, user: User) -> dict[str, Any]:
    return {
        "user_id": str(user.pk),
        "display_name": p.display_name if p else user.display_name,
        "slug": p.slug if p else None,
        "bio": p.bio if p else "",
        "image": p.image or None if p else None,
        "image_url": images.url_of(p.image) if p and p.image else None,
        "expertise": list(p.expertise) if p else [],
        "is_public": p.is_public if p else True,
        "exists": p is not None,
    }


class StaffAuthorListView(StaffInsightsView):
    @extend_schema(
        operation_id="listStaffAuthors",
        tags=["staff"],
        responses={200: OpenApiResponse(), 403: None},
    )
    def get(self, request: Request) -> Response:
        user = self.user_of(request)
        if not user.has_permission_code(P.INSIGHTS_MANAGE):
            return Response({"data": [_profile(AuthorProfile.objects.filter(user=user).first(), user)]})
        people = services.writers()
        profiles = {p.user_id: p for p in AuthorProfile.objects.filter(user__in=people)}
        return Response({"data": [_profile(profiles.get(u.pk), u) for u in people]})


class StaffAuthorView(StaffInsightsView):
    @extend_schema(
        operation_id="saveStaffAuthor",
        tags=["staff"],
        request=None,
        responses={200: OpenApiResponse(), 400: None, 403: None, 404: None},
    )
    def put(self, request: Request, user_id: uuid.UUID) -> Response:
        actor = self.user_of(request)
        target = User.objects.filter(pk=user_id, status=AccountStatus.ACTIVE).first()
        if target is None:
            return _not_found()
        data = _body(request)
        if data is None:
            return error_response("validation_failed", "The request body must be a JSON object.", 400)
        try:
            profile = services.save_profile(actor, target, data)
        except WorkflowError as exc:
            return _refused(exc)
        return Response(_profile(profile, target))
