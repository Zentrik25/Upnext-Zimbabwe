# Test strategy — DRAFT
Unit: domain rules, deadlines/timezones, matching explanations, permissions. Integration: ORM constraints, migrations, authentication and editorial state transitions. API contract: OpenAPI schema validation, error consistency, pagination and backwards compatibility. End-to-end: public browsing, sign-up, profile, save, editorial review. Accessibility: keyboard, contrast, screen reader semantics. Performance: measured baseline for public pages/search and load test against defined capacity assumptions. Security: dependency scanning, secrets detection, authz regression and URL validation.

Release gate: green CI, no critical/high known security defects, migration rehearsal, backup restoration test, rollback plan, documented monitoring and explicit approval.
