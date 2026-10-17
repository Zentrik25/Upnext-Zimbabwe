# Release and phase gates

Each phase requires: reviewed design/architecture decisions, migration review, unit tests, integration tests, API permission/contract tests where relevant, Playwright flows for user-facing features, lint/type checks, security scan, accessibility check, and evidence of results. Record failures; never invent test outcomes.

Before production: seeded staging, performance benchmark with documented hardware and realistic records, error monitoring, health checks, restore rehearsal, rollback procedure, HTTPS/session/CSRF verification, privacy policy, robots/sitemap validation, audit log review, and deployment approval.

Acceptance examples: anonymous visitors can search and open detail pages; account-only endpoints reject anonymous access; users cannot view other users' saved listings; unverified listings are never shown as verified; deadline times retain timezone; admin status changes create audit records; demo fixtures cannot be published to production.
