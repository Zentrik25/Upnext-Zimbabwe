#!/usr/bin/env python3
"""Documentation-consistency checks (quality gate 10). Exits non-zero on any inconsistency.

Run from the repository root with the API development dependencies installed:
    python tools/check_docs.py
Checks: OpenAPI validity and operation ids; traceability covers every operation and every test id used
by the acceptance criteria; D-/OQ- ids and file paths resolve; the approved accessibility values agree
across tokens, docs and ADR; the reference file is byte-identical to the recorded hash; the role set has
no Publisher; the draft category schemas, examples and negative cases behave as documented.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def read(rel: str) -> str:
    return (ROOT / rel).read_text()


def markdown_files() -> list[Path]:
    skip = ("docs/archive", "reference", "node_modules", ".next", ".git/")
    found = []
    for path in list(ROOT.glob("**/*.md")) + list(ROOT.glob("**/*.yaml")):
        rel = path.relative_to(ROOT).as_posix()
        if not any(rel.startswith(s) or f"/{s}" in f"/{rel}" for s in skip):
            found.append(path)
    return found


# --- OpenAPI ---------------------------------------------------------------------
api = yaml.safe_load(read("docs/engineering/openapi/openapi.yaml"))
validate(api)
ops = {
    o["operationId"]: (m.upper(), p)
    for p, item in api["paths"].items()
    for m, o in item.items()
    if m in ("get", "post", "put", "patch", "delete")
}
check(len(ops) == sum(1 for p in api["paths"].values() for m in p if m in ("get", "post", "put", "patch", "delete")), "duplicate operationId")
roles = set(api["components"]["schemas"]["StaffRole"]["enum"])
check(roles == {"contributor", "editor", "administrator"}, f"StaffRole enum is {roles} (D-23: no publisher)")

# --- Traceability ----------------------------------------------------------------
trace = read("docs/governance/TRACEABILITY.md")
trace_ops = set(re.findall(r"^\| `([a-zA-Z]+)` \|", trace, re.M))
check(trace_ops == set(ops), f"traceability operations differ from OpenAPI: {sorted(trace_ops ^ set(ops))}")
coverage = trace.split("## 3. API operation coverage")[1].split("## 4.")[0]
check(not [ln for ln in coverage.splitlines() if ln.startswith("| `") and ln.rstrip().endswith("|  |")], "an operation has no requirement")
catalogue = set(re.findall(r"^\| ([A-Z0-9]+-\d+) \|", trace.split("## 4. Test catalogue")[1].split("## 5.")[0], re.M))


def expand(token: str) -> list[str]:
    m = re.match(r"([A-Z0-9]+)-(\d+)…[A-Z0-9]+-(\d+)", token)
    return [f"{m.group(1)}-{i:02d}" for i in range(int(m.group(2)), int(m.group(3)) + 1)] if m else [token]


used: set[str] = set()
for row in read("docs/governance/ACCEPTANCE_CRITERIA.md").splitlines():
    if row.startswith("| AC-"):
        for tok in re.split(r",\s*", [c.strip() for c in row.split("|")][-2]):
            used.update(expand(tok))
check(not used - catalogue, f"acceptance criteria use unknown test ids: {sorted(used - catalogue)}")
impl = set(re.findall(r"^\| ([A-Z0-9]+-\d+) \| `", trace.split("## 6.")[1], re.M)) if "## 6." in trace else set()
check(impl <= catalogue, f"implemented tests not in catalogue: {sorted(impl - catalogue)}")

# --- ids and paths ---------------------------------------------------------------
register = read("docs/governance/DECISION_REGISTER.md")
known = set(re.findall(r"\| (OQ-\d+|D-\d+) \|", register))
for path in markdown_files():
    text = path.read_text()
    rel = path.relative_to(ROOT).as_posix()
    for ident in set(re.findall(r"\bOQ-\d+\b|\bD-\d+\b", text)):
        check(ident in known, f"{rel}: unknown decision id {ident}")
    for ref in re.findall(r"`((?:docs|reference|tools|apps|infrastructure)/[A-Za-z0-9_./\-]+?)`", text):
        ref = ref.rstrip(".,")
        if "::" in ref or "*" in ref:
            continue
        check((ROOT / ref).exists(), f"{rel}: missing path {ref}")
for ident in set(re.findall(r"x-open: (OQ-\d+)", read("docs/engineering/openapi/openapi.yaml"))):
    check(ident in known, f"openapi x-open {ident} unknown")

# --- accessibility values agree --------------------------------------------------
tokens = json.loads(read("apps/web/src/design/tokens.json"))
deviations = {n: t for n, t in tokens["colors"].items() if "prod" in t}
check({t["dev"] for t in deviations.values()} == {"DEV-02", "DEV-03", "DEV-04", "DEV-05", "DEV-06"}, "token deviations differ from DEV-02…DEV-06 (DEV-01 retired by D-42; DEV-05, DEV-06 added by D-45)")
deviation_doc = read("docs/design/ACCESSIBILITY_DEVIATIONS.md")
for name, tok in deviations.items():
    row = next((ln for ln in deviation_doc.splitlines() if ln.startswith(f"| {tok['dev']} ")), "")
    check(tok["prod"] in row and tok["ref"] in row, f"{tok['dev']} ({name}) values differ between tokens.json and ACCESSIBILITY_DEVIATIONS.md")

# --- the reference is untouched ---------------------------------------------------
recorded = re.search(r"SHA-256 `([0-9a-f]{64})`", read("docs/design/DESIGN_TOKENS.md"))
actual = hashlib.sha256((ROOT / "reference/approved-flat.html").read_bytes()).hexdigest()
check(bool(recorded) and recorded.group(1) == actual, "reference/approved-flat.html differs from the recorded SHA-256")

# --- draft category schemas ------------------------------------------------------
schemas_dir = ROOT / "docs/engineering/schemas-draft"
fc = FormatChecker()
schemas = {}
for path in sorted(schemas_dir.glob("*.v1.draft.schema.json")):
    schema = json.loads(path.read_text())
    Draft202012Validator.check_schema(schema)  # CAT-01
    schemas[path.name.split(".")[0]] = schema
check(set(schemas) == {"jobs", "internships", "graduate-programmes", "scholarships", "tenders", "grants"}, "category schema set")
registry = Registry().with_resource(
    "urn:openapi", Resource.from_contents({"$schema": "https://json-schema.org/draft/2020-12/schema", "components": api["components"]}, DRAFT202012)
)


def fix_refs(node):  # type: ignore[no-untyped-def]
    if isinstance(node, dict):
        return {k: (v.replace("#/components", "urn:openapi#/components") if k == "$ref" else fix_refs(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [fix_refs(i) for i in node]
    return node


body = fix_refs(api["paths"]["/editorial/opportunities"]["post"]["requestBody"]["content"]["application/json"]["schema"])
create = Draft202012Validator(body, registry=registry, format_checker=fc)
examples = sorted((schemas_dir / "examples").glob("*.json"))
check(len(examples) == 12, f"expected 12 examples, found {len(examples)}")
for path in examples:
    example = json.loads(path.read_text())
    detail_errors = list(Draft202012Validator(schemas[example["category"]], format_checker=fc).iter_errors(example["detail"]))
    check(not detail_errors, f"{path.name}: detail invalid: {[e.message for e in detail_errors][:2]}")  # CAT-02
    body_errors = list(create.iter_errors(example))
    check(not body_errors, f"{path.name}: createDraft body invalid: {[e.message for e in body_errors][:2]}")  # CAT-03
for case in json.loads((schemas_dir / "negative-cases.json").read_text()):  # CAT-04
    rejected = list(Draft202012Validator(schemas[case["category"]], format_checker=fc).iter_errors(case["detail"]))
    check(bool(rejected), f"negative case was accepted: {case['reason']}")

if errors:
    print(f"{len(errors)} documentation inconsistencies:")
    for message in errors:
        print(" -", message)
    sys.exit(1)
print(
    f"docs consistent: {len(ops)} operations, {len(catalogue)} planned tests ({len(impl)} implemented), "
    f"{len(known)} decision ids, {len(schemas)} category schemas, {len(examples)} examples"
)
