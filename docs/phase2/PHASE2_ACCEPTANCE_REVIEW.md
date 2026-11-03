# Phase 2 acceptance review

Status: DRAFT (awaiting owner review). Phase 3 has **not** been started.

Scope: the owner's "Phase 2 acceptance review" instruction. Accepted baseline: commit `b9550fe`, CI run 39026829386. Everything below was run on a local Docker Compose stack with fictional demo data and fictional staff accounts (`*@demo.upnext.example`) using a throwaway password. No real staff credentials, production data, VPS, deployment or The Granite Post were touched.

## 1. Product decision status (P2-01 … P2-10)

The owner directed that all ten defaults stay **provisional for MVP development**. None is marked permanently approved; the register (`docs/governance/DECISION_REGISTER.md`, section "Owner direction on P2-01…P2-10") records each direction and what still needs the owner.

| ID | Topic | Owner direction recorded | Status | Needs further owner input |
|---|---|---|---|---|
| P2-01 | Expired / withdrawn visibility | Expired items never in active lists or search; withdrawn never shown as active, direct URL may show a labelled notice | Provisional | Remove the API opt-ins `include_expired=true` and `deadline_state=expired`? `noindex` policy for closed pages; archive retention |
| P2-02 | Taxonomy contents | Retain | Provisional | Final locations, sectors, skills |
| P2-03 | Currencies, date-only deadlines | Keep USD and ZWG | Provisional | Other currencies; end-of-day rule |
| P2-04 | Source / URL rules | Strict HTTPS for application URLs; attributed citation-only sources allowed | Provisional | Any non-HTTPS exception; minimum attribution for citation-only sources |
| P2-05 | Scheduled publishing | Manual only; scheduling deferred | Provisional | Later, if wanted |
| P2-06 | Staff interface | Django Admin initially | Provisional | **MFA, network restriction, staff account policy** (see launch blockers) |
| P2-07 | Category schemas | Retain, subject to validation | Provisional | Final field lists |
| P2-08 | Verification policy | Distinguish source-checked from issuer-verified | Provisional | Final policy, re-verification period |
| P2-09 | Duplicate rules | Retain, subject to validation | Provisional | Block or acknowledge hard duplicates |
| P2-10 | Markdown renderer | Retain, subject to security testing | Provisional | Approval after section 5 |

Implemented from the direction: the public UI now keeps "Source checked" neutral and uses the green tone only for "Verified with the issuer" (finding V2). Expired and withdrawn listings were already absent from default lists and search (checked in the browser tests and in the screenshots below).

## 2. Public design review

**Method.** Compose stack (dev target, then the production-mode override), `seed_demo` data, Chromium via Playwright (`tools/review/capture-screenshots.mjs`). 56 screenshots (14 pages × 320/390/768/1440 px) are in `docs/phase2/acceptance/screenshots/`. They were taken **after** the fixes below; the "before" state was inspected the same way before fixing. I opened the screenshots listed under "Inspected" and did not individually open the other widths of the same pages.

Inspected after the fixes: list at 320, 390, 768, 1440; empty list (1440); invalid filter (390); job detail (1440); no-deadline citation-only job (320); tender (390); withdrawn (390). Inspected before the fixes: list (1440/768/390), job detail (1440/390), withdrawn, expired and invalid filter. Not individually opened: home, not-found (beyond the broken-slug case seen by accident), scholarship, expired after the fix, and page 2 at every width.

The grey square at the bottom-left (top-left on the not-found shot) of the screenshots is the Next.js development-mode indicator from the dev stack. It does not exist in the production build.

**Findings and what was done**

