# CLAUDE.md — UPNEXT project rules
**Current stage: PHASE 1 (application foundation) authorised (D-26). Not authorised: the opportunity CMS, matching engine, employer portal, payments, notifications, any deployment to the VPS, any change to The Granite Post or the existing Traefik/Nginx. Phase 2 and later start only on written approval.**

1. Read `00-READ-ME-FIRST.md`, `docs/governance/DECISION_REGISTER.md`, the applicable documents under `docs/product/`, `docs/design/`, `docs/engineering/` and `reference/approved-flat.html` before proposing work.
2. Treat confirmed decisions as binding. Never fill open questions with invented facts. Log questions and ask for approval.
3. Maintain a requirement-to-screen-to-API-to-test traceability table (`docs/governance/TRACEABILITY.md`) before implementation and keep it current.
4. No redesign of approved flat UI. No rounded cards, shadows, gradients, glass effects or arbitrary palette changes. Tokens come from `docs/design/DESIGN_TOKENS.md`, extracted from the reference. Accessibility takes precedence over exact fidelity where the reference conflicts with WCAG 2.2 AA (D-19), but only through the minimum corrections listed in `docs/design/ACCESSIBILITY_DEVIATIONS.md`.
5. Architecture: Next.js + TypeScript frontend (`apps/web`); Django/DRF modular monolith (`apps/api`); PostgreSQL; Docker Compose; shared VPS Traefik -> Nginx. Redis/Celery are deferred (ADR-0004). Keep The Granite Post untouched.
6. Every document has status DRAFT until the user explicitly approves. Proposals are not approvals.
7. When asked for Phase 0, produce document gap analysis, contradictions, open decisions and proposed revisions only. Stop before code.
8. Build in small reviewable commits with tests, migrations, security review and per-phase approval gates. Never deploy without explicit permission. Never claim a check passed unless it was actually executed; record failures and limitations.
9. Editorial separation of duties (D-18, D-22) is a product invariant: nobody approves or verifies their own submission; publication needs another authorised person's approval of the exact revision (the author may then publish it); material changes invalidate approval; there is no Publisher role in the initial implementation (D-23); every transition is audited. Never write code or admin shortcuts that bypass the workflow, and enforce the rules transactionally on the backend.
10. Documents under `docs/archive/` are reference inputs only and do not override current documents.

## Repository layout (D-10)
`apps/web`, `apps/api`, `docs/`, `reference/`, `infrastructure/`, optional `packages/`. `reference/approved-flat.html` must never be edited.

## Source of truth
`docs/governance/DECISION_REGISTER.md` is authoritative (D-16). Where documents conflict, identify the conflict and request a decision; do not silently choose.
