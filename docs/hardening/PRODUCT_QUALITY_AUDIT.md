# Product quality audit — DRAFT

Status: DRAFT, 2026-10-30. Branch `claude/upnext-careers-hardening-qojmxe`, based on `2855773` (the head of the integration branch `claude/new-session-t9v0fd`). Nothing is merged or deployed. This is the findings register for the hardening pass; the other reports in this folder refer to it by finding number (HF-nn).

**Scope honesty.** This pass read code and ran the repository's own automated checks. It did **not** run the browser suites, a real device, a screen reader, Lighthouse, a load test, the VPS, Google Cloud Console or any live service. Every area below says which of those it covers. Where the list in the hardening brief is longer than what was examined, the gap is listed under "Not examined".

## 1. Repository and branch state (Part 1, rules 1 to 5)

| Item | Finding | Evidence |
|---|---|---|
| Integration branch | `claude/new-session-t9v0fd` is at `2855773`; this branch started at the same commit | `git rev-parse` |
| Production deployment branch | **Cannot be identified: nothing is deployed** (`docs/governance/LAUNCH_BLOCKERS.md` B-08; Phase 7 not authorised) | register |
| SEO work | **Integrated.** `claude/seo-readiness` and `claude/mobile-menu` have no commits outside HEAD | `git rev-list --count HEAD..origin/<branch>` = 0 |
| UI/UX redesign | **Partly integrated.** PR #35 (`ccr-e260651c-jojraz`: categories and guides index pages, safe-area bottom navigation, compact listing rows, redesigned About, Employers, Contact and verification pages; 99 files) is **open and not merged**. It overlaps Part 2.1. This pass did not touch those files and did not audit the unmerged code | GitHub PR list |
| PRs #22 and #23 | Open, with commits not in HEAD, but their decisions D-46 and D-47 are recorded in HEAD and the direct-publication code is present. Not audited further | register, tests |
| Dependabot PRs #1, #2, #4 to #7, #10, #11 | Open. Several are **major-version jumps** (Django 5.2 to 6.1, TypeScript 5.9 to 7.0, Node 24 to 26, ESLint 9 to 10, Vitest 4 to 5). The runtime pins were verified as a set (`docs/engineering/PHASE1_VERSION_VERIFICATION.md`); none should be merged without its own CI run and owner approval | PR list |

## 2. Baseline test evidence (before any change)

| Check | Result |
|---|---|
| API: ruff, ruff format, mypy, `makemigrations --check` | all clean |
| API: pytest | **926 passed**, coverage 94.35% (gate 85%) |
| Web: ESLint, `tsc`, Prettier, `tokens:check` | all clean |
| Web: Vitest | **251 passed** (19 files) |
| `python tools/check_docs.py` | consistent (102 operations, 85 decision ids) |
| `npm ci` advisories | 0 vulnerabilities reported |

Environment differences from CI, so these results are **not** a substitute for CI: Python 3.14.6 (CI 3.14.8), PostgreSQL 16.15 (CI 18.6), Node 22.22 for the web checks (project requires 24.22; `npm ci` was run with `--no-engine-strict`).

## 3. Findings register

Priority classes are those of Part 14.

| # | Priority | Area | Finding | Status |
|---|---|---|---|---|
| HF-01 | **P1** | Lifecycle, saved | **Confirmed defect.** The saved list reported `availability: "open"` from the stored status alone. For a published listing whose deadline had been reached but which the expiry job had not yet moved, `/saved` showed "How to apply on the official site" while search, the sitemap and the detail page already treated the listing as closed. The window is one worker cycle normally, unbounded if the worker stops. A closed-by-clock listing could also still be newly saved (HTTP 201) | **Fixed** (section 4) |
| HF-02 | **P1** (could be P0 at launch traffic) | Performance, rate limit | **Confirmed by code reading and an API-level test; not observed on a real stack.** Public pages are rendered by the web container, which reads the API directly (`http://api:8000`), bypassing nginx and sending no visitor address. The API counts its anonymous-read limit (240 per minute, per process, two gunicorn workers) per address, so **all visitors shared one bucket**: roughly 240 to 480 server-side reads a minute for the whole site, where one page makes several reads. Beyond that the web tier shows its "rate limited" state to everyone | **Fixed on the web side** (section 4); production behaviour **unverified** |
| HF-03 | P1 | Search | Search is PostgreSQL full text with the `english` configuration, `websearch` syntax, and title (A), organisation and summary (B), body (C) weights. Organisation names **are** searchable. There is **no typo tolerance and no prefix matching** (a word fragment finds nothing). Derived from the code in `apps/api/opportunities/public.py` and `workflow.py`; not measured against real queries | **Proposal only**, owner and operations decision needed (section 6) |
| HF-04 | P2 | Lifecycle, deadlines | The API stores whatever instant the client sends together with `deadline_is_date_only`. The end-of-day-Harare convention (`23:59:59+02:00`, `Africa/Harare`, OQ-22) is enforced **only by the two web forms** (`draft-editor.tsx`, `listing-form.tsx`). A direct API client could mark a deadline date-only with another time of day. No such data is known to exist | Proposal |
| HF-05 | P1 | Performance | Every public page is `force-dynamic` (required by the per-request CSP nonce, `apps/web/src/proxy.ts`). That makes freshness correct by construction (no stale cached listing pages) but means every view costs one render plus several API reads on a shared 4-vCPU host. The recorded load test (`docs/engineering/PERFORMANCE_AND_LOAD.md`) was a lab run on a 1-CPU-limited stack, not production, and was **not repeated** here | Unverified, proposal |
| HF-06 | P2 | Analytics | There is no public product analytics. Only aggregate employer listing counters exist (`apps/api/employers/analytics.py`). The brief's events (search, save, outbound click, login outcome) are not recorded. Adding them depends on **OQ-19** (analytics, cookie consent, outbound-click KPI), which is open | **Not implemented, by design**: owner decision |
| HF-07 | info | Auth | The Google sign-in implementation was reviewed and is sound (section 5). Whether `https://upnext.co.zw/api/v1/auth/google/callback` is registered in the Google Cloud project, and whether the credentials work, **cannot be checked from the repository** | Unverified |

