# Technical architecture

Frontend: Next.js App Router, TypeScript, Tailwind CSS; server-render public indexable detail pages with metadata, canonical URLs and sitemap.
Backend: Django + Django REST Framework; Django admin with explicit editor/reviewer permissions; secure authentication, CSRF protection, rate limits and audit logs.
Database: PostgreSQL with indexed category, status, deadline, location, slug, and full-text search as appropriate.
Matching: deterministic rules using profile interests, qualifications, skills, locations and listing attributes; store/reveal factor explanations, avoid claims of eligibility.
Background tasks: only add Celery/Redis when scheduled alerts or recurring expiry work requires them; initial expiry may be implemented with a scheduled Django management command.

## Production boundaries
Separate GitHub repo and Docker Compose project from The Granite Post. Use dedicated DB/role and separate persistent volumes and env files. Existing edge path is Traefik -> Nginx -> app services, but exact topology, labels, certificates, networks and ports MUST be inspected before deployment. Never presume Nginx or Traefik configuration values. No changes to The Granite Post containers/config without approval.

## Security baseline
Do not copy localStorage demo login into production. Use Django-backed auth with server-side secure HttpOnly cookies, HTTPS, CSRF, password hashing, email verification/reset subject to approved flow, least privilege, input validation, and no secrets in git. Limit outbound redirect abuse and sanitize user-supplied content.
