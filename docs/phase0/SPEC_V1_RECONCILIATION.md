# Spec v1.0 (17 Oct 2026) — reconciliation with the design pack and Phase 0 proposal

**Status: DRAFT — analysis only.** The v1.0 spec is "pending final approval", so it is treated as a requirements input, not as binding. Where it conflicts with `reference/approved-flat.html` or a CONFIRMED decision, the reference/register wins until you decide otherwise. No code is authorised.

## A. What the spec closes or strengthens

| Topic | Effect |
|---|---|
| Verification levels (§15) | Defines three levels: source provided / source checked / verified directly with issuer. Closes the "employer_verified" naming gap (C3). |
| Editorial states (§15) | Adds `rejected` and `withdrawn`; keeps `approved` and `published` as separate steps (supports C7/scheduling). |
| Account states (§7) | Five states defined: pending verification, active, restricted, suspended, deactivated. Previously unspecified. |
| Email verification (§7, §25) | Listed as mandatory. This partly resolves C5, but the register still lists verification and email provider as OPEN. |
| Performance targets (§31) | LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75 — adopt as the proposed SLOs. |
| Search isolation (§11) | Search behind an internal interface — adopt (extends ADR-006). |
| Release plan (§5) | Release 1 = what the pack calls launch scope; Releases 2–5 are direction only. Employer self-service, payments, mobile apps remain outside launch. |

## B. New contradictions introduced by the spec

