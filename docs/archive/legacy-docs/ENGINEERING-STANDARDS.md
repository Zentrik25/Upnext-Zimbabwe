# UPNEXT production engineering standards

## Structure
Monorepo: `apps/web` (Next.js), `apps/api` (Django), `infra/` (Compose and deployment), `docs/`, `tests/`. Within Django use bounded modules: `identity`, `profiles`, `organizations`, `opportunities`, `publishing`, `discovery`, `saved`, `notifications`, `audit`. Keep business rules in services, not views or serializers. Use database transactions for cross-table invariants.

## Contracts
Version API `/api/v1/`. Generate and review OpenAPI, enforce permissions server-side, consistent error codes, pagination, rate limits, and contract tests. Document deprecation and backwards compatibility.

## Data
Common opportunity fields: UUID, type, title, organization, location, work mode where applicable, summary, body, application method/link, source URL, source observed timestamp, deadline and timezone, lifecycle status, editorial verification status, timestamps. Validate category-specific attributes in separate typed models or explicit schema with versioning. Never conflate publication with verification. Prevent duplicates through source identifiers and editorial review.

## Reliability
Use PostgreSQL migrations and constraints. Define indexes after query inspection. Add Celery/Redis when asynchronous requirements start; tasks must be idempotent and observable. Readiness/liveness, request IDs, structured logs, Sentry-compatible errors, performance budgets, backup schedules and tested restoration.

## Security
Django-backed web sessions with HttpOnly Secure SameSite cookies, CSRF protection, email verification and recovery, Argon2 or strong supported hashing, brute-force throttling, RBAC and object-level permission tests, strict upload handling, secret rotation and dependency scans. Privacy and retention requirements documented before launch.

## Performance
Public SSR/metadata/sitemaps for discoverability; pagination and bounded query sizes. Define baseline SLOs and benchmark with realistic data before choosing caches, search engines, replicas or extra servers. No claims of supporting 100k concurrent users without load tests.

## Infrastructure
Independent Compose stack on shared VPS, isolated networks and database roles, bounded CPU/RAM, no host port collisions. Verify existing Traefik -> Nginx routing and TLS termination before preparing deployment labels/config. No production changes without backups and explicit approval.
