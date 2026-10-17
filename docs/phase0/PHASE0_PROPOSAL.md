# UPNEXT — Phase 0 proposal

**Status: DRAFT — a proposal, not an approval.** No application code, infrastructure or deployment is included or implied. Nothing here changes a CONFIRMED decision. Items marked **OPEN** need an owner decision (see §9).

**Repository inspection:** the repository was empty (no commits, no files) when the design pack was added. There is no existing code, CI, or infrastructure to reconcile. The VPS, Traefik and Nginx configuration cannot be inspected from this environment, so every statement about them is an unverified assumption (§7).

> **Superseded in part (2026-10-17).** This was the first Phase 0 proposal. After the owner approved decisions D-08…D-17 the authoritative documents are in `docs/engineering/`, `docs/design/`, `docs/adr/` and `docs/governance/` — start from `PHASE0_REVIEW_PACKAGE.md`. Superseded here: the module names and ADR table (§8), the data model (§3.3 typed tables → hybrid, ADR-0005), lifecycle and verification axes (§3.2), the 12 px text-floor and muted-colour proposals (withdrawn, now OQ-25), Redis/Celery timing (ADR-0004), roles (ADR-0002), and the capacity table (still assumptions, OQ-11). Kept for history; where documents differ, the newer ones win.

---

## 1. Document gap analysis

| # | Gap | Why it matters | Proposed fix |
|---|---|---|---|
| G1 | No `DESIGN_TOKENS.md` (promised in DESIGN_SYSTEM) | Design must not invent a palette/font | Extract from the reference (§2.3) |
| G2 | No requirement → screen → API → test traceability table (CLAUDE.md rule 3) | Required before implementation | Seed table in §6 |
| G3 | No glossary: "verified", "source checked", "published", "approved" are used inconsistently | Legal/trust risk (see C3) | Glossary in §2.1 |
| G4 | No numeric SLOs, KPIs or capacity numbers | Test strategy cannot define pass/fail | Labelled assumptions in §5 for owner to confirm |
| G5 | Category-specific fields for scholarship / tender / grant undefined | Domain model cannot be finalised | Candidate field sets in §3.3, all OPEN |
| G6 | No content policy: corrections, takedown, expired-source handling, link-rot checks, duplicate rules | Core to the "reliable listings" promise | Add `CONTENT_POLICY.md` (OPEN) |
| G7 | No languages decision (English only? Shona / Ndebele?) | Affects IA, schema, SEO | OPEN |
| G8 | No analytics / cookie / consent decision; "source-link click-through" KPI needs outbound click measurement | Privacy and SEO | OPEN; see C9 |
| G9 | No error/response envelope, pagination style, idempotency or auth/CSRF strategy (API_CONTRACTS is outline only) | Blocks OpenAPI | Proposed in §3.4 |
| G10 | No data retention / deletion rules (accounts, audit events, revisions, saved items) | Deletion vs audit conflict | OPEN; see C8 |
| G11 | No low-bandwidth / performance budget although Persona 1 has limited bandwidth | Affects Next.js rendering and asset policy | Proposed budgets in §5 |
| G12 | No email provider / notification decision, yet reference shows an alerts widget | Out-of-scope UI could ship by accident | See C6 |
| G13 | Editorial UI: "Django Admin or separate admin routes" undecided | Affects RBAC, audit, effort | Recommend Django Admin first (ADR-007) |
| G14 | No environments / branching / release process document | Needed at Phase 1 | Defer to Phase 1 ADR |
| G15 | No backup/restore targets (RPO/RTO) | Quality gate requires a restore rehearsal | Assumptions in §5 |

## 2. Contradictions and inconsistencies

### 2.1 Between documents

