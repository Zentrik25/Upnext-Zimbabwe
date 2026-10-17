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
