# ADR-0012: Accessibility takes precedence over exact visual fidelity

- **Status:** ACCEPTED (owner approval 2026-10-17). Amends ADR-0001. Document status DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-19

## Context
ADR-0001 preserved the reference exactly and left a conflict with the WCAG 2.2 AA target open (OQ-25). Measurement of the rendered reference (47 text/background pairs, 7 states, 2 viewports, plus axe-core) found 5 failing text pairs and 1 class of failing control borders.

## Decision
1. Where the approved reference conflicts with WCAG 2.2 AA, accessibility prevails over exact fidelity.
2. The flat design, Arial, blue accent, square corners, compact layout, text sizes and spacing are preserved.
3. Only the minimum necessary corrections are made: the smallest same-hue change that reaches the required ratio on every background the colour is used on.
4. Every deviation is recorded in `docs/design/ACCESSIBILITY_DEVIATIONS.md` with the SC, before/after measurements and impact; anything not listed is not permitted (test A11Y-08).
5. Current deviations: DEV-01…DEV-03 (three text colours, imperceptible) and DEV-04 (one control-border token, visible). Items that conform (heart glyph as graphical object, focus ring, target sizes via the spacing exemption, text sizes) are not changed.
6. New components derived from tokens must pass the same checks before approval.

## Consequences
- Tokens exist in two values (reference baseline vs production); visual regression runs against the reference with an allow-list of the four deviations.
- Automated testing finds only part of the issues: manual keyboard and screen-reader testing is mandatory in the build phases.
- The owner should confirm DEV-04's visibility and the heart-glyph classification when approving the package.

## Alternatives considered
Change only the colours that fail but leave control borders (rejected: fails SC 1.4.11); enlarge text and targets (rejected: not required by AA, larger visual change); keep exact fidelity (rejected by D-19).