| # | Finding | Proposed resolution |
|---|---|---|
| C1 | Two overlapping doc sets (`product/ design/ engineering/ governance/` vs `docs/`). Module names differ: `organizations / publishing / saved` (docs/) vs `organisations / editorial / bookmarks` (TECHNICAL_ARCHITECTURE). Domain model says `SavedOpportunity`. | Adopt one set: `organisations`, `editorial`, `saved` (spelling follows Zimbabwean/British English used in the pack; model `SavedOpportunity`). Mark `docs/` as superseded reference once approved. |
| C2 | Roadmaps use different numbering: D0–D3 + Build 1–7 (governance) vs Phase 0–7 (docs/). Phase 1 in docs/ includes "authentication primitives" while accounts are Phase 4. | Treat Phase 0 = D0–D3; Build N = Phase N. Clarify Phase 1 = auth *library wiring and settings only*, no user-facing flows. |
| C3 | "Verified" is overloaded. Reference says "source check is not employer verification"; PRD has `verification_status`; ACCEPTANCE says "unverified listings never shown as verified". | Glossary: **source_checked** (editor confirmed the source URL and date checked), **employer_verified** (organisation identity confirmed — OPEN, not launch scope), **published** (visible). UI must never say "verified" for source_checked. Three independent fields (see §3.2). |
| C4 | PRD: "Publishing authority remains OPEN". PRODUCT.md already says Reviewer/admin publishes. DECISION_REGISTER treats "admin only vs employer submissions" as OPEN. | Two separate questions: (a) internal roles — propose editor drafts, reviewer/admin publishes (assumed by every doc, ask to confirm); (b) employer submissions — remains OPEN and **out of launch scope** per PRD. |
| C5 | PR-03 says "verify as approved"; ENGINEERING-STANDARDS mandates email verification; DECISION_REGISTER lists verification and provider as OPEN. | Keep OPEN. Phase 4 cannot start until decided. Interim design assumption: email verification required before saving/feed (no value claimed). |
| C6 | PRODUCT.md gives seekers "alert preferences", reference shows an alerts form, TECHNICAL_ARCHITECTURE lists notifications as "future". | Alerts are **not** launch scope until the notification decision is made; remove alerts UI from the screen spec (deviation from reference needs a design decision record — see §2.2). |
| C7 | Lifecycle: PRD "Draft → review → approved/published → expired/archived" — is *approved* distinct from *published* (scheduling, Persona 5)? ENGINEERING-STANDARDS: "never conflate publication with verification". | Propose states in §3.2 with scheduling as `approved` + `publish_at`. OPEN until confirmed. |
| C8 | Account deletion (PR-03) vs audit log immutability and editorial revisions authored by users. | Retain audit events with the actor reference pseudonymised after deletion. OPEN pending retention policy and legal review. |
| C9 | KPI "source-link click-through" vs SECURITY "limit outbound redirect abuse". | Do not build an open redirector. Outbound links go directly to `application_url` (validated http/https only, `rel="noopener noreferrer nofollow"`); clicks measured by an on-page beacon event to a first-party endpoint, subject to consent decision (G8). OPEN. |
| C10 | SECURITY lists "SSRF in source ingestion" but scraping/ingestion is out of scope. | Only SSRF vector at launch is server-side link-checking, if added. Recommend **no server-side URL fetching at launch**; editors check manually. Keeps SSRF out of scope. |
| C11 | Test widths differ: DESIGN "usable at 320px", SCREEN_SPEC 390/768/1440, ACCEPTANCE 320/375/768/1440. | Standardise on 320, 390, 768, 1440 for design review and Playwright. |
| C12 | Expiry: "deadline state" and "expired" status. | Deadline state is **derived at read time** from `deadline_at` vs now; stored `expired` status is set by a scheduled management command (as docs/ARCHITECTURE suggests). Reads never depend on the command having run. |
| C13 | Granite Post "untouched" vs shared VPS and shared edge. | Capture as a hard constraint in every deployment ADR; no Granite container/config change without approval (already in CLAUDE.md). |

### 2.2 Reference HTML vs the pack (binding reference: unchanged)

