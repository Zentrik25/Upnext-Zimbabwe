# Phase 6A report — employer portal — DRAFT

Status: DRAFT, implemented and awaiting owner review. Authorised in writing on 2026-10-18 (D-35; baseline `bba8168`, CI 39122537513 passed). Nothing was deployed; the VPS, Traefik/Nginx and The Granite Post were not touched. **Phase 6B was not started.** E-mail sending and change of e-mail stay off; the Resend delivery-verification blockers (B-01, B-03) are open and unchanged. Nothing here is legal approval.

## 1. What was built (and only this)

| Authorised item | Built |
|---|---|
| Employer registration | `/employers` (what happens), `/employers/register` (the existing registration and e-mail confirmation), `/employer` dashboard. No new enumeration surface |
| Organisation verification | Claims (`/employer/claim`), staff decisions on the staff site (method and evidence recorded, never self-decided), revocation by an Administrator, membership revocation |
| Company profiles | Moderated revisions (owners only), staff approval by a different person, public page `/employers/<slug>` only for verified organisations with an approved profile, link from the listing page |
| Moderated job posting | Jobs, internships and graduate programmes through the **existing publishing service**: draft, edit, submit, discard, reopen after rejection, amend a published listing. Staff approve and publish |
| Employer dashboard | Claims, organisations with role and verification, listings with status in words, editors' reasons, next actions |
| Basic listing analytics | Views and apply-link clicks per listing and day (aggregates, no identifiers), 7 and 30 day windows and totals, saves as a number; the dashboard says counts are approximate |

Plan and threat analysis: `docs/phase6a/PHASE6A_PLAN.md`; decision D-35; ADR-0022 (drafts); editorial handbook section for staff.

## 2. How the invariants are kept

- **No staff role, no admin access.** Employers hold no role assignment; `User.is_staff` is unchanged; the registry still has exactly three roles (tests). The employer path in the publishing service grants only `opp.draft.create, opp.draft.edit_own, opp.submit, opp.discard_own, opp.amend`, only for listings bound to an organisation the actor is an **active member** of and that is **verified**, re-read under the listing lock on every call (a revoked member is refused even when calling the service directly: tests mutate the guard and fail).
- **Review, verification and publication are staff-only**; D-18/D-22 and the PostgreSQL triggers are unchanged. The employer cannot approve or publish (tests call every review function as an employer).
- **The organisation is fixed** by the membership; a request naming another organisation is ignored (API) or refused (service). `sources` is rejected: each submission records one automatic source "Submitted by the employer through the NextJob employer portal" dated today, and the listing starts *not verified* (D-14: a verified organisation does not verify a listing).
- **Object-level access.** Every employer endpoint resolves ids through the caller's memberships; someone else's id answers 404 exactly like a missing one (tests across ten operations).
- **Claims and profiles**: a decider must differ from the claimant or submitter (audited when refused); rejections need reasons; verification needs a method and evidence note.
- **Account deletion** ends memberships, withdraws waiting claims and scrubs claim text.
- **Audit**: every transition writes an audit event; refusals write a security event.

## 3. Checks actually run

| Check | Result |
|---|---|
| Backend `ruff check`, `ruff format --check`, `mypy` (171 files), `makemigrations --check`, `spectacular --validate --fail-on-warn` | pass |
| Backend `pytest` (UPNEXT_DEMO_TOOLS unset) | **590 passed**, coverage 94.03% (threshold 85%) |
| Web `lint`, `typecheck`, `format:check`, `tokens:check`, `build` | pass |
| Web unit tests (Vitest) | **103 passed** |
| Docs check and traceability regeneration (46 requirements, 209 tests) | pass |
| Production-mode stack, employer journey (`employer-journey.spec.ts`: public pages, register, confirm, claim, staff verification, profile approval, post, review, publish, counters, reject and reopen, access checks, axe at 320/390/768/1440 and no horizontal scroll) | **7 passed** |
| Production-mode stack, whole Playwright run | 142 passed, 5 skipped by design, 2 failed. **The two failures were my own earlier failed local runs leaving three published test listings behind** (15 listings instead of 12). After withdrawing them and adding a clean-up hook that runs even when the journey fails, the journey and the opportunities spec both passed together |
| Local TLS rehearsal, `detect-secrets` over the full history | **not run locally** (CI runs both) |
| GitHub Actions | see section 6 |

## 4. Decisions and open points for the owner

1. **D-15 public organisation pages.** The company profile page is public for verified organisations with an approved profile. Confirm, or limit to the listing page.
2. **No earlier Phase 6A plan existed in the repository**, so the scope here is the instruction's own list. Say if anything differs from what was approved before.
3. Verification methods and evidence standards are editorial policy; the five methods are a starting point.
4. Analytics: aggregates are kept indefinitely; the privacy draft and data inventory say so and are not legal approval. The earlier "no analytics" wording (P4-04) is amended to "no analytics service or identifiers".
5. Not built: team invitations, employer-side withdrawal of a published listing, uploads (logos), employer notifications by e-mail (status is on the dashboard), employer bulk import, employer-side searching of applicants (the portal never receives applications).

## 5. Limitations and risks

- The counters are approximate and unauthenticated by design: repeat and scripted visits are counted; per-IP throttling limits inflation but does not prevent it.
- Employer-facing e-mail does not exist, so employers must visit the dashboard to see decisions.
- Claim approval depends on staff doing a real external check; the software records that it was done, it cannot do it.
- One person can hold several roles; a reviewer who is also a member of an organisation cannot verify it, but nothing stops two colluding staff.
- The browser journey uses fictional demo staff through a demo-only management command (refused without `UPNEXT_DEMO_TOOLS`, which production refuses at start-up).
- Account page does not yet show an "employer" entry beyond the footer link and the dashboard URL.

## 6. Final CI

(recorded after the final push)
