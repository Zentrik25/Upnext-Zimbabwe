# Documentation-first roadmap
Gates require evidence and written approval; no automatic phase advancement.

| Phase | Scope | Status |
|---|---|---|
| 0 | Documentation: product, design tokens, ERD, validation, OpenAPI, permissions, workflow, security, ADRs, traceability | **Approved as baseline** (2026-10-17, D-26) |
| 1 | Foundation: repository layout, CI, containerised local development, database, Django module skeleton, auth wiring, API schema, admin shell, tests and security baseline | **Authorised and implemented for review** — see `docs/phase1/PHASE1_REPORT.md` |
| 2 | Opportunity catalogue and editorial CMS: organisations, taxonomies, revisions, provenance, verification, workflow with separation of duties, audit, Django Admin staff interface, public read-only API and basic public pages | **Authorised and implemented for review** — see `docs/phase2/PHASE2_REPORT.md`. Built on the provisional defaults P2-01…P2-10 (OQ-05…OQ-08, OQ-14, OQ-16, OQ-20…OQ-22, OQ-29 remain open) |
| 3 | Public website: design review of the derived components, SEO (sitemap, structured data, robots), saved-item states, remaining pages | Blocked by OQ-01, OQ-18…OQ-20, OQ-24 (accessibility deviations approved, D-24); basic list and detail pages already exist from Phase 2 |
| 4 | Accounts: registration, verification, recovery, profile, sessions, email outbox | Blocked by OQ-03, OQ-04, OQ-09, OQ-15, OQ-17, OQ-30 |
| 5 | Discovery: For You, saved listings | Blocked by OQ-23, OQ-31 |
| 6 | Hardening: observability, backup/restore rehearsal, load tests, accessibility, security, staging | Blocked by OQ-11, OQ-26, OQ-27 |
| 7 | Deployment: read-only inspection of Traefik→Nginx and VPS capacity, isolated stack, rollback; deploy only with explicit approval | Blocked by OQ-01, OQ-10 |

Earlier labels D0–D3 and Build 1–7 map to Phase 0 and Phases 1–7 respectively. Release 1 (specification §5) corresponds to Phases 1–7; Releases 2–5 are direction only.
