# ADR-0009: DECISION_REGISTER.md is the authoritative register

- **Status:** ACCEPTED (owner approval recorded as D-16 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-16

## Context
Three decision files existed (`governance/DECISION_REGISTER.md`, `docs/archive/legacy-docs/DECISIONS.md`, the specification's `DECISIONS.md` and `OPEN_QUESTIONS.md`).

## Decision
`docs/governance/DECISION_REGISTER.md` is the single source of truth for CONFIRMED and OPEN decisions. Open questions have stable ids (OQ-nn) with the phase they block; confirmed decisions have ids (D-nn). `OPEN_QUESTIONS.md`, if ever created, is a generated view of the register's OPEN table. The legacy `docs/archive/legacy-docs/DECISIONS.md` is archived. A change to a CONFIRMED decision needs a dated ADR and owner approval.

## Consequences
- Every document that mentions an unresolved point must cite its OQ id; traceability links requirements to OQ ids.
- Documents never state an open item as settled.

## Alternatives considered
Keep multiple registers (rejected: drift).
