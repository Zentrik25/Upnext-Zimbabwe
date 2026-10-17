# ADR-0007: Source provenance and verification status are separate

- **Status:** ACCEPTED (owner approval recorded as D-14 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-14

## Context
The word "verified" was used for three different things. The specification defines three verification levels; the reference states that a source check is not employer verification.

## Decision
1. **Provenance** (`opportunity_source`) records where information came from and when it was observed. At least one source with one primary is required to submit/publish.
2. **Verification** (`verification_record`) records an activity by a person (≠ author) with method, outcome and evidence note. Levels: `not_verified` (default), `source_checked`, `issuer_verified`. The listing shows the level of its **live** version.
3. Publishing never sets or implies verification; the UI must not use the word "verified" for `source_checked`. Verification changes are audited.
4. A new version does not inherit verification unless re-recorded for that version (OQ-07 may refine).
5. Criteria and evidence for each level, and whether `source_checked` is required before approval, are OPEN (OQ-07).

## Consequences
- Unverified listings are publishable if provenance exists; the interface must label them clearly.
- Two sets of data to validate and display; duplicates logic uses provenance (normalised source URL).
- No file/evidence upload in Release 1 (D-15): evidence is a written note.

## Alternatives considered
Single `verified` boolean (rejected); verification implied by publication (rejected by the specification and the reference).
