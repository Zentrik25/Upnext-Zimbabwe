# ADR-0008: Capabilities deferred until justified

- **Status:** ACCEPTED (owner approval recorded as D-15 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-15

## Context
Several attractive features would expand scope, risk and cost before the core is proven.

## Decision
Deferred (not designed beyond keeping the architecture open):
- **Automatic eligibility decisions** — recommendations remain relevance estimates; no "You qualify" statements.
- **Public organisation pages** — organisations are a reference entity only (no slug/logo/profile endpoints). The organisation filter and navigation item are therefore revisited under OQ-24.
- **Advanced related-opportunity recommendations** — a detail page may show nothing or a simple rule-based list only if separately approved.
- **Object storage** — no uploads, logos or evidence files in Release 1; S3-compatible storage is not provisioned.
Each item re-enters scope only through a decision-register entry that states the justification (user need, risk, cost, privacy impact).

## Consequences
- Smaller attack surface (no upload endpoints), lower operating cost, simpler privacy analysis.
- Organisation logos in the reference appear only as initials tiles.
- Verification evidence is textual in Release 1.

## Alternatives considered
Build now for completeness (rejected: premature).
