from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountStatus, StaffRoleAssignment, User
from tests.factories import World

PASSWORD = "correct horse battery staple 42"


@pytest.fixture
def repo_root() -> Path:
    """Repository root (mounted at /repo in Compose, the checkout in CI). Doc-consistency tests need it."""
    configured = os.environ.get("UPNEXT_REPO_ROOT")
    root = Path(configured) if configured else Path(__file__).resolve().parents[3]
    if not (root / "docs").is_dir():
        if os.environ.get("REQUIRE_DOCS") == "1":
            pytest.fail(f"docs/ not found under {root}")
        pytest.skip("repository docs/ not available")
    return root


@pytest.fixture
def client(db: None) -> APIClient:
    cache.clear()  # throttle counters live in the database cache
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def make_user(db: None) -> Callable[..., User]:
    counter = {"n": 0}

    def _make(
        *,
        email: str | None = None,
        status: str = AccountStatus.ACTIVE,
        roles: tuple[str, ...] = (),
        password: str = PASSWORD,
        display_name: str = "Test User",
    ) -> User:
        counter["n"] += 1
        user = User.objects.create_user(
            email or f"user{counter['n']}@example.org",
            password,
            display_name,
            status=status,
            email_verified_at=timezone.now() if status != AccountStatus.PENDING_VERIFICATION else None,
        )
        for role in roles:
            StaffRoleAssignment.objects.create(user=user, role=role, reason="test fixture")
        return user

    return _make


def csrf(client: APIClient) -> str:
    response = client.get("/api/v1/auth/csrf")
    assert response.status_code == 200
    return str(response.json()["csrf_token"])


def post_json(client: APIClient, url: str, data: dict[str, object] | None = None, token: str | None = None):  # type: ignore[no-untyped-def]
    token = token or csrf(client)
    return client.post(url, data or {}, format="json", HTTP_X_CSRFTOKEN=token)


@pytest.fixture
def people(make_user: Callable[..., User]) -> dict[str, User]:
    """Named staff accounts covering every role combination the rules care about."""
    return {
        "author": make_user(email="author@example.org", roles=("contributor",)),
        "author_editor": make_user(email="author-editor@example.org", roles=("contributor", "editor")),
        "author_admin": make_user(email="author-admin@example.org", roles=("contributor", "administrator")),
        "editor": make_user(email="editor@example.org", roles=("editor",)),
        "editor2": make_user(email="editor2@example.org", roles=("editor",)),
        "admin": make_user(email="admin@example.org", roles=("administrator",)),
        "seeker": make_user(email="seeker@example.org"),
    }


@pytest.fixture
def world(people: dict[str, User]) -> World:
    from tests.factories import build_world

    return build_world(people["admin"])
