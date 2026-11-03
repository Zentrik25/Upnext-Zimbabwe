# SEO, AEO, GEO and Google indexing: audit, plan and delivery report — DRAFT

Status: DRAFT (nothing is approved, merged or deployed). Date: 2026-11-03. Branch: `ccr-a4d103e2-kra4dq`. Decision record: ADR-0027 (PROPOSED) and OQ-35 to OQ-39 in the decision register.
Builds on `SEO_READINESS_REPORT.md` (D-51, 2026-10-30). That work is not repeated; this report records what was re-checked, what was still missing, and what was added.
Nothing here promises indexing, rankings, a Google Jobs listing, a rich result or an AI citation. It records technical correctness and what remains unproven.

## 0. Evidence classes

| Class | Meaning |
|---|---|
| **Source** | Read in the repository and covered by an executed test |
| **Built app** | Observed on `next build` + `next start` in this session (`UPNEXT_PUBLIC_BASE_URL=https://upnext.co.zw`) against a small mock API (the real Django stack serves the API tests, not these HTTP checks) |
| **NOT VERIFIED** | Needs the live site, an external service or an account this session does not have |

Production could not be audited: nothing is deployed (Phase 7 needs separate written approval) and the sandbox cannot reach `upnext.co.zw`. No production fact is claimed.

## 1. Phase 1 audit: verified findings

