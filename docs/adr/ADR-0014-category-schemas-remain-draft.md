# ADR-0014: Category-specific schemas remain drafts

- **Status:** ACCEPTED (owner approval 2026-10-17). Document status DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-21

## Context
The hybrid data model (ADR-0005) needs field lists per category, which depend on domain facts about Zimbabwean opportunities that the owner has not yet confirmed (OQ-06).

## Decision
1. The six category schemas, the twelve Zimbabwean-style examples, the validation recommendations and the common-field applicability matrix are **proposals**. None is approved; Phase 2 cannot start until the owner approves, amends or replaces them (OQ-06).
2. Examples are fictional and clearly labelled; domain facts that I could not verify (currency codes, qualification names, procurement documents, organisation-type terminology) are tagged **verify**.
3. Schemas are stored under `docs/engineering/schemas-draft/` and are machine-checked (valid JSON Schema 2020-12; examples validate against both the schema and the OpenAPI request body; negative cases are rejected).
4. Approved schemas will be versioned files in `apps/api` and recorded in `detail_schema`; changes become new versions.

## Consequences
- Phase 2 remains blocked on OQ-06, OQ-21, OQ-22 and OQ-29.
- Enum vocabularies are provisional; changing them later is a schema version, not an in-place edit.

## Alternatives considered
Treat the drafts as approved to speed Phase 2 (rejected by D-21).
