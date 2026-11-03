"""Helpers shared by the Phase 6B tests (profiles, For You, alerts)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Category, Location, Sector, Skill
from opportunities.models import Opportunity
from tests.conftest import PASSWORD, csrf, post_json
from tests.factories import World, published, varied


def signed_in(make_user: Callable[..., User], **kwargs: Any) -> tuple[APIClient, User]:
    user = make_user(**kwargs)
    client = APIClient(enforce_csrf_checks=True)
    assert (
        post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}).status_code
        == 200
    )
    return client, user


def patch(client: APIClient, url: str, body: dict[str, Any]) -> Any:
    return client.patch(url, body, format="json", HTTP_X_CSRFTOKEN=csrf(client))


def put(client: APIClient, url: str, body: dict[str, Any]) -> Any:
    return client.put(url, body, format="json", HTTP_X_CSRFTOKEN=csrf(client))


def post(client: APIClient, url: str, body: dict[str, Any] | None = None) -> Any:
    return client.post(url, body or {}, format="json", HTTP_X_CSRFTOKEN=csrf(client))


def delete(client: APIClient, url: str) -> Any:
    return client.delete(url, HTTP_X_CSRFTOKEN=csrf(client))


def live(world: World, people: dict[str, User], example: str, tag: str, **overrides: Any) -> Opportunity:
    return published(
        world,
        people["author"],
        people["editor"],
        example=example,
        **varied(world, example, tag, **overrides),
    )


def location_id(slug: str) -> str:
    return str(Location.objects.get(slug=slug).pk)


def sector_id(slug: str) -> str:
    return str(Sector.objects.get(slug=slug).pk)


def skill_id(name: str) -> str:
    return str(Skill.objects.get(name=name).pk)


def category_code(code: str) -> str:
    return Category.objects.get(code=code).code
