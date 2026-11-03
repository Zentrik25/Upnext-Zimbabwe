# Phase 6A — employer portal: scope, design and security analysis — DRAFT

Status: DRAFT; implemented and **accepted by the owner (D-36)**, after the owner's written authorisation of 2026-10-18 (D-35). The repository holds no earlier Phase 6A plan, so this document **is** the plan and records what was understood from the instruction. Nothing is deployed. E-mail sending and change of e-mail stay off (B-01).

## 1. Scope (exactly what was authorised)

| # | Capability | Meaning here |
|---|---|---|
| 1 | Employer registration | An employer creates an ordinary account with the existing registration and e-mail confirmation flow (no new enumeration surface), then files an organisation claim |
| 2 | Organisation verification | A claim is decided by staff with `employer.review`; approving it records *how* the organisation was verified and grants a membership. Nobody decides their own claim |
| 3 | Company profiles | A verified organisation has a profile (tagline, about text, sector, size, founded year, location). Every change is a moderated revision; the public sees only an approved revision |
| 4 | Moderated job posting | Employers draft and submit jobs, internships and graduate programmes through the **existing publishing service**. Staff approve and publish. Employers can never approve, verify or publish |
| 5 | Employer dashboard | Claims, organisations, listing statuses, editors' return/rejection reasons, next actions |
| 7 | Close own listing (added by the merged PR #8, confirmed intentional by the owner in D-36) | A member of the verified organisation can withdraw a **published** listing with a reason (`opp.withdraw_own`); it removes content, never adds it. Staff `withdraw`/`takedown` stay staff-only |
| 6 | Basic listing analytics | Aggregate daily counters per listing: page views and apply-link clicks, plus the number of seekers who saved it. No personal data |

Not built (Phase 6B or later, or not authorised): team invitations, payments, applicant tracking or receiving applications, CV or logo uploads, employer e-mail notifications, bulk import by employers, profiles for seekers, For You or matching, any deployment.

## 2. Design

### 2.1 Data (app `employers`; no existing table is renamed)
- `OrganisationClaim` — user, optional existing `Organisation`, claimed name, website, registration number, role title, evidence note, status (pending/approved/rejected/withdrawn), decider, reason.
- `OrganisationVerification` — organisation, method (document review, official e-mail domain, website control, telephone call-back, other), evidence note, verified by/at, revoked by/at/reason. One active record per organisation. **An organisation is "verified" only while an unrevoked record exists** (same principle as D-14: never inferred).
- `EmployerMembership` — user, organisation, role (owner or recruiter), granted/revoked by and when. One active membership per user and organisation.
- `EmployerProfile` / `ProfileRevision` — public slug, live revision; each revision is frozen with a content hash when submitted and decided by a different person.
- `EmployerListing` — marks a listing as employer-originated and binds it to its organisation (the organisation cannot be changed by the employer, even if the request says otherwise).
- `ListingDailyStat` — (listing, day, views, apply clicks).

### 2.2 Authority without staff access
Employers are **not** staff: `User.is_staff` still derives only from staff role assignments, so an employer cannot reach `/staff/`. The publishing service gains an employer path that grants only the author actions (create, edit own draft, submit, discard own, amend) and only when all of these hold at execution time: the actor has an active membership of the listing's organisation, the organisation has an active verification, the category is jobs, internships or graduate programmes, and the actor authored the draft. Approval, rejection, return, verification and publication still need staff permissions and keep the separation-of-duties rules (D-18, D-22) and the PostgreSQL triggers unchanged.

### 2.3 Provenance and verification stay honest (D-14)
The employer-supplied listing carries an automatic primary source "Submitted by the employer through the NextJob employer portal" (kind `other`) and starts at verification level *not verified*. A staff member can still record a source check or an issuer-contact verification through the normal verification record. Being a verified **organisation** does not make a **listing** verified.

### 2.4 Analytics and privacy
Daily aggregate counters only: no cookie, identifier, IP address or user agent is stored. The browser reports one view per page load (once per tab session) and one apply click. Counts are approximate (repeat visits, scripted clients) and say so in the dashboard. Saves are counted from existing saved rows, as a number. The privacy draft and data inventory were updated; this remains **not legal approval**.

## 3. Threat analysis (abridged)

| Threat | Control |
|---|---|
| A stranger claims a well-known organisation | Claims are only requests; staff verify with a recorded method and evidence; only verified organisations may post |
| An employer posts for an organisation they do not belong to | Organisation comes from the membership, never from the request; the service re-checks membership at every step |
| An employer self-approves or publishes | No employer permission codes for review or publication; separation-of-duties policy and triggers unchanged; tests prove the refusals |
| A removed member keeps editing | Membership and verification are re-read under the listing lock at each action |
| A reviewer approves their own claim or profile | Decider must differ from the claimant/submitter; enforced in the service |
| Defamation, fraud or fee scams in a profile or listing | Everything public is moderated; the existing fee lint and validation apply to listings; profiles are plain text |
| Object-level access (IDOR) | Every employer endpoint resolves ids through the caller's memberships; foreign ids answer 404 |
| Analytics abuse (inflating counters) | Per-IP throttle, no authentication surface, counts documented as approximate |
| Account deletion | Memberships are revoked when an account is deleted; listings keep their history |
| E-mail | Nothing is sent: status is shown on the dashboard |

## 4. Owner decisions (D-36, 2026-10-18)

1. **Public company profile pages: approved**, showing verified public organisation details and the organisation's published vacancies only. Private verification records (method, evidence, claimant, notes) are never exposed.
2. **Implemented Phase 6A scope approved**, including employer-side closing of a published listing (confirmed intentional). No further employer features are required now.
3. **Analytics stay cookie-free and approximate.** Daily aggregates are kept for a **provisional 12 months**, then deleted by the worker (`UPNEXT_RETENTION_LISTING_STATS_DAYS=365`), subject to legal and privacy review.
4. Still open and editorial: verification methods and evidence standards (the five methods in the code are a starting point); team invitations stay unbuilt.
