# Phase 5 implementation proposal — DRAFT for owner review

Status: DRAFT. Planning only, authorised after Phase 4 acceptance (verified commit `ea54d91`, CI 39065035043). **No Phase 5 code has been written.** Nothing here is approved; the open questions and defaults below are proposals. Nothing is deployed and the VPS, Traefik/Nginx and The Granite Post are not touched.

## 0. Recommendation in one paragraph

The approved roadmap defines Phase 5 as *Discovery: For You* (blocked by OQ-23). I propose a **deliberately small Phase 5: an optional, minimal profile, a rules-based "For You" feed that shows plain-language reasons (no numeric score), and change of e-mail address**, all on the existing stack and design. Almost everything needed already exists: listings carry locations, sectors, skills, work mode and experience level (`OpportunityVersion`), the saved-list and public query shapes are indexed, and the OpenAPI draft already has `getProfile`, `updateProfile`, `getForYou`, `searchSkills`. I also recommend the owner treat **launch blockers B-01 to B-10 as more urgent than any feature**: with no e-mail provider, no real content and no deployment path, personalisation cannot reach a real user. Section 7 offers an alternative ordering (Hardening first) if the owner prefers.

## 1. Features and business value

| # | Feature | Value | Size |
|---|---|---|---|
| F1 | **Optional profile** (SC-08): qualification level, experience level, work arrangements, up to 6 categories, 10 sectors, 10 locations, 30 skills, 5 fields of study. Every step skippable; edit and remove any item; no field is required to browse or save | Lets the feed be useful; gives returning seekers a reason to register | M |
| F2 | **For You feed** (SC-09): ranked list of live listings with reasons ("Matches your location: Bulawayo", "Skills in common: bookkeeping"), "not compared" notes where the listing states nothing, profile-improvement hints, category and location filters, save control and deadline indicators | The retention feature the product vision promises, without claiming eligibility (D-15) | M |
| F3 | **Change of e-mail address** (R-04): confirm the new address by link, notify the old one, keep sessions, audited | Completes the account lifecycle; prevents lost accounts | S |
| F4 | **Profile in deletion and export hooks**: deletion deletes the profile; no export (OQ-09 stays open) | Privacy completeness | S |

Not value-free to skip, but unnecessary for trust: nothing else is proposed. Section 6 lists what is deferred.

## 2. Database, API and frontend changes

**Database** (one migration set in a new `profiles` app, following ERD §3.2): `profile` (1:0..1 with the user, CASCADE) and five join tables to existing taxonomies (PROTECT to taxonomy, CASCADE from profile), with the per-profile caps enforced in the serializer and by constraints where possible. Users with a staff role keep a profile like anyone, but profile tables are **not registered in Django Admin** and no staff screen reads them. Change of e-mail adds a `pending_email` token kind to the existing token store (no new table). No stored match scores or explanations (ERD §Excluded): the feed is computed per request.

**API** (all already drafted in `openapi.yaml`; additive, checked by the contract tests):
- `GET/PATCH /me/profile` (`getProfile`, `updateProfile`), `GET /discovery/for-you` (`getForYou`), `requestEmailChange` and `confirmEmailChange` (new operations to be added to the contract first).
- `searchSkills` already exists; reused by the skills picker.
- For You reuses the public `visible_versions` query, so it can only ever return listings the public list can return. Withdrawn, expired, draft and archived listings never appear.

**Matching, `rules-v1` (proposed, OQ-23 default)**: transparent, deterministic, explainable. Signals, in this order: category interest, location (or a remote listing when the profile accepts remote), sector overlap, skills overlap, experience level, work arrangement. A listing needs at least one positive signal to appear. Missing profile data never excludes a listing; a missing listing fact is reported as "not compared", never as satisfied. Order is by number and weight of matched signals, then closing date ascending (nulls last), then stable id. **No numeric score or percentage is shown** (avoids false precision and any eligibility reading). Qualification is **not** compared because listings do not carry a structured requirement; the screen says so. The weights live in one module with unit tests that assert the reason text equals the actual rule that fired (archive ACCEPTANCE: "matching explanations align with actual deterministic scoring").

**Frontend** (existing primitives only; 4px controls, flat panels, no new visual language):
- `/profile` onboarding and edit, one short step per screen on mobile, "Skip" always available, review step before save. Taxonomy pickers use native `select`/checkbox groups (no heavy widget library) so the page stays light on slow connections.
- `/for-you` list reusing `ListingRow`, with a reasons line and a quiet "How this works" note linking to About.
- Header: "For you" link for signed-in people; signed-out visitors see the same public list, no lock panel (OQ-23 departure from the reference, as already documented).
- `/account`: "Change e-mail address" panel.
- Page weight budget: For You first page under 60 KiB of JSON at 12 items, the same budget as the public list today (about 17 KiB).

## 3. Dependencies on unresolved launch blockers

| Blocker | Effect on Phase 5 |
|---|---|
| **OQ-23** match display, weights, incomplete profile | **Must be decided before F2 starts**; F1 and F3 can start without it. The proposal above is the default if the owner agrees |
| OQ-21 taxonomy contents, OQ-06 category schemas | F1 pickers use the Phase 2 starter taxonomies; real vocabularies should be approved before real content is entered (B-09). Matching quality depends on editors filling sectors and skills |
| B-01 e-mail provider (OQ-03) | F3 cannot be exercised for real; tested with the file/stub adapters only |
| B-02 legal review, operator identity (OQ-09) | A profile is richer personal data than an account. **The privacy page must be updated and legally reviewed before profiles are collected from real people** |
| B-09 real content and editorial staffing | With only demo data the feed cannot be judged. Quality review needs a real corpus |
| B-04, B-07, B-08 domain, backups, deployment | Not Phase 5 work; they gate any launch (Phases 6 and 7) |

