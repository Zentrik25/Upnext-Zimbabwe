# ADR-0018: Phase 2 — opportunity catalog and editorial CMS

- **Status:** ACCEPTED as an implementation approach (Phase 2 authorised by the owner, 2026-10-17). The provisional defaults it relies on (P2-01…P2-10 in the decision register) are **not** owner decisions.
- **Decision register:** D-12, D-13, D-14, D-18, D-22, D-23; P2-01…P2-10

## Context
Phase 2 adds the organisations, taxonomies, opportunities, revisions, sources, verification, the editorial workflow with separation of duties, a staff interface, and the public read-only API and pages. Specifications: `ERD.md`, `EDITORIAL_WORKFLOW.md`, `VALIDATION_SPEC.md`, `ROLE_PERMISSION_MATRIX.md`, `openapi.yaml`.

## Decision
1. **Apps:** `audit` (append-only events), `catalog` (taxonomies, organisations, detail schemas, validators, Markdown), `opportunities` (models, workflow service, admin, public queries). Business logic lives in `opportunities/workflow.py` and `catalog/`; views, admin and serializers call it and never write state columns.
2. **One state machine, enforced twice:** the service takes `SELECT … FOR UPDATE` on the listing, re-reads the facts it needs under the lock, asks the pure functions in `access/policy.py`, applies the change and writes `publishing_event` + `audit_event` in the same transaction. PostgreSQL triggers re-assert the invariants (immutable content after submit, no self-review, approved revision only, immutable slug and ids, append-only audit), so a bug or a direct SQL write cannot publish unapproved content.
3. **Revisions are immutable snapshots** with a SHA-256 content hash computed over a canonical serialisation of every material field (core fields, relational facts, sources, category detail). Approval records the hash; publication compares it.
4. **Staff interface:** Django Admin with per-role querysets, read-only state fields and actions that call the service. Role assignment stays a command-line/Administrator operation (no editorial API is exposed, P2-06).
5. **Public API:** read-only, anonymous, throttled; only `published` listings (and the P2-01 exceptions for detail) can be returned, selected through one query helper used by every public endpoint; list pagination uses signed keyset cursors tied to sort and filters; search uses `websearch_to_tsquery` over a stored `tsvector`.
6. **Validation:** two layers. The service validates drafts (types/lengths) and submissions (publish-grade); category `detail` is validated by `jsonschema` (Draft 2020-12, `jsonschema` becomes a hash-locked runtime dependency) against schema files shipped in `apps/api/catalog/schemas/`.
7. **Frontend:** `/opportunities` and `/opportunities/[slug]` are server-rendered pages that call the API server-side, built only from the approved primitives and tokens.

## Consequences
- The OpenAPI contract gains no new paths; changes (e.g. `status` values, a `deadline` shape detail) are recorded in `API_CONTRACTS.md` and justified there.
- Editorial API, employer self-service, scheduling (T08), recommendations and notifications remain out of scope.

## Alternatives considered
A DRF editorial API first (rejected: OQ-16 default is Django Admin); a third-party Markdown sanitiser (rejected: avoidable dependency and a larger attack surface than an escape-first renderer of a fixed subset); storing the content hash only in application code (rejected: the database must also refuse unapproved publication).