| # | Finding | Result |
|---|---|---|
| V1 | Footer still said "Application foundation (Phase 1)" | Fixed |
| V2 | Source-checked and issuer-verified shared the same green tone | Fixed: only "Verified with the issuer" is green; unit test added |
| V3 | Below 768 px the filters sat after all results | Fixed: filters first, two-column compact layout, no duplicate form controls |
| V4 | "View details" wrapped on 390 px | Fixed |
| V5 | "How to apply" was at the bottom of long mobile detail pages | Fixed: an in-page "How to apply" link under the summary on small screens |
| V6 | Withdrawn / closed notice was a weak grey strip | Fixed: bordered, labelled banner in the content area ("Withdrawn by the issuer", "Closed") |
| V7 | Invalid filter showed a developer message | Fixed: plain wording plus a "Clear filters" link |
| V8 | Lowercase enum-like detail values ("individual"); language codes | Fixed: capitalised; `en` / `sn` / `nd` read English / Shona / Ndebele |
| V9 | Category tabs scroll horizontally on mobile and clip a label | Accepted for now (still reachable; scrolling tabs are standard). Deferred |
| V10 | Tender fee renders as nested "Amount: 20.00 / Currency: USD" | Deferred (readable, not wrong) |
| V11 | At 320 px the select text "Any arrangement" is cut off | Deferred (minor) |

Other observations, no action needed: Arial, blue accent, square corners, thin borders and no shadows, gradients or glass are intact; deadlines appear as a chip in each row and in "Key facts"; each result names its source; the apply link states that it leaves UPNEXT and shows the target domain; the empty state is clear. Keyboard behaviour and axe checks are covered by the existing Playwright suite, which passes (section 7). I did not do a separate manual keyboard walk-through; the e2e tests cover focus order and visible focus only for the flows they exercise.

## 3. Editorial CMS browser review (`/staff/`)

A new serial Playwright journey (`apps/web/tests/e2e/cms-journey.spec.ts`, gated by `E2E_CMS=1`) drives the real staff site as fictional contributor, editor, second editor and administrator. **All 8 tests pass** on the dev stack and on the production-mode stack. Screenshots: `docs/phase2/acceptance/cms-screenshots/` (28 full-page captures, including a 390 px mobile view).

Journey covered: contributor creates a draft, fills it in and saves → submits for review (the revision freezes) → the contributor's own listing offers no approve action and a forged self-approval URL is refused with a message → an independent editor approves (incomplete checklist is refused first with field errors) → a stale reject form from a second editor is refused → the author publishes → the page is public → amend, re-approve by a different person and re-publish → withdraw, after which the public list drops the listing and the direct URL shows the labelled notice → the administrator sees the audit events → mobile view of the listing pages.

**Defects found and fixed during this review**

| Defect | Severity | Fix |
|---|---|---|
| `/staff/login/` returned **500 in the production image** (`collectstatic` ran with dev settings, so no static manifest) | High; found by running the production-mode stack | Dockerfile runs `collectstatic` with production settings; new e2e test |
| Opening a frozen (in-review / approved / published) revision page returned **500** for roles that may see it | High | Read-only fieldsets and form guards; regression test |
| Listing pages were headed by a UUID and "Opportunitys"; history showed UUIDs, "T03" and "in_review"; category selects showed codes | Medium (clarity) | Titles, "listing(s)", display names, plain-language "What happened" column, category names |
| Duplicate-detection error did not say which listing it matched | Medium | The message names the listing, its id and the reason |
| Staff queue ran 2 extra queries per row (60 queries for a page of 25) | Medium | Select-related fix: 10 queries; regression test |
| Staff pages were indexable by crawlers; sessions had the default length | Low–medium | `X-Robots-Tag: noindex, nofollow` on `/staff/`, `/api/`, `/health/`; 8-hour staff session limit; tests |

**Role separation, negative cases and audit.** Self-approval, approval by the author of a submission, a stale form after another person acted, an incomplete checklist and a publish before approval are all refused with readable messages, and the refusals are audited as security events (`tests/test_workflow*`, `tests/test_admin.py` and the journey). Every transition appears in the history and in the audit list. A missing item: the audit event list shows raw action codes, object ids and no actor column in the list view (the change view has detail). Not blocking; deferred.

**Mobile.** The staff site is usable at 390 px but wide tables (history, revision preview) are clipped at the right edge and need horizontal scroll or wrapping. Deferred; staff work is expected on desktop.

