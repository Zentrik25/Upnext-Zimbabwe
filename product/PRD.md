# Product requirements document — DRAFT v0.1

## Roles
- Anonymous visitor: browse, search, filter, view and leave via source/application URL.
- Registered seeker: visitor capabilities plus profile, saved opportunities and personalised discovery.
- Editor/reviewer/admin: role-scoped editorial operations and audit records.

## Functional requirements and acceptance criteria
**PR-01 Public discovery:** Search and category pages require no login. Given an anonymous visitor, when a filter is applied, matching results and an explicit empty state appear without an account prompt.

**PR-02 Opportunity details:** Each public listing has stable canonical URL, title, organisation, category, source, verification status, deadline state and external action. Unknown fields are labelled unknown, not invented.

**PR-03 Accounts:** Register, verify as approved, sign in/out, reset password, manage sessions and delete/request deletion of account. Credentials are never stored in browser localStorage.

**PR-04 Profile:** Optional education, skills, interests and preferred locations; user can review, edit and remove information.

**PR-05 Personalisation:** Signed-in users can view a rules-based feed with understandable matching factors. Missing profile data does not fabricate eligibility.

**PR-06 Saved listings:** Authenticated users can save/unsave, view saved items and distinguish expired opportunities.

**PR-07 Editorial lifecycle:** Draft -> review -> approved/published -> expired/archived with server-side role permissions, provenance and audit history. Publishing authority remains an open policy decision.

**PR-08 Search:** Filter by category, location, deadline status and keyword; deterministic pagination and stable URLs. Search must handle no matches and unknown deadlines.

**PR-09 Quality:** Mobile responsive, keyboard accessible, sensible loading/error states, monitoring and automated regression tests.

## Launch exclusions
Native apps, payment, employer self-service, automated applications, unapproved scraping, CV parsing and ML eligibility scoring.

## Open questions
See `DECISION_REGISTER.md`. Do not implement features depending on unresolved decisions.