Already correct and **left alone** (re-read, covered by existing tests): server-rendered listing HTML (no client-only job content; Suspense only wraps the save button and related cards); one H1 per page; unique title/description per page; self-referencing canonical on listings, guides, employer profiles; `metadataBase` absolute; Open Graph + Twitter set together on every public page; featured/social images are absolute https (`images.url_of`) with the standard UPNEXT image as fallback; `JobPosting` only for open jobs/internships/graduate programmes with a stated place, never for scholarships/tenders/grants, never a numeric salary from "Competitive"; `directApply: false` (applications are not made on UPNEXT, so Google's strict `directApply` conditions are not met); instructions-only applications show a visible **How to apply** block; closed/withdrawn listings are `200` + `noindex` + no markup + no apply actions + out of the sitemap; archived/taken-down are `404`; slugs are unique and permanent (`test_db_invariants`, `_assign_slug`); paged/filtered lists are `noindex, follow`; private areas are `noindex` and/or disallowed in robots.txt with a test that fails if a new private page is missed.

| ID | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| SEO-B01 | High | No way to tell Google a job page changed or was removed; freshness depended on recrawl of the sitemap. The Indexing API was deliberately deferred in D-51 | Source: no code path; report section 7 | **Built, OFF** (ADR-0027); needs owner approval + Google setup |
| SEO-B02 | Medium | Employer profile pages were not in the sitemap (SEO-A13) | Source + built app | Fixed (`employers.xml`) |
| SEO-B03 | Medium | One mixed sitemap file; jobs, other opportunities and pages could not be monitored separately; building it made one list request per category (N+1) | Source | Fixed: index + typed, chunked files; one cached feed |
| SEO-B04 | Medium | No place or remote landing pages; `?location=harare` was `noindex` and canonical to `/opportunities` | Source + unit test | Fixed: `/locations/<slug>`, `/remote-jobs`, thresholded |
| SEO-B05 | Low | robots.txt had no explicit crawler policy | Source | Fixed (`crawler-policy.ts`); needs owner decision OQ-36 |
| SEO-B06 | Low | Listing pages showed no publication or update date although `datePosted` is emitted | Source (`job-view.tsx`) | Fixed (small muted line); owner may veto (OQ-37) |
| SEO-B07 | Info, **decision conflict** | The brief asks for visible source attribution; D-60 removed the source block from the job page by owner instruction, and a unit test pins "no sources block". Public copy still says listings "name their source" (OQ-34). Rows in lists still show the primary source name | Source | **Not changed.** OQ-37 |
| SEO-B08 | Info, **data limit** | "Engineering/Accounting jobs" pages need a listing-level sector or occupation; only employer profiles have sectors | Source (`OpportunityVersion` fields) | **Not built.** OQ-38 |
| SEO-B09 | Info | Pages are `force-dynamic` (the per-request CSP nonce requires dynamic rendering); every crawler hit reaches Django. No HTML cache layer | Source (`proxy.ts`) | Recorded; see section 5 |
| SEO-B10 | Info | HTTP→HTTPS, `www`, trailing-slash redirects live in the proxy and cannot be seen from source | Source | **NOT VERIFIED** |

## 2. Prioritised plan and what was delivered

| Priority | Item | Delivered |
|---|---|---|
| P1 | Indexing API outbox, retries, quota, dedupe, credentials, worker, commands | `apps/api/seo/` (migration `seo.0001`), 35 tests |
| P1 | Sitemap index, typed/chunked files, real lastmod, employers, thresholded landing pages | `lib/sitemap.ts`, `/sitemap.xml`, `/sitemaps/<file>`, API feed v2 |
| P1 | Place and remote landing pages with empty states, internal links, canonicals | `/locations/[slug]`, `/remote-jobs`, "Browse by place" on the list page |
| P2 | Crawler policy, llms.txt | `lib/crawler-policy.ts`, `robots.ts`, `/llms.txt` |
| P2 | AEO: Q&A guide (no FAQ markup), listing dates | `/guides/common-job-seeker-questions` (DRAFT wording), `listing-dates` |
| P2 | Administrator SEO page: queued vs accepted vs indexed vs search performance; setup-required state | `/workspace/seo`, `GET /api/v1/staff/seo` |
| P3 | Docs: setup guide, ADR, decision proposals, traceability (R-64), OpenAPI | this report, `SEARCH_CONSOLE_GUIDE.md` section 7 |

## 3. How each requirement of the brief is met

| Brief phase | Result |
|---|---|
| 2 Index every eligible opportunity | Eligible = published, open, public. Unique permanent URL, `200`, SSR, unique metadata, self-canonical, in the right sitemap file, linked from lists/categories/places/related. Non-job opportunities get no `JobPosting`. Thin or empty pages are `noindex, follow` |
| 3 JobPosting | Already valid by construction (section 1). **Rich Results Test: NOT VERIFIED** (external, site not public) |
| 4 Indexing API | As ADR-0027. Queue on T07/T09/T10/T11/T12; worker sends; backoff 2→32 min (cap 6 h), 6 tries; 429 stops the batch; daily self-limit 150; one open row per URL; present truth re-checked at send time; stale rows dropped after 7 days; credentials from env/mounted file only; `UPNEXT_INDEXING_ENABLED=false` by default; production compose passes it as `false`. **No real Google call was made** (tests use a fake transport) |
| 5 Sitemaps | Index + `pages`, `employers`, `jobs-N`, `opportunities-N` (10,000 per file). Canonical `https://upnext.co.zw` origin from configuration. Query results, arbitrary filters, staff pages and closed listings excluded; test for each. Listed in robots.txt. Feed cached ~5 min, so a withdrawn listing can remain up to 5 min; its page already says `noindex` |
| 6 Page-level SEO | Existing; new pages follow the same pattern (title, description, canonical, OG/Twitter, one H1, breadcrumb data) |
| 7 Location and category | Categories (D-51), cities/provinces and remote from 3 open listings. Combinations are never indexed. Sector pages not built (OQ-38) |
| 8 AEO | Q&A guide: question as heading, 2–3 sentence stand-alone answers, only product facts. FAQPage markup deliberately not used |
| 9 GEO | Org/WebSite data (existing), About/Contact (existing), dates added, crawler policy, llms.txt (experimental, no claims). Source attribution blocked by D-60 (OQ-37). No fake expertise, reviews or endorsements added |
| 10 Social | Existing and verified in source/tests; new pages use `socialFor`. **WhatsApp/Facebook/LinkedIn/X previews: NOT VERIFIED** (need a public URL) |
| 11 Performance | See section 5 |
| 12 Lifecycle | Active: indexable, in sitemap, `JobPosting`. Expired/withdrawn: `200`, "Closed"/"Withdrawn" banner, no apply actions, `noindex`, no `JobPosting`, out of the sitemap, `URL_DELETED` queued. Archived/taken down: `404`, `URL_DELETED` queued. Never redirected to the home page. Google accepts `URL_DELETED` for `404`/`410` or `noindex` pages (Google's Indexing API documentation) |
| 13 Monitoring | `/workspace/seo` (Administrators). Shows only what Google returned; otherwise a setup-required or error state with the next step. "Indexed" is shown only from URL Inspection for a sample of 5 |
| 14 Tests | Section 4 |

## 4. Validation results (this session)

| Check | Result |
|---|---|
| API full suite (`pytest`, PostgreSQL 16, Python 3.14.6) | all passed; coverage 94.35% (gate 85%) — run before three small extra tests were added |
| API new/changed tests re-run (`test_indexing` 35, `test_sitemap` 7, `test_staff_seo` 9, `test_openapi` 15, production compose 24) | passed |
| `ruff check` / `ruff format --check` / `mypy` on changed API code | passed |
| `detect-secrets scan` on new files | no findings (the test builds its fake key header from two strings) |
| Web unit (`vitest run`) | 28 files, 402 tests passed |
| `tsc --noEmit`, `eslint .`, `prettier --check .` | passed |
| `next build` | passed; new routes present |
| Built app against mock API | `/sitemap.xml` index, `pages/employers/jobs-1/opportunities-1` files well-formed and escaped, `jobs-9.xml` → 404, `robots.txt` groups, `/llms.txt`, `/locations/harare` (indexable, canonical, OG/Twitter equal), `/locations/gweru` (1 listing → `noindex, follow`), `/locations/zimbabwe` → 404, `/opportunities?location=harare` → canonical `/locations/harare` |
| axe-core (WCAG 2.0/2.1 A and AA) + horizontal-overflow check at 1280 and 360 px | no violations, no overflow on `/locations/harare`, `/locations/gweru`, the new guide and `/opportunities`. Run once by hand with the pre-installed Chromium; not part of CI |
| Playwright e2e (`seo`, `a11y`, `cms-journey`) | **updated, NOT RUN**: needs the Django stack and seeded demo data; CI runs them |
| Lighthouse / Core Web Vitals | **NOT RUN** |

The traceability generator reports the pre-existing gaps for R-04 and R-55 test ids; it reports none for R-64.

## 5. Performance and mobile (Phase 11): what is and is not known

Verified in source: listing content is server-rendered (no client-side critical content; the skeleton is only for the save button and related cards, which are not crawler content); the featured image has intrinsic size and `fetchPriority="high"` (no layout shift); new pages are server components with no new client JavaScript; the sitemap now needs one cached API request instead of one per category; the facets query is three aggregates.
**Not measured:** LCP, INP, CLS, server response time, bundle size delta (the `next build` output shows no new client route), database timings under load. No field data exists. Recommended next step with the real stack: run `tools/perf/measure.py` and Lighthouse, then consider short-lived HTML caching at the proxy for anonymous listing pages (requires a decision about the nonce CSP). No such change was made.

## 6. NOT VERIFIED / not done

1. Production behaviour: HTTPS, redirects, `www`, headers, certificate (SEO-B10).
2. Google Rich Results Test, Schema.org validator, URL Inspection, the Job postings report.
3. Any real call to Google. The service account, API enablement, Search Console ownership, quota and approval are all pending (OQ-35).
4. Social previews on WhatsApp, Facebook, LinkedIn and X.
5. Core Web Vitals (lab and field).
6. Playwright suites (not run here).
7. Bing: sitemap submission only; IndexNow still deferred.
8. The 200-per-day default publish quota often quoted for the Indexing API could not be confirmed from Google's pages; the guide tells the owner to read the real figure in the Cloud console.

## 7. Owner actions and decisions

1. Read ADR-0027 and decide OQ-35 to OQ-39 (approval to enable submissions; crawler policy for training bots; source attribution vs D-60; sector pages; thresholds and guide wording).
2. After deployment: `SEARCH_CONSOLE_GUIDE.md` sections 2 and 7 in order. Submit `sitemap.xml` (the index). Do not enable submissions until `indexing_check` passes and the approval is recorded.
3. Review the draft wording of `/guides/common-job-seeker-questions` and the new "Posted/Updated" line.

## 8. Rollback

Submissions: `UPNEXT_INDEXING_ENABLED=false` (the default). Code: revert the merge; the only schema change is the new table `seo_indexingnotification` (reversible by migrating `seo` to zero). Restoring the single-file sitemap is a revert of `lib/sitemap.ts` and the two route handlers plus restoring `app/sitemap.ts`. `UPNEXT_AI_TRAINING_CRAWLERS=allow` removes the training-crawler group.
