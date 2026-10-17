# Screen specifications — DRAFT
Binding visual source: `reference/approved-flat.html` (D-08); tokens in `DESIGN_TOKENS.md`. Review each screen at 1440px, 768px, 390px and 320px against the reference; no horizontal scroll at any width (the reference measures clean at 390 and 320). Screen ids are used by `docs/governance/TRACEABILITY.md`.

| ID | Screen | Required sections | Key states |
|---|---|---|---|
| SC-01 | Home | compact header/nav, hero with search (keyword + location), category tabs, recent opportunities, account entry point, footer | loaded, empty, error |
| SC-02 | Explore / results | query, filters panel, feed tabs, sort, result count, listing rows, pagination | loading, zero results, invalid filter, rate limited |
| SC-03 | Opportunity detail | title, organisation, category, location(s), published date, deadline state, description, requirements, application instructions (accurate label: external site / email / instructions), source(s) with date checked, verification level, save action (signed-in) | active, closing soon, unknown deadline, expired, withdrawn, source unavailable, not_verified / source_checked / issuer_verified |
| SC-04 | Register | name, email, password with rules, errors, link to sign in | empty, invalid, submitting, accepted ("check your email", identical for any address), rate limited |
| SC-05 | Sign in | email, password, reset link | incorrect credentials, email not verified, session expired, rate limited |
| SC-06 | Verify email | pending notice + throttled resend; token landing | pending, success, invalid/expired token |
| SC-07 | Forgot / reset password | request form; reset form | request accepted (identical), token invalid, success |
| SC-08 | Profile onboarding | interests, locations, qualification, skills/experience, review — every non-essential step skippable | incomplete, saved, validation |
| SC-09 | For You | ranked list, reasons (and "not compared" notes), filters, save, deadline indicators, profile-improvement hints | incomplete profile (useful results still shown, OQ-23), no matches |
| SC-10 | Saved | list, availability/deadline status, unsave, category filter | empty, expired item, unavailable item |
| SC-11 | Account settings | profile, email change (re-auth), password change, sessions list/revoke, deletion request, sign out | validation, re-auth required, deletion pending |
| SC-12 | Staff editorial | draft form with provenance, duplicate warnings, review queue, approval queue, verification form, history, preview | conflict (stale version), rejection, publish failure, separation-of-duties refusal |
| SC-13 | Staff administration | users, roles, status, taxonomies, audit log, email outbox, settings | permission denied, pending confirmation (OQ-13) |
| SC-14 | Static pages | about, contact, privacy, terms | content depends on OQ-09 |
| SC-15 | System states | offline, API failure, 404, 429, session expiry | — |

**Scope notes.** Public "Organisations" pages, alerts UI, employer entry points and eligibility statements are **not** in Release 1 (D-15; OQ-24 decides what to do with the reference's "For employers" link and alerts widget). The reference's numeric "% preference match" is a demo; the production display is OPEN (OQ-23).

**Components absent from the reference** (pagination, loading/error/offline states, account forms, detail page, expired/withdrawn banners, verification badges, sessions list) must be derived from recorded tokens and approved before build (see `DESIGN_TOKENS.md §4`).

**Design sign-off:** pixel/visual comparison with `reference/approved-flat.html` (VIS-01…VIS-04); deviations require an explicit design decision record. Pixel fidelity vs WCAG 2.2 AA where they conflict is OQ-25.
