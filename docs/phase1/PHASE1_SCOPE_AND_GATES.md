# Phase 1 — scope, restrictions and quality gates

Authorised by D-26 (2026-10-17). Phase 1 delivers the **production-grade application foundation** only.

## In scope
Monorepo structure (`apps/web`, `apps/api`, `infrastructure/`); Next.js + TypeScript + Tailwind; Django + DRF; PostgreSQL with a custom user model before the first migration; versioned API routing under `/api/v1/` with generated OpenAPI; foundational authentication and permission configuration (session cookies, CSRF, Argon2id, role/permission registry and pure policy functions) **without** building the account product; reusable UI primitives from the approved tokens; local Docker Compose; tests, linting, formatting, type checking and GitHub Actions; secure environment configuration, health checks and structured logging; local-development documentation.

## Out of scope (do not build)
Opportunity CMS and workflow endpoints, matching engine, employer portal, payments, notifications/email delivery, account registration/verification/reset flows, public search pages. No deployment to the VPS; no change to The Granite Post or the existing Traefik/Nginx.

## Quality gates (a gate is "passed" only if it was executed; evidence in `PHASE1_REPORT.md`)
| # | Gate | How it is verified |
|---|---|---|
| 1 | The frontend starts and renders | `docker compose up`, HTTP check, Playwright render test |
| 2 | The backend starts and responds through `/api/v1/` | HTTP check, API tests |
| 3 | PostgreSQL connects and migrations run | `migrate` against PostgreSQL 18.6; `makemigrations --check` |
| 4 | Frontend and backend run together with Docker Compose | `docker compose up`, end-to-end request through the proxy |
| 5 | Automated tests pass | pytest, Vitest, Playwright |
| 6 | Type checking and linting pass | mypy, ruff, `tsc`, ESLint, Prettier |
| 7 | OpenAPI validation passes | generated schema validated; contract test against `docs/engineering/openapi/openapi.yaml` |
| 8 | No secrets are committed | secret scan over the working tree and history |
| 9 | The foundational UI matches the approved flat design | computed-style tests against the reference tokens and accessibility deviations; axe; visual checks at 1440/768/390/320 |
| 10 | Documentation remains consistent with the implementation | consistency script + manual review |