I measured the final cascade of `reference/approved-flat.html` (the later "strict flat editorial UI" block overrides the first). Findings:

1. **Effective tokens** (see §2.3) differ from the first `:root` block; the later block wins. Font is **Arial/Helvetica**, not Inter.
2. **Corner radius is forced to 0** via `!important` on listed selectors, but `.btn`, `.pill`, `.field`, `.modal`, etc. are covered; any new component must be added to the zero-radius rule explicitly.
3. **Modal shadow** (`box-shadow: 0 20px 70px`) exists in the base block and is cancelled by the override. Production must not reproduce it.
4. **Control heights** in the effective CSS: buttons 33px, search controls 39px, fields 36px, mobile search button 36px. DESIGN says "generally ~34–36px". Minor; propose 36px standard, 33px compact — needs sign-off.
5. **Tiny text:** eyebrow 10px, tags/metadata 11px. Readable but at the bottom edge for WCAG-AA practice on low-end phones; propose a 12px floor for body-supporting text — **deviation needing a design decision record**.
6. **Reference features outside launch scope:** "For employers" nav, alerts form, "% preference match" scores, "Apply unavailable" panel. Employer nav conflicts with PRD exclusions; numeric % can read as eligibility, conflicting with "relevance estimates, not eligibility guarantees". Propose replacing % with explicit matched-factor labels (e.g. "Matches: Engineering, Harare"). OPEN.
7. **Avatar initials tile** is a placeholder for organisation logos; no logo policy exists (G6).
8. **Filters conflate dimensions:** "Opportunity type" mixes work type (Full-time, Remote), programme (Graduate programme, Internship) and funding/procurement. Production needs separate `category`, `work_mode` and `employment_type` filters.
9. **Reference scoring** (interest 55 / qualification 25 / location 20) is demo logic, not a requirement. Matching weights are OPEN.
10. **Demo-only code to discard:** localStorage accounts, fake alerts, `confirm()` dialogs, fictional data. Not to be copied (docs/DESIGN).

### 2.3 Measured design tokens (proposal for `DESIGN_TOKENS.md`)

| Token | Value | Source / note |
|---|---|---|
| ink | `#18232f` | effective override |
| muted | `#687481` | effective override |
| line | `#dce2e8` | effective override |
| primary blue | `#174c83` (hover `#103b69`) | effective override |
| green (good) | `#176345` on `#f1f6f3` | effective override |
| urgent | `#8d542c` on `#fff7f0` | effective override |
| surface pale | `#f7f8f9` / `#f8f9fa` | override |
| focus | `outline: 2px solid #6886cb; offset 2px` | base block |
| font | Arial, Helvetica, sans-serif; body 13px / 1.55 | override |
| container | max 1190px, gutter 24px (14px ≤650px) | |
| radius / shadow | 0 / none | override |
| layout | 190px · fluid · 215px; 175px two-column ≤990px; single ≤650px | |

Contrast checks (WCAG 2.x ratio, computed): blue on white 8.76, white on blue button 8.76, muted on white 4.77 (passes), **muted on `#f7f8f9` 4.48 (just fails AA 4.5 for normal text)**, green tag 6.61, urgent tag 5.77. Action: darken `muted` slightly when used on pale surfaces; to be confirmed in the visual audit.

## 3. Architecture and domain proposal

### 3.1 System shape (CONFIRMED stack, proposed details)

