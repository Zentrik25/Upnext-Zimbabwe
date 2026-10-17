# Technical architecture — DRAFT
Next.js + TypeScript + Tailwind frontend; Django + DRF modular monolith; PostgreSQL; Docker Compose. Redis/Celery when asynchronous jobs are required. Public web pages should be indexable and rendered appropriately for SEO.

Modules: identity, profiles, organisations, opportunities, editorial, discovery, bookmarks, notifications (future), audit. Business logic belongs in domain services, not view handlers. API versioning from `/api/v1/` and generated OpenAPI contracts.

Production: same VPS as The Granite Post, isolated Compose projects/databases/credentials. Existing network path has Traefik in front of Nginx. **Inspect actual routing and server capacity before deployment; never change existing routing or restart Granite containers without approval.**

Scale path: stateless API replicas, workers, managed database/object storage, cache, dedicated search engine only when metrics warrant. No premature microservices.
