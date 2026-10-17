# API contracts — DESIGN OUTLINE ONLY
Prefix `/api/v1/`; JSON responses; documented errors, pagination, filtering, sorting, authentication and rate limits. Publish an OpenAPI schema before implementation.

Candidate resources: `GET /opportunities`, `GET /opportunities/{slug}`, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET/PATCH /me/profile`, `GET /me/recommendations`, `GET/POST /me/saved`, `DELETE /me/saved/{opportunity_id}`. Editorial endpoints require separate role permissions.

Endpoint names, response envelopes, auth cookie/CSRF strategy, idempotency and version retirement policy are **DRAFT**. Do not treat this outline as approved implementation contracts.
