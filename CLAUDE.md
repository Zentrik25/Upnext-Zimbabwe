# CLAUDE.md — UPNEXT project rules
**Current stage: DOCUMENTATION ONLY (Phase 0). No application implementation, database migrations, infrastructure modification or deployment is authorised.**

1. Read `00-READ-ME-FIRST.md`, `docs/governance/DECISION_REGISTER.md`, the applicable documents under `docs/product/`, `docs/design/`, `docs/engineering/` and `reference/approved-flat.html` before proposing work.
2. Treat confirmed decisions as binding. Never fill open questions with invented facts. Log questions and ask for approval.
3. Maintain a requirement-to-screen-to-API-to-test traceability table (`docs/governance/TRACEABILITY.md`) before implementation and keep it current.
4. No redesign of approved flat UI. No rounded cards, shadows, gradients, glass effects or arbitrary palette changes. Tokens come from `docs/design/DESIGN_TOKENS.md`, extracted from the reference.
5. Architecture: Next.js + TypeScript frontend (`apps/web`); Django/DRF modular monolith (`apps/api`); PostgreSQL; Docker Compose; shared VPS Traefik -> Nginx. Redis/Celery are deferred (ADR-0004). Keep The Granite Post untouched.
6. Every document has status DRAFT until the user explicitly approves. Proposals are not approvals.
7. When asked for Phase 0, produce document gap analysis, contradictions, open decisions and proposed revisions only. Stop before code.
8. When later authorised to build, use small reviewable changes, tests, migrations, security review and per-phase approval gates. Never deploy without explicit permission.
9. Editorial separation of duties (D-09) is a product invariant: never write code or admin shortcuts that let one person author, approve and publish the same listing, or that let any role bypass the workflow.
10. Documents under `docs/archive/` are reference inputs only and do not override current documents.

## Repository layout (D-10)
`apps/web`, `apps/api`, `docs/`, `reference/`, `infrastructure/`, optional `packages/`. Application directories stay absent/empty until the relevant phase is approved. `reference/approved-flat.html` must never be edited.

## Source of truth
`docs/governance/DECISION_REGISTER.md` is authoritative (D-16). Where documents conflict, identify the conflict and request a decision; do not silently choose.
