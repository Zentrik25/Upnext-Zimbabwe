# Test strategy — DRAFT
Planned tests are catalogued with ids in `docs/governance/TRACEABILITY.md §4`; nothing has been written or run. Results are recorded in phase reports with commands and outputs and are never invented.

## Layers
Unit (domain rules, deadlines/timezones, scoring and reason parity, permissions, slug rules) → database/constraint and migration tests (immutability triggers, partial unique indexes, audit privileges) → integration (auth, workflow transitions, outbox worker, expiry job) → API contract (the generated schema must equal `openapi/openapi.yaml`; error shape; pagination; backwards compatibility) → Playwright end to end at 320/390/768/1440 → accessibility (axe, keyboard, screen reader, reflow) → visual comparison with the reference → security (authorisation matrix, separation of duties, CSRF, headers/CSP, URL and Markdown corpora, dependency/secret/image scans) → performance (benchmarks on realistic data, Core Web Vitals, load against agreed capacity) → operations (health, backup restore, migration rehearsal, rollback).

## Generated tests
Role × capability × condition cases are generated from `ROLE_PERMISSION_MATRIX.md`; transition legality cases from `EDITORIAL_WORKFLOW.md`; boundary cases from `VALIDATION_SPEC.md`; operation coverage from `openapi.yaml`.

## Release gate
Green CI, no critical/high known security defects, authorisation and separation-of-duties suites green, migration rehearsal, backup restoration test, rollback plan, documented monitoring, accessibility and performance evidence, and explicit approval (QUALITY-GATES in `docs/archive/legacy-docs/` remains a useful checklist).
