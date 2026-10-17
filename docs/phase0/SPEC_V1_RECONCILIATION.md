# Spec v1.0 (17 Oct 2026) — reconciliation with the design pack and Phase 0 proposal

**Status: DRAFT.** Updated 2026-10-17 after the owner approved decisions D-08…D-17 (`docs/governance/DECISION_REGISTER.md`). Each finding below shows its resolution. Nothing marked OPEN has been defaulted.

## A. Resolution of each finding

| # | Finding | Resolution | Where |
|---|---|---|---|
| S1 | Spec design tokens (green accent, Inter, larger sizes, 40px inputs) conflict with the reference | **RESOLVED** — the reference is the definitive source; tokens extracted exactly, spec tokens withdrawn. Accessibility conflicts inside the reference remain OPEN | D-08, ADR-0001, `DESIGN_TOKENS.md`; OQ-25 |
| S2 | Redis + Celery in the base stack (and for transactional email) | **RESOLVED** — deferred; reliable email via a DB outbox behind an `EmailSender` interface; DB sessions and DB cache for throttling | D-11, ADR-0004, `SECURITY_ARCHITECTURE.md §4`; OQ-30 |
| S3 | S3-compatible object storage | **RESOLVED** — deferred | D-15, ADR-0008 |
| S4 | Repo layout conflict | **RESOLVED** — `apps/web`, `apps/api`, `docs/`, `reference/`, `infrastructure/`, optional `packages/` | D-10, ADR-0003 |
| S5 | Three decision registers | **RESOLVED** — `docs/governance/DECISION_REGISTER.md` is authoritative; legacy `DECISIONS.md` archived at `docs/archive/legacy-docs/DECISIONS.md` | D-16, ADR-0009 |
| S6 | Module names (three variants) | **OPEN (proposal P-01)** — the specification's names are the working names in the ERD (`accounts, profiles, organisations, opportunities, taxonomies, discovery, bookmarks, publishing, verification, notifications, audit`); not yet approved | `adr/README.md` P-01 |
| S7 | Publish gate: provenance vs "source checked" | **RESOLVED** — provenance (≥1 source, one primary) is required; verification is a separate label and never implied by publication. Whether `source_checked` should be mandatory before approval stays OPEN | D-14, ADR-0007; OQ-07 |
| S8 | "Administrators only" publishing / roles | **RESOLVED** — Contributor / Editor / Publisher / Administrator with identity-based separation of duties; administrators cannot bypass | D-09, ADR-0002, `ROLE_PERMISSION_MATRIX.md`; OQ-12, OQ-13 remain |
| S9 | JSONB `OpportunityDetail` vs typed tables | **RESOLVED** — hybrid: relational searchable fields + versioned, validated JSONB. Category field lists remain OPEN | D-12, ADR-0005; OQ-06 |
| S10 | API keyed by `{id}` vs slug; missing account endpoints | **RESOLVED** — public detail by slug; immutable uuid ids; missing endpoints added to the contract | D-13, ADR-0006, `openapi.yaml` |
| S11 | For You for incomplete profiles / score exposure | **OPEN** — contract returns reasons, unknowns and an optional score; UI behaviour and departure from the reference lock panel await decision | OQ-23 |
| S12 | Skills weight needs a skills taxonomy | **OPEN** — taxonomy ownership and user suggestions undecided | OQ-21 |
| S13 | Separate hard-eligibility evaluation | **RESOLVED** — deferred; no eligibility decisions | D-15 |
| S14 | Public organisation pages, `/organisations`, related opportunities | **RESOLVED** — deferred (no organisation endpoints for the public, no "Organisations" nav). The `organisation_id` filter and how users find it is OPEN | D-15; OQ-24 |
| S15 | Admin navigation items (Users, Taxonomies, Settings) | **RESOLVED** as scope of SC-13; Django Admin first is proposed, final staff-UI choice OPEN | `TRACEABILITY.md`; OQ-16 |
| S16 | Additional profile fields | **RESOLVED** in ERD/VALIDATION (country, experience level, work arrangements, fields of study); sector vs field-of-study merge OPEN | `ERD.md §3.2`; OQ-21 |
| S17 | Mandatory email verification vs provider decision | **PARTLY RESOLVED** — handling designed; provider, sender domain and the "verified before session" rule are OPEN | OQ-03, OQ-04 |
| S18 | Monitoring / error-tracking hosting | **OPEN** | OQ-26 |
| S19 | Spec's CLAUDE.md vs existing | **RESOLVED** — existing rules preserved, paths updated, rules 9–10 added | D-17, ADR-0010, `/CLAUDE.md` |
| S20 | Expired/withdrawn/archived URLs | **OPEN** — contract carries `include_expired` and states; policy undecided | OQ-20 |
| S21 | Relevance sort with cursor pagination | **PROPOSED** (P-03): cursor signed over `(rank, id)` for relevance, `(sort key, id)` otherwise | `VALIDATION_SPEC §9` |
| S22 | No advertising obscuring the apply action | **RESOLVED as a non-goal** — no advertising in Release 1 | `PRODUCT_VISION` non-goals |
| S23 | CI/CD vs "no deploy without permission" | **RESOLVED** — CI only through Phase 6; deployment is a manual approved step | `CLAUDE.md` rule 8 |

## B. Changes made to earlier Phase 0 proposals
- ADR-002/004/005/010 of the first proposal are superseded by ADR-0003/0005/0007/0004 respectively.
- The proposed 12 px text floor and darker muted colour are **withdrawn** (they contradicted D-08); the underlying accessibility conflict is recorded as OQ-25 for the owner to decide.
- The first proposal's typed child tables per category are replaced by the hybrid model.
- The lifecycle gains `rejected` and `withdrawn`; `approved` and `published` remain separate; verification levels are `not_verified / source_checked / issuer_verified`.
- `Contributor` replaces the single "editor drafts" role; `Publisher` is a distinct role.

## C. Still open that affects the next phase
See `PHASE0_REVIEW_PACKAGE.md §4` for blockers by phase and `DECISION_REGISTER.md` for the full list.
