# Information architecture — DRAFT
**Public:** `/`, `/opportunities`, `/opportunities/{slug}`, category filters, `/about`, `/contact`, privacy, terms. Category links (jobs, internships, graduate programmes, scholarships, tenders, grants) are filters of `/opportunities`; dedicated canonical category paths are **OPEN** until SEO review (OQ-20, OQ-01).
**Account:** `/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account/profile`, `/account/for-you`, `/account/saved`, `/account/settings`.
**Staff:** `/staff/` (Django Admin initially; separate staff routes only if workflow needs justify it, OQ-16). Not indexed, shorter sessions.

**Navigation.** Public: Home, Find Opportunities (category filters), About, Sign in, Create account. Authenticated: For You, Explore, Saved, Profile, Settings, Sign out. Staff: dashboard, opportunities, review/approval queues, verification, users and roles, taxonomies, audit, settings — visible only to holders of the relevant role, and enforced server-side.
**Deferred:** a public "Organisations" section and any employer entry point (D-15; OQ-24 decides what happens to the reference's "For employers" link).

URL conventions: lowercase, no trailing slash; listing slugs are immutable (D-13). Preserve deep links and meaningful breadcrumbs.