## 4. Performance

**Method.** A scratch database (`upnext_perf`, cloned from the dev database, then deleted) was loaded with about **17,000 published listings** (cloned from the demo rows with randomised publication dates, deadlines and titles) using SQL. The real API and admin code were run against it with the Django test client, counting queries and reading `EXPLAIN (ANALYZE, BUFFERS)` plans. This is a single-user timing on a shared sandbox, not a load test.

| Request (17k listings) | Time | Queries |
|---|---|---|
| list, default sort | ~140 ms | 12 |
| list, `limit=50` | ~145 ms | 12 (same, so no N+1) |
| list, `category=jobs` | ~45 ms | 12 |
| list, location + employment type | ~90 ms | 13 |
| search `q=engineer` (and `sort=relevance`) | ~110–120 ms | 13 |
| list, `sort=closing_soon` | ~130 ms | 12 |
| `deadline_state=closing_soon` | ~38 ms | 12 |
| detail | ~14 ms | 12 |

* **No N+1** in the public API: the query count is constant as the page size grows. About 7 of the 12 queries per request are the database-backed throttle cache (see below).
* **Planner behaviour (deferred, not blocking).** The default list and the closing-soon list join all ~17k published rows and then do a top-N sort (about 95 ms inside PostgreSQL), because the sort key `first_published_at` lives on the listing table while the partial index `ver_published_idx` is on the version table. The hash join on `(opportunity_id, live_version_id)` is estimated at 1 row, so the planner picks a poor plan. This is linear in the number of live listings: fine for an MVP of hundreds to a few thousand, noticeable beyond about 20–50k. Options for later: store the sort key on the version row, or an index on the listing table with a different join shape. I did not change it, because that is a schema decision.
* Full-text search uses the GIN index; filters use the partial indexes; the detail lookup uses the unique slug index; the count query costs 19–26 ms at this size.
* **Throttle cache writes.** The public API throttle uses the database cache, so every public read issues a read, an update and a `COUNT(*)` on `django_cache`. ADR-0004 defers Redis; acceptable for MVP but a scaling item.
* **Staff queue:** the N+1 above was found and fixed (60 → 10 queries per page of 25). Audit list: 10 queries.
* No missing index was found for the queries exercised.

## 5. Security review

