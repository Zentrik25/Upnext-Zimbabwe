# ADR-0010: Preserve CLAUDE.md traceability and unresolved-question rules

- **Status:** ACCEPTED (owner approval recorded as D-17 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-17

## Context
The specification's proposed `CLAUDE.md` omitted rules in the existing file: the traceability table, "never fill open questions with invented facts", DRAFT-until-approved, and Phase 0 behaviour.

## Decision
The repository's `CLAUDE.md` keeps all eight original rules, updates paths to the approved layout, and adds rules for separation of duties (D-09) and archived documents. In particular it retains: (1) read the register and reference before proposing work; (2) confirmed decisions bind, open questions are logged and asked, never invented; (3) maintain the requirement→screen→API→test traceability table (`docs/governance/TRACEABILITY.md`); (6) documents are DRAFT until the owner approves; (7) Phase 0 produces analysis only; (8) per-phase gates and no deployment without permission. The implementation-process rules from the specification (read specs, state files to change, tests, stop at gates) are compatible and are adopted at Phase 1 through this file.

## Consequences
- Any future edit to `CLAUDE.md` that removes or weakens a rule needs an ADR.

## Alternatives considered
Replace with the specification's shorter version (rejected: drops safeguards).
