# ADR-0022 — Phase 6A employer portal — DRAFT

Status: DRAFT (proposal recorded with D-35, implemented 2026-10-18). Not approved by the owner beyond the written Phase 6A authorisation.

## Context
The owner authorised an employer portal: registration, organisation verification, company profiles, moderated job posting, a dashboard and basic listing analytics (D-35). The editorial invariants (D-18, D-22, D-23) and the flat design must hold, and no live e-mail may be needed (B-01).

## Decision
1. **Employers are not staff.** No new staff role is added (the registry still has exactly three). Authority comes from an `EmployerMembership` of a **verified** organisation and is limited to the author actions through the publishing service (`EMPLOYER_AUTHOR_PERMISSIONS`), re-read at every action under the listing lock, for listings bound to that organisation (`EmployerListing`) in jobs, internships and graduate programmes.
2. **Claims and verification are explicit records**, decided by staff with `employer.review`, never by the claimant; verification stores method, evidence and the person, and can be revoked by an Administrator.
3. **Profiles are frozen revisions** approved by another person; the public sees only an approved revision of a verified organisation.
4. **Provenance stays honest**: employer submissions carry one automatic source and start unverified.
5. **Analytics are aggregate counters** (listing, UTC day, views, apply clicks) with no identifier, written by a public beacon; saves are counted from existing rows.
6. **No e-mail is added**: statuses are shown on the dashboard.
7. Internal names are unchanged apart from the new `employers` app; no existing table was renamed.

## Consequences
- A new public page (company profile) exists for verified organisations; D-15 deferred public organisation pages, so the owner is asked to confirm it.
- Team invitations, employer withdrawal of a published listing, uploads and notifications are not built.
- Counters are approximate and the retention of aggregates is undecided.

Alternatives rejected: a new "Employer" staff role (would grant `is_staff` and blur D-23); letting employers publish after organisation verification (breaks D-22); per-visitor analytics (conflicts with P4-04).
