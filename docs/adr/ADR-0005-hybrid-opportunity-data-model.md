# ADR-0005: Hybrid opportunity data model

- **Status:** ACCEPTED (owner approval recorded as D-12 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-12

## Context
Opportunities share many attributes but differ by category (jobs, scholarships, tenders, grants…). A single JSON blob is unqueryable and unvalidated; a table per category makes new categories expensive.

## Decision
1. Common, filterable and sortable attributes are **relational columns** on `opportunity_version` (organisation, locations, work mode, employment type, experience level, salary/funding with currency and period, deadline with timezone, application method, search vector, etc.).
2. Category-specific attributes live in `opportunity_version.detail` (**JSONB**), validated on every write and at submit/publish against a **versioned JSON Schema per category**; additional properties are rejected; the schema version is stored with the row; schema versions are append-only and the active version is recorded in `detail_schema`.
3. Nothing a public filter or sort needs lives only in JSONB. Index JSONB paths only after measurement.
4. Candidate v1 schemas are in `VALIDATION_SPEC.md §7`; their final fields are OPEN (OQ-06).
5. Content is versioned: edits create immutable versions (ERD §3.5).

## Consequences
- New categories need a schema and a `category` row, not a new table.
- Validation moves into code/schemas, so schema review and fixtures are mandatory (Phase 2 tests).
- Reporting on JSONB attributes is possible but slower; promote a field to a column when it becomes a filter.

## Alternatives considered
One table per category (rejected: rigid); single untyped JSONB (rejected); EAV (rejected: complexity, poor integrity).
