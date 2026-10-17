# ADR-0001: Approved flat HTML reference is the definitive design source

- **Status:** ACCEPTED; **amended by ADR-0012 (D-19)** — accessibility takes precedence over exact fidelity where they conflict. ACCEPTED (owner approval recorded as D-08 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-08

## Context
The pack's design documents, the legacy docs and the v1.0 specification each described tokens differently (blue `#174c83` and Arial in the reference; green `#176B55` and Inter in the specification's proposed defaults; larger type sizes). The reference is the artefact the owner approved.

## Decision
1. `reference/approved-flat.html` is the definitive source for visual design. It is never edited.
2. Production keeps its blue accent, Arial typography, sizing, spacing, square corners, absence of shadows/gradients, and compact controls.
3. Tokens are **extracted** from the reference (computed styles at 1440/390/320 px) and recorded in `docs/design/DESIGN_TOKENS.md`; no value is invented. The specification's proposed tokens are withdrawn.
4. Components the reference lacks (pagination, error/loading states, account forms, detail page, expired banners, verification badges…) are derived only from recorded tokens and need design approval before build.
5. Deviation requires a dated design decision record approved by the owner.

## Consequences
- Accessibility observations in the reference (10–11 px text; muted-on-pale contrast 4.4:1; off-palette `#3658a4` for the saved state; residual hover filter) are **not** silently fixed. The conflict between pixel fidelity and the WCAG 2.2 AA target was recorded as OQ-25 and **resolved by D-19/ADR-0012** (accessibility prevails; four documented deviations; the 4.4:1 figure quoted here was wrong — see `ACCESSIBILITY_DEVIATIONS.md`).
- Tailwind theme keys must be generated from the token roles, not copied literals.
- Visual sign-off compares built screens to the reference at 1440, 768, 390 and 320 px.

## Alternatives considered
Adopt the specification's token proposal (rejected: owner decision D-08); consolidate the reference's many greys into a smaller scale (rejected until approved — would be an invented palette).
