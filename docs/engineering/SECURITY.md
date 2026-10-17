# Security and privacy — DRAFT
Superseded in detail by `SECURITY_ARCHITECTURE.md` (authentication, sessions, CSRF, email, threat model TM-01…TM-20, rate limits, headers, data protection). This file keeps the summary.

Threat categories covered: credential stuffing, account enumeration, broken object-level authorisation, CSRF, XSS, SSRF (avoided: no server-side fetching of editor/user URLs in Release 1), malicious application URLs, editor privilege escalation and separation-of-duties bypass, personal-data leakage, spam and scraping abuse, supply chain, collateral damage to The Granite Post.

Controls: Argon2id hashing, HttpOnly/Secure/SameSite cookies with CSRF protection, HTTPS, rate limiting, server-side RBAC with identity-based separation of duties, strict input validation, safe URL protocols, append-only audit log, least-privilege DB roles, secrets outside Git, backups with restore drills.

Privacy: data minimisation, optional profile fields, notice, export and deletion workflow, documented retention. Zimbabwean legal and privacy obligations must be researched and reviewed before production; periods and process are OPEN (OQ-09). No legal conclusion is asserted in these documents.
