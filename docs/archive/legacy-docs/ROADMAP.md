# Delivery roadmap with mandatory approval gates

Phase 0 — Architecture/specification only: inspect reference, write ADRs, schema, API contract outline, threat model, acceptance criteria, delivery plan. NO application code or server changes. STOP for approval.
Phase 1 — Foundation: repository, CI, containerized local development, database, Django modules, authentication primitives, API schema, admin shell. Tests and security baseline. STOP.
Phase 2 — Opportunity domain: category-specific schemas, publishing lifecycle, source provenance, verification workflow, moderation, audit, CMS. STOP.
Phase 3 — Public website: faithful flat design, SEO-friendly search/detail pages, filters, responsive/accessibility. STOP.
Phase 4 — Accounts: registration, verification, recovery, profile onboarding, permissions, session management. STOP.
Phase 5 — Discovery: explainable relevance scores, saved listings, dashboard, deadline display, search performance. STOP.
Phase 6 — Hardening: observability, notifications when approved, backup/restore rehearsal, load testing, accessibility, security and staging review. STOP.
Phase 7 — Deployment: verify Traefik -> Nginx architecture and VPS capacity; prepare isolated stack, deployment and rollback plan. Deploy ONLY with explicit approval.