| # | Spec says | Pack / reference says | Recommendation |
|---|---|---|---|
| S1 | **Design tokens (§18):** accent `#176B55` (green), text `#17191C`, border `#E2E5E8`, Inter, base 14–16px, listing title 16–18px, input 40px, width 1200px | Reference's effective CSS: blue `#174c83`, ink `#18232f`, line `#dce2e8`, Arial, 13px body, title 14px, inputs 36–39px, width 1190px | The spec itself says values must come from the reference. **Reference wins**; do not adopt the green accent or Inter. Larger text sizes are an accessibility improvement but are a visual departure, so they need a design decision record (relates to the 12px floor in the proposal). |
| S2 | **Redis + Celery in the stack table (§20, §27)**, including for transactional email | docs/ARCHITECTURE and the spec's own CLAUDE.md: add "when required" | Keep the stack table as the *eventual* stack, not Phase 1 scope. Password-reset/verification email should be async to avoid timing leaks, so Redis/Celery realistically arrives **with Phase 4 (accounts)**, not before. ADR-010 revised accordingly; subject to VPS RAM inspection. |
| S3 | **S3-compatible object storage (§20)** | CV upload and file uploads are out of scope; no file feature exists at launch | Defer; no launch feature needs it (organisation logos undecided). Do not provision. |
| S4 | **Repo layout (§21, §36):** `backend/ frontend/ infrastructure/`, docs under `docs/product/ design/ engineering/ governance/ adr/` | ENGINEERING-STANDARDS: `apps/web apps/api infra/ docs/ tests/`; the pack's current docs sit at the repo root | Pick one (OPEN). Recommendation: adopt the spec's layout (newer, more explicit) and move the pack docs into `docs/` when approved. |
| S5 | **Three decision files:** `docs/governance/DECISIONS.md` + `OPEN_QUESTIONS.md` (spec) vs `governance/DECISION_REGISTER.md` ("source of truth") vs `docs/DECISIONS.md` | | Keep exactly one register. Recommendation: `DECISION_REGISTER.md` stays the source of truth, `OPEN_QUESTIONS.md` becomes a view of its OPEN section, `docs/DECISIONS.md` is retired. |
| S6 | **Module names (§21):** accounts, profiles, organisations, opportunities, taxonomies, discovery, bookmarks, publishing, verification, notifications, audit | Pack uses three variants (identity/editorial/saved…). | Adopt the spec's names — it is the latest and matches TECHNICAL_ARCHITECTURE on `bookmarks`. Supersedes ADR-002's `identity / editorial / saved`. Spec also notes modules need not be separate Django apps yet. |
| S7 | **Publish gate (§15, DOMAIN_MODEL):** only source *provenance* is required; "source provided but not independently verified" is a valid published state | My proposal §3.2 required `source_check_status = checked` to publish | Spec is right and less restrictive: gate = provenance present + permission; verification level is a *label*, never implied by publishing. Proposal updated. Whether `checked` should be mandatory is OPEN. |
| S8 | **Publishing roles (§41):** "Administrators only" as default; §15 lists create/review/publish all as administrator abilities | PRD/PRODUCT: editor, reviewer, admin; journeys require a review stage | One person could draft, approve and publish. Needs a role-permission matrix (spec itself lists this as missing) — draft in §D. Decide whether self-approval is allowed. |
| S9 | **OpportunityDetail with JSONB (§10, §23)** and "add categories without major structural change" | My ADR-004: typed child tables per category group | Revise ADR-004 to a hybrid: common `Opportunity` table with modelled, indexed, searchable fields (deadline, location, work mode, employment type, experience level, salary range, category) plus `OpportunityDetail` JSONB validated by a **versioned schema per category**. Matches ENGINEERING-STANDARDS ("explicit schema with versioning") and the extensibility requirement. |
| S10 | **API (§24):** `/opportunities/{id}/` | PR-02 and IA require stable canonical **slug** URLs | Public API and pages keyed by slug; UUID remains the internal id. Spec's endpoint list also lacks: email-verification confirm, password-reset confirm, change email/password, session list/revoke, account deletion request, CSRF bootstrap, `PUT` idempotent save, organisation detail. Add to API_CONTRACTS. |
| S11 | **For You (§12, §19)** shows useful opportunities when profile is incomplete; returns score + model version + reasons | Reference locks the feed behind a profile prompt; my proposal hides percentages | Compatible: API may return a score and `model_version`; UI shows reasons, not percentages (OPEN). Incomplete-profile behaviour is a deliberate **departure from the reference** — needs a design decision record. |
| S12 | **Skills overlap = 25% weight** | No skill taxonomy or per-listing skill data exists | Requires a normalised `Skill` taxonomy and editors tagging skills on every listing — an editorial cost. Unknown skills must score neutral. Weights (30/25/20/15/10) stay hypotheses; reference demo used 55/25/20. |
| S13 | **Hard eligibility evaluated separately (§26)** | Pack: no eligibility claims at launch | Defer entirely from Release 1 UI to avoid implied qualification statements. |
| S14 | **Public "Organisations" pages + `/api/v1/organisations/`; "Related opportunities"** | Not in the pack's IA/screens | New scope. Needs rules for organisation pages (what is public, logo policy, claim/dispute) and a related-items algorithm. OPEN. |
| S15 | **Admin navigation (§17)** includes Users, Taxonomies, System Settings, Dashboard | §19 says Django Admin first | Fine for Django Admin; note it implies staff user management and taxonomy editing within Admin. |
| S16 | **Profile (§8):** display name, country (default Zimbabwe), experience level, work arrangements, fields of study | PR-04: all fields optional; domain model has Skill/Qualification/Interest/LocationPreference | Add the new fields to the domain model; "country" collection needs justification under data minimisation. |
| S17 | **Mandatory email verification vs notifications scope (§16, §41)** | "Transactional email first" is a proposed default; provider OPEN | Registration depends on a provider and deliverability decision. This is a Phase 4 blocker; decide before Phase 4 starts. |
| S18 | **Monitoring (§33):** error tracking, metrics, backup status monitoring | Tooling unspecified | Hosted error tracking sends data off-server (privacy, residency); self-hosting costs VPS RAM. OPEN. |
| S19 | **Spec's CLAUDE.md (§Part 8)** vs the pack's existing `CLAUDE.md` | The spec's version omits the traceability-table rule, the "never invent facts/log questions", and the "documents stay DRAFT until approved" rule, and refers to different doc paths | Do not overwrite. Propose merged CLAUDE.md after S4/S5 are decided. |
| S20 | **Public pages and expired listings (§6)** "shareable and stable URLs" | No policy for expired/archived URLs | Proposal: expired listings keep their URL (200 with an "expired" banner), remain indexable for a retention period, then `noindex`; archived-unpublished → 404/410. OPEN. |
| S21 | **Sorting by relevance + stable pagination (§11)** | My proposal: cursor pagination | Cursor works for newest/closing; relevance rank needs a keyset on `(rank, id)` or capped offset. Decide in ADR-006. |
| S22 | **"Application button must never be obscured by advertising" (§19)** | No ad policy; paid placement is Release 4 | No ads at launch. Add to non-goals so it is explicit. |
| S23 | **CI/CD via GitHub Actions (§20)** | "Never deploy without explicit permission" | CI only through Phase 6; production deployment stays a manual, approved step. |