| Area | Result |
|---|---|
| Markdown | A live probe (script tags, `javascript:` and `data:` links, protocol-relative links, images, event-handler attributes, entity tricks) was escaped or left as text; allowed links get `rel="noopener noreferrer nofollow ugc"` and `target="_blank"`. The test corpus (`test_catalog_units.py`) and the frontend `SafeHtml` allow-list renderer (no `dangerouslySetInnerHTML`) cover the same classes. Images are not rendered. |
| External application links | Only `https` is stored and now also only `https` is rendered (defence in depth added in the web app); the domain is shown and the page says that it leaves UPNEXT. |
| Sources | Citation-only sources render as text; source URLs are links to the domain with the same `rel`; no server-side fetching. |
| Headers | Public pages: CSP with nonce, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy (the dev server's CSP has `unsafe-eval`, which Next.js adds only in development; the production-mode e2e run with strict console checks passes). `/staff/`: no-store, noindex, `X-Frame-Options`. |
| Staff access | Role-scoped queues, server-side action checks, throttled login (existing test), role changes audited, security audit of refusals, 8-hour session, noindex. |
| Dependencies and secrets | Secret scan clean (26 commits); `pip-audit` and `npm audit` run in CI. |

**Not verified locally:** secure-cookie flags and HSTS in the real HTTPS front (the local stack is HTTP; the settings mark session and CSRF cookies Secure when `UPNEXT_SECURE_COOKIES` is on, but I did not observe that over TLS). HSTS is off by default (`DJANGO_HSTS_SECONDS=0`) and must be set deliberately at deployment.

## 6. Launch blockers and deferred items

**Launch blockers (before any real publication or staff accounts):**

1. **Staff MFA and an access policy** (P2-06, owner input needed). Staff can publish public content with a password only. Required: MFA or a network restriction, and a policy for who gets accounts.
2. **No Content-Security-Policy on `/staff/` (Django Admin).** Recommend a tested CSP in Nginx or middleware before staff use it with real data.
3. **Owner approval of the provisional defaults** that affect public content: P2-01 (including removal of the expired opt-in), P2-04, P2-07 (final field lists), P2-08, P2-09 and P2-10.
4. **Deployment hardening not exercised here:** TLS cookie and HSTS verification, backups and the production environment are outside Phase 2 and were not touched.

**Deferred improvements:** V9–V11; listing-sort query shape beyond ~20–50k live listings; DB-backed throttle writes; audit list readability and staff table wrapping on mobile; a manual keyboard and screen-reader pass; load testing.

## 7. Corrections and changed files

Commits on `claude/new-session-t9v0fd` after `b9550fe`:

1. `841a827` staff pages 500 in the production image (`apps/api/Dockerfile`), noindex and staff sessions (`core/middleware.py`, `config/settings/base.py`), demo password override (`seed_demo.py`), e2e test (`foundation.spec.ts`), review tooling and the first 56 screenshots.
2. `3e697ae` editorial CMS fixes: `opportunities/admin.py`, `models.py` (+ migration `0003_listing_verbose_names.py`, options only), `duplicates.py`, `workflow.py`, `catalog/models.py`, `tests/test_admin.py`, the CMS journey and its screenshots.
3. `3326e87` public design fixes: `apps/web/src/app/opportunities/page.tsx`, `[slug]/page.tsx`, `components/opportunities/parts.tsx`, `components/ui/listing-row.tsx`, `lib/format.ts`, `components/layout/site-footer.tsx`, a unit test, and the refreshed screenshots.
4. `d6dd955` staff queue N+1 fix and regression test; owner direction in `DECISION_REGISTER.md`.
5. `a274694` CI runs the CMS journey (separate final step) with a throwaway demo password.

No unrelated redesign or new features were added. The one schema-level change is a migration that only sets model display names.

## 8. Test evidence

Executed in this session (local, before the final push):

| Check | Result |
|---|---|
| Backend `ruff check`, `ruff format --check`, `mypy` | pass (90 files) |
| `makemigrations --check` | no changes |
| Backend `pytest` (`config.settings.test`, full suite, after the last edit) | 273 passed; coverage 95.1% (threshold 85%) |
| `spectacular --validate --fail-on-warn` | pass |
| Web `lint`, `typecheck`, `format:check`, `tokens:check` | pass |
| Web unit tests (Vitest) | 46 passed |
| Web `build` | pass |
| Playwright, dev stack | 60 passed, 1 failed at the time (`/health/ready` was correctly 503 because the new migration was not applied; fixed by migrating) |
| Playwright, production-mode stack, `E2E_STRICT_CONSOLE=1 E2E_DEMO_DATA=1` | 61 passed, 8 skipped (the CMS journey is gated) |
| CMS journey (`E2E_CMS=1`), dev and production-mode stacks | 8 passed on each |
| Docs check, traceability generator, secret scan | pass; traceability unchanged |

CI: the baseline accepted run is https://github.com/Zentrik25/Upnext-Zimbabwe/actions/runs/39026829386 (success on `b9550fe`). The run for the final commits is recorded in the hand-off message, not here, to avoid a document that references its own run.

## 9. Phase 3 readiness recommendation

**Recommendation: technically ready, with conditions.** The Phase 2 flows work end to end in a real browser, the two high-severity staff-site defects found by this review are fixed and covered by tests, and the public pages meet the design and accessibility rules at 320–1440 px. I recommend that Phase 3 starts only after the owner (a) decides the staff MFA/access policy (blocker 1), (b) accepts or changes the provisional defaults listed above, and (c) confirms the CSP for `/staff/` is to be handled before staff use real data. Phase 3 is **not** begun; I am waiting for written approval.
