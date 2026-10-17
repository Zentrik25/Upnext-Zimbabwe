# CLAUDE.md — UPNEXT project rules
**Current stage: DOCUMENTATION ONLY. No application implementation, infrastructure modification or deployment is authorised.**

1. Read `00-READ-ME-FIRST.md`, `governance/DECISION_REGISTER.md`, the applicable product/design/engineering documents and `reference/approved-flat.html` before proposing work.
2. Treat confirmed decisions as binding. Never fill open questions with invented facts. Log questions and ask for approval.
3. Maintain a requirement-to-screen-to-API-to-test traceability table before implementation.
4. No redesign of approved flat UI. No rounded cards, shadows, gradients, glass effects or arbitrary palette changes.
5. Architecture: Next.js + TypeScript frontend; Django/DRF modular monolith; PostgreSQL; Docker Compose; shared VPS Traefik -> Nginx. Keep The Granite Post untouched.
6. Every document has status DRAFT until user explicitly approves. Proposals are not approvals.
7. When asked for Phase 0, produce document gap analysis, contradictions, open decisions and proposed revisions only. Stop before code.
8. When later authorised to build, use small reviewable changes, tests, migrations, security review and per-phase approval gates. Never deploy without explicit permission.