## C. Changes to the Phase 0 proposal (apply when you approve)

- ADR-002: module names → accounts, profiles, organisations, opportunities, taxonomies, discovery, bookmarks, publishing, verification, notifications, audit.
- ADR-004: hybrid model (modelled searchable fields + JSONB `OpportunityDetail` with versioned per-category schemas) instead of typed child tables.
- ADR-005: verification axis becomes `source_provided | source_checked | issuer_verified` (+ `source_unavailable` flag); publish gate = provenance + permission. Editorial states add `rejected`, `withdrawn`.
- ADR-010: expiry via management command at first; Redis/Celery introduced at Phase 4 with transactional email, subject to VPS capacity.
- New ADRs: account states; expired-URL indexing policy; skill taxonomy; error-tracking hosting.

## D. Draft role–permission matrix (OPEN — spec §closing item)

| Action | Anonymous | Seeker | Editor | Reviewer | Admin |
|---|---|---|---|---|---|
| Browse / search / view published | ✔ | ✔ | ✔ | ✔ | ✔ |
| Profile, preferences, saved (own only) | — | ✔ | — | — | — |
| Create / edit draft | — | — | ✔ | ✔ | ✔ |
| Submit for review | — | — | ✔ | ✔ | ✔ |
| Approve / reject | — | — | — | ✔ (not own draft) | ✔ |
| Publish / unpublish / expire / archive | — | — | — | ✔ | ✔ |
| Set verification level | — | — | source_provided only | source_checked | issuer_verified |
| Manage staff users, taxonomies, settings | — | — | — | — | ✔ |
| View audit log | — | — | — | own actions | ✔ |
| Suspend / restrict user accounts | — | — | — | — | ✔ |

Rule proposed: nobody approves their own submission. Whether a one-person launch team needs a waiver is your decision.

## E. New or still-open decisions (add to the register once you confirm)

1. Repo and docs layout (S4) and the single decision register (S5).
2. Adopt reference tokens over spec tokens; approve larger text sizes as a design departure (S1).
3. Role matrix and self-approval rule (S8, §D).
4. Hybrid JSONB model (S9) and skill taxonomy ownership (S12).
5. Organisation public pages and related-opportunities rules (S14).
6. Incomplete-profile For You behaviour (S11).
7. Expired-listing URL and indexing policy (S20).
8. Redis/Celery timing and email provider (S2, S17); object storage deferred (S3).
9. Error-tracking and metrics hosting (S18).
10. Inherited from the proposal: languages, analytics/consent, staff MFA, date-only deadline semantics, capacity numbers, retention periods, RPO/RTO.

## F. Remaining Phase 0 deliverables (what the spec's closing note calls for)

In order: (1) resolve §E; (2) detailed ERD with constraints and indexes; (3) field-level validation rules per category; (4) OpenAPI request/response schemas; (5) screen-by-screen interaction specs; (6) permission matrix finalised; (7) operational requirements (backup, monitoring, runbooks); (8) `DESIGN_TOKENS.md` from a visual audit; (9) traceability table. None of these start without your go-ahead.
