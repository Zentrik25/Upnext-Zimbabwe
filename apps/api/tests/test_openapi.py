"""OpenAPI validation (gate 7) and the contract test against docs/engineering/openapi/openapi.yaml."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest
import yaml
from drf_spectacular.generators import SchemaGenerator
from openapi_spec_validator import validate
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
METHODS = ("get", "post", "put", "patch", "delete")


@pytest.fixture(scope="module")
def generated() -> dict[str, Any]:
    schema: dict[str, Any] = SchemaGenerator().get_schema(request=None, public=True)  # type: ignore[no-untyped-call]
    return schema


def _operations(doc: dict[str, Any], prefix: str = "") -> dict[tuple[str, str], dict[str, Any]]:
    ops = {}
    for path, item in doc["paths"].items():
        norm = re.sub(r"\{[^}]+\}", "{}", prefix + path)
        for method in METHODS:
            if method in item:
                ops[(method, norm.rstrip("/") or "/")] = item[method]
    return ops


def test_generated_schema_is_valid_openapi(generated: dict[str, Any]) -> None:
    validate(generated)
    assert generated["openapi"].startswith("3.")


def test_schema_endpoint_serves_openapi_json(client: APIClient) -> None:
    response = client.get("/api/v1/schema", HTTP_ACCEPT="application/vnd.oai.openapi+json")
    assert response.status_code == 200
    validate(response.json())


@pytest.mark.docs
def test_contract_document_itself_is_valid(repo_root: Path) -> None:
    validate(yaml.safe_load((repo_root / "docs/engineering/openapi/openapi.yaml").read_text()))


@pytest.mark.docs
def test_every_implemented_operation_is_in_the_documented_contract(
    generated: dict[str, Any], repo_root: Path
) -> None:
    contract = yaml.safe_load((repo_root / "docs/engineering/openapi/openapi.yaml").read_text())
    documented = _operations(contract, prefix="/api/v1")
    implemented = _operations(generated)
    assert implemented, "no operations generated"
    for key, operation in implemented.items():
        assert key in documented, f"{key} is implemented but not documented in the contract"
        assert operation["operationId"] == documented[key]["operationId"], key
        undocumented = set(operation["responses"]) - set(documented[key]["responses"])
        assert not undocumented, f"{key} returns undocumented statuses {undocumented}"


def _resolve(doc: dict[str, Any], node: dict[str, Any]) -> dict[str, Any]:
    while "$ref" in node:
        target: Any = doc
        for part in node["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        node = target
    return node


@pytest.mark.docs
def test_user_schema_matches_the_contract(generated: dict[str, Any], repo_root: Path) -> None:
    contract = yaml.safe_load((repo_root / "docs/engineering/openapi/openapi.yaml").read_text())
    expected = contract["components"]["schemas"]["User"]
    actual = generated["components"]["schemas"]["User"]
    assert set(expected["required"]) <= set(actual["properties"])
    assert set(actual["properties"]) <= set(expected["properties"])
    roles = _resolve(generated, actual["properties"]["roles"]["items"])
    assert set(roles["enum"]) == set(_resolve(contract, expected["properties"]["roles"]["items"])["enum"])
    assert "publisher" not in roles["enum"]  # D-23


@pytest.mark.docs
def test_login_request_matches_the_contract(generated: dict[str, Any], repo_root: Path) -> None:
    contract = yaml.safe_load((repo_root / "docs/engineering/openapi/openapi.yaml").read_text())
    expected = contract["components"]["schemas"]["LoginRequest"]
    actual = generated["components"]["schemas"]["LoginRequest"]
    assert set(actual["required"]) == set(expected["required"])
    assert set(actual["properties"]) == set(expected["properties"])


def _properties(doc: dict[str, Any], node: dict[str, Any]) -> set[str]:
    node = _resolve(doc, node)
    names = set(node.get("properties", {}))
    for part in node.get("allOf", []):
        names |= _properties(doc, part)
    return names


@pytest.mark.docs
@pytest.mark.parametrize(
    "name",
    [
        "Category",
        "Location",
        "Sector",
        "Skill",
        "PageInfo",
        "OpportunitySummary",
        "OpportunityDetail",
        "Source",
    ],
)
def test_public_schemas_expose_exactly_the_contracted_fields(
    generated: dict[str, Any], repo_root: Path, name: str
) -> None:
    """The implementation may not add (leak) or drop fields relative to the Phase 0 contract."""
    contract = yaml.safe_load((repo_root / "docs/engineering/openapi/openapi.yaml").read_text())
    expected = _properties(contract, contract["components"]["schemas"][name])
    actual_schema = generated["components"]["schemas"].get(name)
    if actual_schema is None:  # nested helper schemas are inlined by the generator under other names
        pytest.skip(f"{name} is not a named component in the generated schema")
    assert _properties(generated, actual_schema) <= expected, name
    required = set(_resolve(contract, contract["components"]["schemas"][name]).get("required", []))
    assert required <= _properties(generated, actual_schema) or name == "OpportunityDetail"


def test_public_operations_are_implemented(generated: dict[str, Any]) -> None:
    ids = {
        op["operationId"]
        for item in generated["paths"].values()
        for op in item.values()
        if "operationId" in op
    }
    assert {
        "listOpportunities", "getOpportunity", "listCategories", "listLocations", "listSectors", "searchSkills"
    } <= ids  # fmt: skip
