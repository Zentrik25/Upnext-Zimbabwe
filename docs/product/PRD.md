# Product requirements document — DRAFT v0.2
Updated 2026-10-17 for decisions D-08…D-21. Traceability to screens, API and tests: `docs/governance/TRACEABILITY.md` (R-01…R-32).

## Roles
- **Anonymous visitor:** browse, search, filter, view and leave via source/application URL.
- **Registered seeker:** visitor capabilities plus profile, saved opportunities and personalised discovery.
- **Contributor:** creates and edits own listing drafts, submits them, opens amendments.
- **Editor:** approves or rejects submissions they did not author, records verification, and may publish what they approved (D-18).
- **Administrator:** manages users, roles, taxonomies and settings; holds the same approval and publication authority as an Editor, bounded by the same rule that nobody approves or publishes their own work (D-18).
- **Publisher (optional, OQ-32):** publication authority only.
Two different people are sufficient for the normal publishing workflow; every transition is audited. Details: `docs/engineering/ROLE_PERMISSION_MATRIX.md`.

## Functional requirements and acceptance criteria
**PR-01 Public discovery:** Search and category pages require no login. Given an anonymous visitor, when a filter is applied, matching results and an explicit empty state appear without an account prompt. (R-01)

**PR-02 Opportunity details:** Each public listing has a stable canonical URL (immutable slug), title, organisation, category, source(s), verification level, deadline state and external action. Unknown fields are labelled unknown, not invented. (R-02, R-03)

**PR-03 Accounts:** Register, verify email, sign in/out, reset password, manage sessions and request deletion. Credentials are never stored in browser localStorage. Verification and reset emails are delivered reliably through the outbox design (D-11). (R-04, R-05, R-18)

**PR-04 Profile:** Optional education, skills, interests, locations, experience and work arrangements; the user can review, edit and remove information. (R-07)

**PR-05 Personalisation:** Signed-in users can view a rules-based feed with understandable matching reasons. Missing profile data does not fabricate eligibility; there are no eligibility decisions (D-15). (R-08)

**PR-06 Saved listings:** Authenticated users can save/unsave, view saved items and distinguish expired or unavailable opportunities. (R-09)

**PR-07 Editorial lifecycle:** Draft → in review → approved → published → expired/withdrawn/archived, with rejection, server-side role permissions, separation of duties (author ≠ approver), provenance and audit history of every transition. Scheduled publishing is OPEN (OQ-14). (R-10, R-11, R-16)

**PR-08 Search:** Filter by category, location, deadline state and keyword (plus work mode, employment type, experience level, publication date); deterministic cursor pagination; stable URLs; handle no matches and unknown deadlines. (R-13, R-21)

**PR-09 Quality:** Mobile responsive (320/390/768/1440), keyboard accessible, sensible loading/error states, monitoring and automated regression tests. (R-14, R-24)

**PR-10 Trust:** Source provenance is mandatory to publish; verification is a separate, evidence-based label that publication never implies (D-14). (R-12)

## Launch exclusions
Native apps, payment, employer self-service, automated applications, unapproved scraping, CV upload/parsing, ML eligibility scoring, and (D-15) automatic eligibility decisions, public organisation pages, advanced related-opportunity recommendations, object storage, alerts and advertising.

## Open questions
See `docs/governance/DECISION_REGISTER.md`. Do not implement features depending on unresolved decisions.
