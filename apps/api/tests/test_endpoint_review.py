"""Endpoint-by-endpoint authorisation review (Phase 5, WS3), driven by the documented contract.

For every implemented operation: anything the contract protects with a session cookie refuses an anonymous caller,
and refuses an authenticated caller who sends no CSRF token on an unsafe method. No operation answers 5xx to
hostile input. The list of public operations is explicit, so a new endpoint cannot become public by accident.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

import pytest
import yaml
from django.core.cache import caches
from drf_spectacular.generators import SchemaGenerator
from rest_framework.test import APIClient

from accounts.models import User
from tests.conftest import PASSWORD, csrf, post_json

pytestmark = pytest.mark.django_db
METHODS = ("get", "post", "put", "patch", "delete")
UNSAFE = ("post", "put", "patch", "delete")

# Operations that need no session. Adding one here is a deliberate, reviewed decision.
PUBLIC = {
    "getApiRoot", "listOpportunities", "getOpportunity", "listCategories", "listLocations", "listSectors",
    "searchSkills", "getSitemapEntries", "getCsrfToken", "login", "register", "verifyEmail", "resendVerification",
    "requestPasswordReset", "confirmPasswordReset", "receiveEmailEvents", "receiveResendEmailEvents", "getSchema", "getEmployerProfilePublic", "recordListingEvent",
}  # fmt: skip


def _ops(doc: dict[str, Any], prefix: str = "") -> dict[str, tuple[str, str, dict[str, Any]]]:
    found = {}
    for path, item in doc["paths"].items():
        for method in METHODS:
            if method in item and "operationId" in item[method]:
                found[item[method]["operationId"]] = (method, prefix + path, item[method])
    return found


@pytest.fixture
def operations(repo_root: Path) -> list[tuple[str, str, str, bool]]:
    contract = yaml.safe_load((repo_root / "docs/engineering/openapi/openapi.yaml").read_text())
    implemented = _ops(SchemaGenerator().get_schema(request=None, public=True), "")  # type: ignore[no-untyped-call]
    documented = _ops(contract, "/api/v1")
    rows = []
    for op_id in implemented:
        if op_id not in documented:
            continue
        method, path, spec = documented[op_id]
        needs_cookie = any("cookieAuth" in req for req in spec.get("security", []))
        rows.append((op_id, method, re.sub(r"\{[^}]+\}", "{}", path), needs_cookie))
    return rows


def fill(path: str) -> str:
    return path.replace("{}", str(uuid.uuid4()))


def test_every_implemented_operation_is_classified(operations: list[tuple[str, str, str, bool]]) -> None:
    assert operations, "no operations found"
    for op_id, _, _, needs_cookie in operations:
        assert needs_cookie or op_id in PUBLIC, (
            f"{op_id} is neither protected by a session nor on the reviewed public list"
        )
    protected = [o for o in operations if o[3]]
    assert len(protected) >= 10


def test_protected_operations_refuse_anonymous_callers(
    client: APIClient, operations: list[tuple[str, str, str, bool]]
) -> None:
    token = csrf(client)
    for op_id, method, path, needs_cookie in operations:
        if not needs_cookie:
            continue
        response = getattr(client, method)(fill(path), {}, format="json", HTTP_X_CSRFTOKEN=token)
        assert response.status_code in (401, 403), f"{op_id}: anonymous caller got {response.status_code}"


def test_unsafe_protected_operations_refuse_a_missing_csrf_token(
    client: APIClient, make_user: Any, operations: list[tuple[str, str, str, bool]]
) -> None:
    user: User = make_user()
    assert (
        post_json(client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}).status_code
        == 200
    )
    for op_id, method, path, needs_cookie in operations:
        if not needs_cookie or method not in UNSAFE:
            continue
        response = getattr(client, method)(fill(path), {}, format="json")  # no X-CSRFToken
        assert response.status_code == 403, f"{op_id}: answered {response.status_code} without a CSRF token"


def test_no_operation_answers_5xx_to_hostile_input(
    client: APIClient, make_user: Any, operations: list[tuple[str, str, str, bool]]
) -> None:
    user: User = make_user()
    token = csrf(client)
    assert (
        post_json(
            client, "/api/v1/auth/login", {"email": user.email, "password": PASSWORD}, token
        ).status_code
        == 200
    )
    token = csrf(client)
    hostile = [
        {}, {"x": "A" * 10_000}, {"email": "a" * 400 + "@example.org", "password": "\x00\x00"}, {"token": "../../etc/passwd"},
        [], "not an object", {"new_email": "<script>alert(1)</script>@example.org", "password": "x"},
    ]  # fmt: skip
    for op_id, method, path, _ in operations:
        if op_id in {"logout", "requestAccountDeletion", "changePassword", "revokeSession"}:
            continue  # these would end the session this test is using
        for body in hostile:
            if method == "get" and not isinstance(body, dict):
                continue  # a query string is a set of pairs
            caches["local"].clear()
            kwargs: dict[str, Any] = {} if method == "get" else {"format": "json"}
            response = getattr(client, method)(fill(path), body, HTTP_X_CSRFTOKEN=token, **kwargs)
            assert response.status_code < 500, f"{op_id}: {response.status_code} for {str(body)[:40]!r}"


def test_responses_carry_no_server_version_or_stack_trace(client: APIClient) -> None:
    for path in ("/api/v1/opportunities", "/api/v1/nope", "/api/v1/me"):
        response = client.get(path)
        assert (
            "python" not in str(response.headers).lower()
            and "django" not in response.content.decode().lower()
        )
        assert "Traceback" not in response.content.decode()
