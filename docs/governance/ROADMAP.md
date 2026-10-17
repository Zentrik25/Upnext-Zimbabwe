# Documentation-first roadmap
Gates require evidence and written approval; no automatic phase advancement.

| Phase | Scope | Status |
|---|---|---|
| 0 | Documentation: product, design tokens, ERD, validation, OpenAPI, permissions, workflow, security, ADRs, traceability | **Package submitted for review** (`docs/phase0/PHASE0_REVIEW_PACKAGE.md`) |
| 1 | Foundation: repository layout, CI, containerised local development, database, Django module skeleton, auth wiring, API schema, admin shell, tests and security baseline | Not started — needs Phase 0 approval and approval of the OQ-28 pins |
| 2 | Opportunity domain: category schemas, workflow, provenance, verification, audit, staff interface | Blocked by OQ-05…OQ-08, OQ-13, OQ-14, OQ-16, OQ-21, OQ-22, OQ-29, OQ-32, OQ-33 |
| 3 | Public website: faithful flat design, SEO, filters, responsive and accessible | Blocked by OQ-01, OQ-18…OQ-20, OQ-24 (and your confirmation of the accessibility deviations) |
| 4 | Accounts: registration, verification, recovery, profile, sessions, email outbox | Blocked by OQ-03, OQ-04, OQ-09, OQ-15, OQ-17, OQ-30 |
| 5 | Discovery: For You, saved listings | Blocked by OQ-23, OQ-31 |
| 6 | Hardening: observability, backup/restore rehearsal, load tests, accessibility, security, staging | Blocked by OQ-11, OQ-26, OQ-27 |
| 7 | Deployment: read-only inspection of Traefik→Nginx and VPS capacity, isolated stack, rollback; deploy only with explicit approval | Blocked by OQ-01, OQ-10 |

Earlier labels D0–D3 and Build 1–7 map to Phase 0 and Phases 1–7 respectively. Release 1 (specification §5) corresponds to Phases 1–7; Releases 2–5 are direction only.
