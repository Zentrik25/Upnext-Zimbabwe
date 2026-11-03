# ADR-0024 — Staff interface redesign inside Django Admin (D-49) — DRAFT

Status: DRAFT. Recorded with D-49 (owner instruction, 2026-10-29). **Superseded by ADR-0025:** the owner then asked for a Next.js staff app and, after it covered every page, for the Django Admin to be retired; the re-skin described here was removed and P-STAFFUI-01 is withdrawn. Kept as the record of the first approach. Not merged, not deployed.

## Context
The owner asked for a full redesign of the staff interface to match an approved dashboard screenshot and the Stripe design system already adopted for the public site (D-45). The request assumed existing Next.js staff routes and an editorial API. Neither exists: the staff interface is the Django Admin under `/staff/` and "no editorial or administration API is exposed" (P2-06, OQ-16). Adding a staff application in Next.js would need new write endpoints for review, approval and publication, a second authorisation surface, and a decision to change P2-06.

## Decision
1. **Re-skin and extend the Django Admin; add no write API.** Authentication, the two-step gate, CSRF, role checks, `access.policy`, `opportunities.workflow` and the database triggers are unchanged. `opportunities.admin` only gained shared helpers (`listings_visible_to`, `awaiting_review`, `listing_action_links`) so the list, the dashboard and the search box use one visibility rule and one review-queue rule.
2. **Page shell** (`core/staff_templates/admin/base.html`): brand-dark sidebar (drawer below 1100 px), top bar with search, theme switch, bell and account menu. Built from `core/staff_shell.py`, which shows a link only if Django Admin already lists the model for the person or the permission code is held; it is withheld on the sign-in and two-step pages and before the second step passes.
3. **Dashboard** (`core/staff_dashboard.py`, `StaffAdminSite.index`): five KPI cards from one aggregate query over the person's visible listings (Total, Published, Drafts and Expired are by `Opportunity.status`, so they never double count; "closing within 7 days" is the part of Published with a live deadline in the next seven days), a needs-attention list that shows a row only to people holding the matching permission (review counts exclude what the person authored or submitted), recent activity from `PublishingEvent`, and the latest listings with a permission-aware action menu whose links are the existing action views.
4. **Search** (`/staff/search/`): read-only JSON, at least two characters, five results per group, listings through `listings_visible_to` and never matching another person's draft revision, organisations and reports only for people who may open them. Without JavaScript the box submits to the list's own search.
5. **Activity log**: a read-only admin for `PublishingEvent`, scoped to visible listings. The full audit log stays Administrator-only.
6. **Design**: `apps/web/scripts/generate-tokens.mjs` now also writes `a generated staff-tokens.css in the API static files (removed with the admin)` from `tokens.json` (checked by `npm run tokens:check`). `staff.css` uses only those variables. Inter 300 and 400 are served from the API's static files (staff CSP: fonts and scripts from this origin only); there is no inline script, so the theme is set by `staff-theme.js` and behaviour by `staff.js`.
7. **Illustration**: the owner-supplied image, background removed, 560 px WebP (36 KB), used only in the dashboard banner with empty alt text.

## Consequences
- Staff pages that Django generates (forms, inlines, lists) are restyled by CSS, not rebuilt; the create-listing form keeps its fields and validation.
- Weight 300 is kept for headings and figures; UI text uses 400 for legibility.
- Departures from the owner's brief, all because nothing in the system supports them: no stored notifications, no row checkboxes (no bulk action is authorised), no System Settings, Tags (sectors and skills instead) or staff profile pages, no charts.
- If the owner wants a Next.js staff application instead, that is a change to P2-06 and needs its own decision, ADR and security review.