## 4. Implemented fixes

Both are small, tested, and change no API contract, schema or migration.

**HF-01** (`apps/api/opportunities/saved.py`, `apps/api/api/account_views.py`)
- `availability_of(opportunity, now)` returns `expired` for a published listing whose live revision's `deadline_at <= now`, the same comparison search, the sitemap and `derive_deadline_state` use. A listing with no deadline is never closed by the clock.
- `save()` refuses such a listing with the existing `listing_not_saveable` error (409).
- The saved queries join `opportunity__live_version`, so the list still issues the same number of queries however many items it has (the existing `test_saved_list_does_not_query_per_item` still passes).
- Already saved rows are kept and now show as closed, as for any expired listing.

**HF-02** (`apps/web/src/lib/catalog.ts`)
- Server-side catalog reads now send `X-Forwarded-For` with the visitor's address taken from the incoming request, where nginx has already replaced the header with the resolved client address (`infrastructure/compose/nginx.production.conf.template`), so a browser cannot choose it.
- Only the last entry is used, and only if it is a syntactically valid address; anything else (including header-injection attempts) is dropped. Outside a request, and for the shared cached sitemap, no address is sent.
- Not covered, deliberately: `auth/providers` is unthrottled; authenticated reads forward the visitor's session cookie and are limited per user.
- Remaining limit: the anonymous-read counters are still per worker process (two workers), by an earlier decision recorded in `apps/api/api/throttles.py`.

## 5. Verified without change (evidence)

- **Boundary agreement.** New tests prove that at exactly `deadline_at` the listing is absent from search and the sitemap, `derive_deadline_state` says `expired`, and `expire_due` expires it; one second earlier everything says open. They passed on the unmodified code. (`apps/api/tests/test_listing_freshness.py`)
- **Expiry scheduling.** The worker loop runs `expiry.run()` each cycle, isolated from the outbox, under an advisory lock, recorded in `core_jobrun`, and alerted on by `job.expiry_*`; existing tests cover overlap, failure and monitoring.
- **JobPosting data.** Emitted only for open, in-category listings with a stated place; never for closed, withdrawn or past-deadline listings; pay only with figures, currency and period; closed pages carry `noindex`. (`apps/web/src/lib/structured-data.ts`, listing page)
- **Google sign-in.** Authorization code flow with `state`, `nonce` and S256 PKCE held in the session, direct TLS token exchange, issuer, audience, expiry and nonce checks, verified e-mail required, same-site path-only `next`, staff accounts refused, unconfirmed password accounts lose their password on linking. Callback is built from `UPNEXT_PUBLIC_BASE_URL`. No secret reaches the web bundle (the secret is read only by the API).
- **Headers and cookies.** Per-request nonce CSP with `frame-ancestors 'none'`, `nosniff`, referrer policy, COOP, permissions policy; session and CSRF cookies `Lax`, session `HttpOnly`, `Secure` and `__Host-` prefix switchable for production.

## 6. Proposed improvements (not implemented)

1. **Search tolerance (HF-03).** Option A: `pg_trgm` similarity as a "Did you mean" suggestion shown only when a search returns nothing (never silently widening results). It needs `CREATE EXTENSION`, which depends on the database role's privileges. Option B, no extension: prefix matching on the last typed word via a sanitised `to_tsquery(... :*)`. Either needs a measured query log first; there is none because nothing is live.
2. **Server-side date-only rule (HF-04).** Reject `deadline_is_date_only` unless the time is 23:59:59 in the stated zone.
3. **Capacity (HF-02, HF-05).** Re-run `tools/perf/load.py` on the real stack in Phase 7 with a forwarded-address header, and decide whether to raise the per-process limit or move the counter to the shared cache.

## 7. Not examined in this pass

Mobile widths 320 to 430 px and Android Chrome (needs the browser suite or devices); keyboard obstruction, modal and drawer overflow; employer onboarding end to end; object-level authorisation beyond the existing registry tests (`test_access_registry.py`, `test_endpoint_review.py`, which pass); account deletion flow; email failure paths; monitoring and backup on real infrastructure; the unmerged PR #35.

## 8. Required owner decisions

- Approve or amend the two fixes (HF-01, HF-02) for merge into the integration branch. Nothing has been merged.
- Choose the search direction (HF-03), which touches database privileges.
- Decide whether to add public analytics at all (OQ-19).
- Decide how PR #35 and the Dependabot PRs are sequenced against this branch.
