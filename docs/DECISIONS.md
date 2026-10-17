# Decisions and open questions

Confirmed: Zimbabwe-first UPNEXT; flat approved UI; Next.js/TypeScript/Tailwind; Django/DRF; PostgreSQL; Docker; shared VPS; Traefik in front of Nginx; isolated deployment; public browse with account-gated personalisation.

Needs user approval before implementation: exact domain; account verification method; whether applications always redirect externally; admin-only publishing vs employer submission; notification provider and timing; VPS resource capacity and actual routing topology; privacy/retention policy.

- Approved engineering direction: production-grade modular monolith, extensible APIs and data model, phase gates, no speculative microservices.
- Existing shared VPS routing: Traefik in front of Nginx; inspect live configuration before any deployment changes.
- Employer submissions and publishing policy: NOT YET APPROVED; Claude Code must request decision rather than assume.