## 4. Security and privacy

- **Data minimisation:** only the fields listed. No date of birth, gender, ID number, disability, nationality-based or other sensitive attributes, no free-text CV, no uploads (D-15).
- **Purpose limitation:** the profile is used only to order the signed-in person's own feed. No sharing with organisations or employers, no analytics, no e-mail marketing, no use for decisions about people.
- **No eligibility claims:** wording reviewed against the "relevance, not eligibility" rule; a test fails if banned phrases ("you qualify", "eligible", "guaranteed") appear in reason text.
- **Access control:** `/me/profile` and For You are session-authenticated and CSRF-protected; there is no endpoint that reads another person's profile; the staff site cannot show profiles. Throttles on profile writes and For You.
- **Deletion and retention:** the deletion executor removes the profile and joins; a test asserts no profile rows remain and no profile data appears in the outbox or audit payloads. Audit events record that a profile changed, never its contents.
- **Change of e-mail:** requires the current password; the link goes to the new address; the old address gets a notice; the change is audited; the token is single-use and hashed like the others; staff accounts follow the existing two-step rules; the uniform-answer rule applies so that the request does not reveal whether the new address is registered.
- **Editorial separation of duties is untouched:** Phase 5 adds no editorial transition, no admin shortcut and no way to publish or verify; the feed reads only published versions.
- **Privacy notice:** the draft `/privacy` text must be extended for profiles. It stays a draft and claims no legal approval.

## 5. Milestones, automated tests and acceptance criteria

| M | Content | Automated tests | Acceptance |
|---|---|---|---|
| M5.0 | Decisions D-30 (OQ-23 defaults) and docs: contract additions, ERD, privacy draft delta, ADR-0021, traceability rows | docs check, traceability generator, contract validation | Owner approves or changes the `rules-v1` defaults in writing |
| M5.1 | `profiles` app, migrations, `GET/PATCH /me/profile`, caps, deletion hook | model and API tests (caps, partial update, null clears, other-user isolation, anonymous 401, CSRF), deletion test, OpenAPI contract tests, query-count test | A user can create, edit and fully remove a profile; deletion leaves nothing |
| M5.2 | `rules-v1` engine and `GET /discovery/for-you` | unit tests per rule and per reason string, "unknown is never satisfied", determinism and cursor stability, only-public-listings invariant (draft, withdrawn, expired, archived excluded), empty and incomplete profile cases, query-count constant as saved/profile size grows, perf at 24,012 listings with target under 100 ms server time for a page | Reasons always match the rule that fired; no numeric score; useful result for an empty profile (falls back to the public newest list with the hint) |
| M5.3 | Web: `/profile` onboarding and `/for-you`, header and account links | Vitest component tests; Playwright journeys (register, skip, partial profile, full profile, edit, remove, For You, save from feed); axe at 320/390/768/1440; no horizontal scroll; control-radius and flat-design guards stay green; keyboard-only flow | Whole journey works on a 320px phone; axe clean; every step skippable; 4px controls, no new visual patterns |
| M5.4 | Change of e-mail (API, outbox templates, account panel) | token tests (single use, expiry, wrong password, address taken answered uniformly), outbox and notice tests, audit test, browser journey with the file adapter | Address changes only after the new address confirms; old address notified; sessions kept |
| M5.5 | Close-out: security review, privacy delta, report | all Phase 4 gates plus new suites, production-mode stack e2e with `E2E_STRICT_CONSOLE=1`, secret scan, GitHub Actions green, a Phase 5 report under `docs/phase5/` | Full evidence in the report; limitations and failures recorded; stop for review |

Gates carried forward unchanged: ruff, format, mypy, `makemigrations --check`, `spectacular --validate --fail-on-warn`, pytest with the 85% coverage floor, web lint, typecheck, format, tokens check, unit tests, build, Playwright on the production-mode stack, traceability with no diff, secret scan.

## 6. Deferred until after MVP launch

Alerts and saved searches by e-mail (OQ-24, needs a working provider and consent design) · numeric match scores or ML/AI matching · recommendation of "related" listings (D-15) · CV or document upload and object storage · applications tracked inside UPNEXT · employer accounts, self-service posting and payments · public organisation pages · Shona/Ndebele (needs owner-supplied translations) · analytics and the outbound-click KPI (OQ-19) · data export (OQ-09) · WebAuthn and passkeys · social sign-in · Redis/Celery (ADR-0004) · push notifications and a mobile app. Reconsider each only with real usage data.

## 7. Alternative ordering the owner may prefer

If the owner wants the shortest path to a trustworthy public launch, run **Phase 6 (hardening: backups and restore rehearsal, monitoring and alert routing, load test, manual accessibility audit, staging) and the owner decisions B-01 to B-10 first**, and ship the browse-and-save product without For You. Phase 5 would then follow on real data. My view: this is lower risk, because personalisation built before real content and an e-mail provider cannot be evaluated; but the profile and For You work is small and unblocked once OQ-23 is answered, so both orders are sound.

## 8. Decisions requested

1. Approve Phase 5 scope F1 to F4 as above (or the alternative ordering in §7).
2. OQ-23: reasons only, no numeric score; the signal list and order; fallback to the newest list for an empty profile; qualification not compared.
3. Profile field set and caps (confirm nothing more sensitive is wanted).
4. Confirm change of e-mail address is wanted at launch.
5. Confirm that profile collection waits for the reviewed privacy text (B-02).

No implementation starts until this proposal is reviewed and approved in writing.
