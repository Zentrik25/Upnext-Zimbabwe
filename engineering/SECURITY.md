# Security and privacy — DRAFT
Threat model must cover credential stuffing, account enumeration, broken object-level authorisation, CSRF, XSS, SSRF in source ingestion, malicious application URLs, editor privilege escalation, personal-data leakage, spam and scraping abuse.

Controls: Django password hashing, secure HttpOnly SameSite cookies with appropriate CSRF protections, HTTPS, rate limiting, server-side RBAC, strict input validation, safe URL protocols, audit logs, least-privilege DB users, secrets outside Git, backups and restore drills.

Data minimisation: optional profile fields, consent/notice, export/deletion workflow, documented retention periods. Legal/privacy obligations for Zimbabwe must be researched and reviewed before production.