- **Monorepo:** `apps/web` (Next.js App Router, TypeScript, Tailwind), `apps/api` (Django + DRF), `infra/`, `docs/`, `tests/`.
- **Django modules:** `identity`, `profiles`, `organisations`, `opportunities`, `editorial`, `discovery`, `saved`, `audit` (+ `notifications` placeholder, empty until approved). Cross-module access via service functions only; no cross-module ORM joins outside `discovery`'s read models.
- **Rendering:** public pages (`/`, `/opportunities`, `/opportunities/[slug]`) server-rendered with metadata, canonical URLs, sitemap, `noindex` for unpublished/account/editorial routes. Account pages client-rendered against the API.
- **Same-site cookies:** serve web and API on one registrable domain, with `/api/` routed to Django and everything else to Next.js, so session cookies are first-party and `SameSite=Lax` works with CSRF tokens. SSR fetches forward the cookie. Domain is OPEN, but this constraint should drive it.
- **Async:** none at launch. Expiry via a scheduled management command (cron on host or a one-shot Compose service). Add Redis/Celery only when alerts or similar jobs are approved.
- **Search:** PostgreSQL full-text (`tsvector` + GIN) plus b-tree indexes on status, category, deadline, location, slug. Deterministic ordering: sort key + `id` tiebreaker; keyset pagination on public listing (stable under inserts), page-number URLs only if SEO requires (OPEN).
- **Admin/editorial:** Django Admin with custom permissions and state-transition actions for launch; custom editor UI deferred (ADR-007).

### 3.2 Opportunity lifecycle (proposal, OPEN)

Three independent fields, never merged:

- `editorial_status`: `draft → in_review → approved → published → expired | archived` (`rejected` returns to `draft` with a stored reason). `approved` + `publish_at` supports scheduling.
- `source_check_status`: `unchecked | checked | source_unavailable`, with `source_checked_at`, `checked_by`.
- `deadline_state` (derived, not stored): `open | closing_soon (≤7 days) | expired | unknown`.

Publish gate (service-layer invariant, DB constraint where possible): `source_url` present, `source_check_status = checked`, actor holds publish permission, transition recorded in `AuditEvent` in the same transaction.

### 3.3 Candidate category attributes (all OPEN)

| Category | Candidate typed attributes |
|---|---|
| Job / Internship / Graduate trainee | employment type, work mode, location, minimum qualification, field, salary (nullable, never inferred), programme duration (internship/trainee) |
| Scholarship | level of study, funder, award value/coverage (nullable), eligible nationalities/countries, institution, field |
| Tender | reference number, procuring entity, procurement category, bid security/registration requirements, document URL, closing time |
| Grant | funder, funding range (nullable), eligible applicants, thematic area, reporting/co-funding conditions |

Implementation proposal: a common `Opportunity` table plus one typed child table per category group (explicit columns, constraints, per-category serializers), not a JSON blob. Duplicate detection: unique `(organisation, source_url)`, normalised-title + deadline warning at submit-for-review, final decision by a reviewer.

### 3.4 API outline additions (DRAFT)

- Base `/api/v1/`; OpenAPI generated (drf-spectacular), checked in CI, breaking-change diff gate.
- Errors: `{"error": {"code": "...", "message": "...", "fields": {...}, "request_id": "..."}}` — stable machine codes.
- Pagination: cursor for public lists with `next`/`previous`; `limit` default 20, max 50.
- Filters on `GET /opportunities`: `q`, `category`, `location`, `work_mode`, `deadline_state`, `source_checked`, `sort` (`newest|closing`), plus `unknown deadline` handled explicitly.
- Auth: session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) + CSRF header; `GET /auth/csrf`; no tokens in JS-readable storage. Registration/login/reset responses non-enumerating.
- Authorisation: object-level check on every `/me/*` query (filter by `request.user`), explicit authz regression tests.
- Idempotency: `PUT /me/saved/{opportunity_id}` (idempotent save) preferred over `POST`; `DELETE` idempotent.
- Rate limits: per-IP and per-account on auth and search; headers `Retry-After`.
- Editorial endpoints not exposed publicly at launch (Django Admin only).

### 3.5 Matching (proposal)

Deterministic, additive score from: interest/field match, qualification level comparison, location/remote fit. Weights stored in code with tests, **not** shown as a percentage. The UI shows the matched factors only; missing profile data scores neutral and never creates a negative eligibility claim. Weights OPEN.

