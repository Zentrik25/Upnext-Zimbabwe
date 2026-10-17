# Technical architecture — DRAFT
Confirmed: Next.js + TypeScript + Tailwind; Django + DRF modular monolith; PostgreSQL; Docker Compose; shared VPS with Traefik in front of Nginx (D-04, D-05, D-06). Layout per D-10. Detail documents: `ERD.md`, `SECURITY_ARCHITECTURE.md`, `EDITORIAL_WORKFLOW.md`, `openapi/openapi.yaml`, ADRs.

## Repository
`apps/web` (Next.js), `apps/api` (Django), `docs/`, `reference/`, `infrastructure/`, optional `packages/`. No application directories exist until Phase 1 is approved.

## Django modules (working names, P-01 pending approval)
`accounts`, `profiles`, `organisations`, `opportunities`, `taxonomies`, `discovery`, `bookmarks`, `publishing`, `verification`, `notifications` (email outbox only in Release 1), `audit`. Business logic lives in domain services, not views, serializers or signals. Cross-module calls go through service functions; dependencies are documented; no circular imports. Modules need not be separate Django apps on day one.

## Runtime
- Public pages server-rendered (SEO: metadata, canonical URLs, sitemap, noindex for non-public). Account pages are client-driven against the API.
- API under `/api/v1`, OpenAPI as the contract (`docs/engineering/openapi/openapi.yaml`); the generated schema must match it in CI.
- Same-origin, path-routed topology (browser → Traefik → Nginx → web / api) with first-party cookie sessions; hostname decisions OQ-01, real routing OQ-10 (not yet inspected).
- PostgreSQL: system of record, full-text search (`tsvector`) behind an internal search interface; no dedicated search engine until measurements justify it.
- **No Redis or Celery in Release 1 (D-11).** Database-backed sessions and rate-limit cache; email through a transactional outbox worker; deadline expiry through a scheduled management command. Upgrade triggers: OQ-30.
- Observability: structured logs with request ids, health/readiness endpoints, job heartbeats, error tracking (hosting OQ-26).

## Production boundaries
Separate Compose project, networks, volumes, env files, database and credentials from The Granite Post. Inspect the actual Traefik/Nginx topology, TLS, networks, ports and VPS capacity read-only before preparing any deployment config; never change Granite containers or configuration without approval (CLAUDE.md, OQ-10).

## Scale path
Stateless API replicas and dedicated workers (and then Celery/Redis) when measured; managed database and CDN later; search engine only on evidence. No microservices.

## Implemented in Phase 1
Django packages in `apps/api`: `config` (settings split, URLs, WSGI/ASGI), `core` (JSON logging with redaction, request-id and request-log middleware, health probes, shared migrations: cache table and primary-key immutability function), `access` (role/permission registry and pure separation-of-duties policy, DRF permission class), `accounts` (custom user model, staff role assignments, read-only admin, bootstrap command), `api` (versioned routes, error shape, throttles, CSRF-enforcing session authentication, OpenAPI extension). Implemented endpoints: `GET /api/v1/`, `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/me`, plus `/health/live`, `/health/ready` and (development only) `/api/v1/schema`. The remaining modules in the list above (`profiles`, `organisations`, `opportunities`, `taxonomies`, `discovery`, `bookmarks`, `publishing`, `verification`, `notifications`, `audit`) arrive with their phases; `access` and `core` are platform packages added in Phase 1 (module naming proposal P-01 is still pending approval).
Frontend in `apps/web`: App Router pages `/` (live API status) and `/design-system` (noindex), `proxy.ts` (nonce CSP), design tokens and UI primitives. See `docs/engineering/LOCAL_DEVELOPMENT.md` and `docs/adr/ADR-0017-phase-1-foundation-choices.md`.

## Implemented in Phase 2
Django packages added in `apps/api`: `audit` (append-only `AuditEvent`, `audit.services.record`), `catalog` (categories, locations, sectors, skills, organisations, detail-schema registry and the six version-1 schema files, validators, escape-first Markdown renderer, starter taxonomies), `opportunities` (listings and immutable revisions, sources, verification and review records, history, the publishing service, duplicate detection, public queries, Django Admin editorial CMS, `seed_demo`). Staff interface: `/staff/` (Django Admin). Public API: the six catalogue operations listed in `API_CONTRACTS.md`. Frontend: `/opportunities` and `/opportunities/[slug]` (server-rendered; the API is called over the internal network; no `dangerouslySetInnerHTML`). See ADR-0018 and `docs/phase2/PHASE2_REPORT.md`.
