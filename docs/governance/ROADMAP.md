# Documentation-first roadmap
Gates require evidence and written approval; no automatic phase advancement.

| Phase | Scope | Status |
|---|---|---|
| 0 | Documentation: product, design tokens, ERD, validation, OpenAPI, permissions, workflow, security, ADRs, traceability | **Approved as baseline** (2026-10-17, D-26) |
| 1 | Foundation: repository layout, CI, containerised local development, database, Django module skeleton, auth wiring, API schema, admin shell, tests and security baseline | **Authorised and implemented for review** — see `docs/phase1/PHASE1_REPORT.md` |
| 2 | Opportunity catalogue and editorial CMS: organisations, taxonomies, revisions, provenance, verification, workflow with separation of duties, audit, Django Admin staff interface, public read-only API and basic public pages | **Authorised and implemented for review** — see `docs/phase2/PHASE2_REPORT.md`. Built on the provisional defaults P2-01…P2-10 (OQ-05…OQ-08, OQ-14, OQ-16, OQ-20…OQ-22, OQ-29 remain open) |
| 3 | **As re-scoped by the owner (D-27): authentication, accounts and saved opportunities, with staff security improvements** (registration, e-mail confirmation, sign-in, reset, password change, sessions, deletion request, saved list, staff two-step verification, staff CSP, session limits, e-mail outbox worker) | **Authorised and implemented for review** — see `docs/phase3/PHASE3_REPORT.md`. Built on the provisional defaults P3-01…P3-08 |
| 3b | Public website items from the earlier plan: design review of the remaining derived components, SEO (sitemap, structured data, robots), static pages | Not started. Blocked by OQ-01, OQ-18…OQ-20, OQ-24 |
| 4 | Accounts, remaining part: profile and onboarding, change of e-mail address, deletion execution, a real e-mail provider (the rest of the original phase 4 is done in Phase 3) | Blocked by OQ-03, OQ-09, OQ-21 |
| 5 | Discovery: For You (saved listings are done in Phase 3) | Blocked by OQ-23 |
| 6 | Hardening: observability, backup/restore rehearsal, load tests, accessibility, security, staging | Blocked by OQ-11, OQ-26, OQ-27 |
| 7 | Deployment: read-only inspection of Traefik→Nginx and VPS capacity, isolated stack, rollback; deploy only with explicit approval | Blocked by OQ-01, OQ-10 |

Earlier labels D0–D3 and Build 1–7 map to Phase 0 and Phases 1–7 respectively. Release 1 (specification §5) corresponds to Phases 1–7; Releases 2–5 are direction only.