## 4. Security threat model summary

| Threat | Launch mitigation | Test |
|---|---|---|
| Credential stuffing / brute force | Argon2 hashing, per-IP + per-account throttling, uniform errors | throttle + enumeration tests |
| Account enumeration | identical responses on register/reset/login | contract test |
| BOLA/IDOR on `/me/*` | queryset scoped to user, no id-based user param | cross-account regression suite |
| CSRF | session + CSRF token, SameSite=Lax, origin check | test with/without token |
| XSS | React escaping, no `dangerouslySetInnerHTML`; body stored as sanitised Markdown/limited HTML (allow-list) rendered server-side | payload corpus tests |
| Malicious application/source URLs | allow http/https only, store normalised, show destination domain, `rel` attrs, no redirector | validator unit tests |
| SSRF | no server-side fetching of user/editor URLs at launch (C10) | architecture rule |
| Editor privilege escalation | Django groups: `editor`, `reviewer`, `admin`; transitions authorised in services; 2-person rule optional | permission matrix tests |
| Personal data leakage | minimal profile, no PII in logs/errors, scoped serializers | log scrub + serializer tests |
| Spam / scraping | rate limits, pagination caps, robots.txt; scraping tolerated within limits | load/abuse tests |
| Supply chain / secrets | lockfiles, dependency + secret scanning in CI, secrets outside Git | CI gates |
| Granite Post impact | isolated Compose project, network, volumes, DB role; resource limits | pre-deploy checklist |

Admin hardening: MFA for staff accounts (proposal — OPEN), admin route not indexed and rate-limited.

## 5. Test strategy and capacity assumptions

**Test pyramid (follows TEST_STRATEGY / QUALITY-GATES):** unit (state machine, deadline/timezone, scoring, permissions) → integration (ORM constraints, migrations forward/back, auth, transitions) → API contract (OpenAPI diff, error shape, pagination) → Playwright E2E at 320/390/768/1440 (discovery, register, profile, save/unsave, editor publish) → accessibility (axe + manual keyboard/screen-reader) → visual comparison against the reference → security (dependency, secrets, authz) → performance baseline → restore rehearsal. Test outcomes are recorded from real runs only.

**Time handling:** all timestamps UTC in DB; deadlines carry an explicit IANA zone (default `Africa/Harare`, UTC+2, no daylight saving). Date-only deadlines (e.g. "31 March") are stored as end-of-day in that zone — OPEN.

**Capacity assumptions (labelled ASSUMPTIONS to be replaced with owner/VPS data; none are measured):**

| Item | Planning assumption | Status |
|---|---|---|
| Active published opportunities | ≤ 5,000 | ASSUMPTION |
| Registered users, year 1 | ≤ 50,000 | ASSUMPTION |
| Peak concurrent browsing users | ≤ 500 | ASSUMPTION — no claim of supporting 100k concurrent users |
| Public p75 LCP on mid-range mobile / 3G-class link | ≤ 2.5s; per-page JS budget TBD after baseline | proposed SLO |
| API p95 (list/search, warm) | ≤ 300ms | proposed SLO |
| Availability | best-effort single VPS; monthly target TBD | OPEN |
| RPO / RTO | daily DB backup + off-VPS copy; RTO ≤ 4h | proposed |
| Resource caps | Compose CPU/memory limits sized after inspecting spare capacity on the shared VPS | OPEN until inspected |

## 6. Traceability seed (requirement → screen → API → test)

| Req | Screen | API | Test (planned) |
|---|---|---|---|
| PR-01 public discovery | Home, Search | `GET /opportunities` | E2E anonymous filter + empty state |
| PR-02 detail | Opportunity detail | `GET /opportunities/{slug}` | API contract; unknown-field rendering |
| PR-03 accounts | Register/Login/Settings | `/auth/*`, account deletion | auth, throttle, enumeration, CSRF |
| PR-04 profile | Onboarding/Profile | `GET/PATCH /me/profile` | validation + BOLA |
| PR-05 personalisation | For You | `GET /me/recommendations` | scoring unit + explanation parity |
| PR-06 saved | Saved | `/me/saved` | uniqueness, cross-user access, expired item |
| PR-07 lifecycle | Editorial (Admin) | internal services/Admin | state machine + audit + unpublished not indexed |
| PR-08 search | Search | `GET /opportunities` | determinism, pagination, unknown deadlines |
| PR-09 quality | all | — | axe, keyboard, perf, monitoring |

Full row-level traceability to acceptance criteria will be maintained in `docs/governance/TRACEABILITY.md` once the OPEN items below are resolved.

## 7. Deployment and infrastructure assumptions (UNVERIFIED)

Confirmed by the owner: same VPS as The Granite Post, Traefik in front of Nginx. Not inspected: actual Traefik routers/labels, Nginx upstreams, TLS/certificate resolvers, Docker networks, free CPU/RAM/disk, ports in use, backup tooling. Phase 7 must begin with a read-only inspection and a written deployment plan, backup, and rollback; nothing touches Granite containers without approval. Proposal: separate Compose project name, dedicated networks, no host-published ports, Traefik labels only on the web/edge service after inspection.

## 8. ADR list (all PROPOSED — not accepted)

| ADR | Title | Status |
|---|---|---|
| 001 | Modular monolith with module boundaries and service-layer rule | PROPOSED (consistent with CONFIRMED) |
| 002 | Monorepo layout and naming (organisations/editorial/saved) | PROPOSED |
| 003 | Session-cookie auth, same-site routing, CSRF strategy | PROPOSED |
| 004 | Opportunity data model: common table + typed category tables | PROPOSED |
| 005 | Lifecycle: three independent status axes; derived deadline state | PROPOSED |
| 006 | Search: PostgreSQL FTS, cursor pagination; revisit dedicated engine on metrics | PROPOSED |
| 007 | Editorial UI: Django Admin first | PROPOSED |
| 008 | Deterministic matching, factor-based explanations, no percentages | PROPOSED |
| 009 | No server-side URL fetching at launch; direct outbound links; no redirector | PROPOSED |
| 010 | Expiry via scheduled management command; Celery/Redis deferred | PROPOSED |
| 011 | Outbound click measurement and analytics consent | OPEN |
| 012 | Deployment isolation on shared VPS and inspection protocol | PROPOSED |
| 013 | Timezone and date-only deadline semantics | PROPOSED |
| 014 | Data retention, deletion and audit pseudonymisation | OPEN (legal review) |

## 9. Open decisions requiring your approval

From DECISION_REGISTER (still OPEN, not defaulted): domain and brand copy; employer submissions vs internal-only publishing; email verification and provider/timing; application handoff (external-only proposed); category fields, source verification and duplicate rules; privacy/retention/legal review; VPS capacity and routing; numeric KPIs/SLOs and accessibility audit process.

New decisions this analysis surfaced:

1. Confirm internal roles: editor drafts, reviewer/admin publishes (C4).
2. Confirm the lifecycle states and `approved`-vs-`published` scheduling (C7).
3. Approve or reject removing alerts and the "For employers" nav from the launch screen spec (C6, §2.2).
4. Approve the factor-label (no percentage) matching display (§3.5).
5. Approve a 12px text floor and darker muted colour on pale surfaces (design decision record) (§2.2, §2.3).
6. Languages at launch (G7).
7. Analytics/consent and outbound click measurement (C9).
8. Staff MFA requirement (§4).
9. Date-only deadline semantics (§5).
10. Confirm or replace the capacity assumptions in §5.
11. Confirm which doc set is authoritative (C1) and the Phase numbering mapping (C2).

**Stopping here.** Phase 1 is not started and will not start without your explicit written approval of the items above.
