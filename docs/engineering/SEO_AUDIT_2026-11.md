# SEO and Google indexing audit and implementation (2026-11) — DRAFT

Status: DRAFT (D-68; owner decisions of 2026-11-05 applied: 503 with Retry-After approved, landing pages conditionally approved, Indexing API approved for record mode only). Date: 2026-11-05. Branch `ccr-b636fca1-2o9zex`. **Not merged, not deployed.** Builds on the D-51 work
(`SEO_READINESS_REPORT.md`), which is not repeated here. Nothing in this report claims that Google has crawled, indexed or
ranked any URL: there is no Search Console data, and the production site could not be reached.

## 0. Evidence classes

| Class | Meaning |
|---|---|
| **Build** | Observed on a production build (`next build` + `next start`, `UPNEXT_PUBLIC_BASE_URL=https://upnext.co.zw`) reading the **real Django API** on PostgreSQL 16 with the demo data (`seed_demo`), behind a local path-routing stand-in for the Compose nginx. Not a mock |
| **Source** | Read in the repository and covered by a test |
| **NOT VERIFIED** | Needs the live site, Google's tools or an account this session does not have |

**Production was not audited.** From this environment `https://upnext.co.zw` answers `403` at the egress proxy (CONNECT
refused) and plain `http://upnext.co.zw` does not resolve. HTTPS, redirects, `www`, headers, real content and Search
Console state are all NOT VERIFIED.

## 1. Confirmed findings, by priority

| ID | Sev | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| SEO-B01 | **Critical** | A live job page whose API read failed (API down, **429 rate limit**, unexpected answer) was served as **HTTP 200 "Opportunity not found" with `noindex`**. One crawl during an outage or a rate-limit burst (anonymous reads are limited to 240/min per address) tells Google to drop a live job. Same on company profiles; the plain and category lists answered 200 + `noindex` | Build: API stopped → `/opportunities/graduate-electrical-engineer-s3wycp` 200, title "Opportunity not found", `robots: noindex` | Faults throw `ContentUnavailableError` (`lib/unavailable.ts`); Next.js answers 500, and the UPNEXT proxy turns a 5xx on public crawlable addresses into **503 with `Retry-After: 120`** (owner decision). A missing listing is still a real 404 | Fixed; approved by the owner (D-68 (1)) |
| SEO-B02 | **High** | On `/opportunities` and every category list, `<title>`, `<link rel="canonical">`, the description and `robots` were **streamed into `<body>`** for Googlebot, AI crawlers and Lighthouse's own mobile agent. Google ignores `rel=canonical` outside `<head>`; Lighthouse failed `meta-description` | Build: Googlebot UA → canonical at body offset; Next.js 16 streams metadata to every agent not in its `htmlLimitedBots` list, which leaves out `Googlebot` | `htmlLimitedBots: /.*/` in `next.config.ts`: metadata is always in `<head>`. No extra request (the metadata and the results share one cached call) | Fixed |
| SEO-B03 | High | When the API failed, `/sitemap.xml` answered **200 with only 8 static URLs**, silently dropping every listing and category; it also made seven API requests | Build: API stopped → 200, 8 `<loc>` | Answers 5xx instead (crawlers keep the last good file); one feed request | Fixed |
| SEO-B04 | Medium | No `lastmod` on category lists or guides; company profiles absent from the sitemap (open item SEO-A13) | Build: `sitemap.xml` | The API feed reports each list's newest publication and every public profile; guides use their `dateModified`. Static pages keep no date rather than an invented one | Fixed |
| SEO-B05 | Medium | Stale content signals after D-67: the three guides were edited on 2026-11-02/03 but `dateModified` (Article data and visible date) said 2026-10-30; the "How listings are verified" and About descriptions promised a "where listings come from" section that D-67 removed | `git log` of the guide pages; page text | Dates set to 2026-11-03; both descriptions match the pages | Fixed |
| SEO-B06 | Medium | JobPosting `description` was a 5,000-character plain-text cut of the description only; Google asks for the full description in HTML, and the page also shows the requirements | Source and build JSON-LD | Full sanitised HTML of description and requirements under the page's own headings ("Key responsibilities", "Qualifications & experience"), never cut | Fixed |
| SEO-B07 | Low | `/opportunities/GRADUATE-…` answered 200 (correct canonical, but a duplicate address) | Build | 308 to the canonical slug | Fixed |
| SEO-B08 | Low | Home "More" chip: non-descriptive link text (Lighthouse `link-text`) | Build Lighthouse | Visually hidden " opportunities"; the visible chip is unchanged (D-61) | Fixed |
| SEO-B09 | Info | No location or sector pages; the public API had no sector filter | Source | See SEO-B10 | — |
| SEO-B10 | Info | Requested organic landing pages did not exist | — | `/jobs/{harare, bulawayo, graduate-trainee, engineering, finance-and-accounting, ngo}` (section 3) | Built |
| SEO-B11 | Info | Indexing API not implemented (D-51 had evaluated and declined it) | — | Implemented, off by default (section 4) | Built |
| SEO-B12 | Info | Home LCP in the lab is around the 2.5 s line | Lighthouse (section 6) | No code change shipped: a preload attempt was not emitted by React and was reverted; field data needed | Open |

**Checked and found correct (no change):** robots.txt (private areas disallowed, nothing needed for rendering blocked, sitemap
named); every private, account, staff, one-time-link and employer-tool page is `noindex` (including `/employer`, which robots.txt
does not block); `noindex, follow` with the right canonical on searched, filtered, sorted and paged lists; tracking parameters
ignored; unknown pages, unknown and never-published listings return a real 404; trailing slashes 308; **closed listings**
(withdrawn, expired, and published-but-past-deadline before the expiry job runs) stay readable with a visible notice, are
`noindex`, carry **no JobPosting** and are absent from the sitemap and from every active list (verified by withdrawing,
expiring and back-dating listings through the real workflow; the database trigger refused a direct edit of a frozen revision);
`datePosted` is the first publication, never reset by amendments; `validThrough` only when a deadline is stated (date-only
deadlines end 23:59:59 Harare); listing content and links are in the first HTML response; one H1 per page; BreadcrumbList and
Article data; draft legal pages `noindex` and unlisted (B-02).

Not changed, noted: the home page's `WebSite` `SearchAction` is harmless but no longer used by Google (the sitelinks search box
was retired in 2024); `hiringOrganization` has no `logo` or `sameAs` because no verified public value exists (never invented);
`addressRegion`/`postalCode`/`streetAddress` are absent unless stated, so Search Console may show non-critical warnings.

## 2. Implementation checklist

| # | Item | Where | Status |
|---|---|---|---|
| 1 | Faults → 5xx, never `noindex` (listing, profile, lists, landing pages, sitemap) | `lib/unavailable.ts`, pages, `sitemap.ts` | Done |
| 2 | Metadata always in `<head>` | `next.config.ts` | Done |
| 3 | One canonical listing address | `app/opportunities/[slug]/page.tsx` | Done |
| 4 | Full HTML JobPosting description | `lib/structured-data.ts` (`jobDescription`) | Done |
| 5 | Sitemap: real `lastmod`, profiles, landing pages, one feed | `app/sitemap.ts`, `GET /api/v1/sitemap` | Done |
| 6 | Guide dates and descriptions | `lib/guides.ts`, `app/about/page.tsx` | Done |
| 7 | Landing pages and API collections | `app/jobs/`, `lib/landing-pages.ts`, `opportunities/collections.py` | Done (copy and threshold need owner review) |
| 8 | Indexing API outbox | `apps/api/indexing/`, overlay `compose.production.indexing.yaml` | Done, off |
| 9 | Tests (unit, API, browser) | section 7 | Done |
| 10 | Search Console, Google Cloud key, Rich Results Test, field CWV | owner (section 9) | Not done (needs deployment) |

## 3. Landing pages (D-68)

Defined by recorded facts only (`apps/api/opportunities/collections.py`), employment categories only (jobs, internships,
graduate programmes; tenders, scholarships and grants stay on their category lists), built on `visible_versions`, so no draft or
closed listing can appear:

| Page | Holds |
|---|---|
| `/jobs/harare`, `/jobs/bulawayo` | placed in the city or a place in it, or at the level of its metropolitan province |
| ~~`/jobs/graduate-trainee`~~ | consolidated on 2026-11-05 (D-69): 308 to `/opportunities?category=graduate-programmes` |
| `/jobs/engineering` | Engineering sector, or a title with the whole word engineer/engineers/engineering |
| `/jobs/finance-and-accounting` | Finance and banking sector, or a title with accounts/accountant/accountancy/accounting |
| `/jobs/ngo` | NGO and development sector |

Each page: unique title, H1, description and intro saying how listings were chosen (no counts, salaries or claims written by
hand), the real listings server-rendered, cursor pagination, links to the other landing pages, the six category lists and the
guides, BreadcrumbList (never JobPosting on a list). **Indexable and in the sitemap only with at least 3 open listings**
(owner-approved initial value, configurable with `UPNEXT_LANDING_MIN_LISTINGS`) **and only when its listings are not
exactly the same set as the plain list or one category list** (the API reports `duplicate_of`; owner condition: meaningful,
unique content); below it `noindex, follow` with a link to the broader list; later pages `noindex, follow`, self-canonical;
unknown slugs 404; `/jobs` 308 to the jobs list. Build check: with the demo data `/jobs/harare` held 2 listings and was
`noindex`, unlisted; after publishing 2 more Harare jobs through the workflow it became indexable and appeared in the sitemap
with the newest publication as `lastmod`. axe (WCAG 2.2 AA tags) clean and no horizontal scroll at 320, 390 and 1440 px.

## 4. Google Indexing API

Full design, security and owner setup: `GOOGLE_INDEXING_API.md`. In short: only pages that carry JobPosting; `URL_UPDATED` on
publication, one `URL_DELETED` when a job closes in any way; queued inside the editorial transaction but never able to block
it; idempotent per event; quota per Pacific day; exponential back-off; key mounted read-only in the worker only; **off by
default**, `record` mode to inspect the queue before going `live`. Tests use recorded Google answers; **nothing was sent to
Google**.

## 5. Before and after (Build)

| Check | Before | After |
|---|---|---|
| Job page, API down | 200, "Opportunity not found", `noindex` | **503 + Retry-After** at the proxy (500 from the web app) |
| `/opportunities?category=jobs`, API down | 200, `noindex` (in `<body>`) | **503 + Retry-After** |
| `/sitemap.xml`, API down | 200, 8 URLs | **503 + Retry-After** |
| Canonical and title on `/opportunities` and category lists (Googlebot UA) | in `<body>` | in `<head>` |
| `/opportunities/GRADUATE-ELECTRICAL-ENGINEER-S3WYCP` | 200 | 308 → lowercase |
| Sitemap `lastmod` | listings only | listings, 6 category lists, guides (2026-11-03), landing pages, profiles |
| Guide "How listings are verified" description | mentions a removed section | matches the page |
| JobPosting `description` | plain text excerpt | full HTML, description + requirements |
| Landing pages | none | 6, threshold-gated |
| Lighthouse SEO score: `/`, `/opportunities` | 92, 91 | **100, 100** (job page 100 → 100, `/jobs/harare` 100) |

Unchanged and re-verified: closed, expired and past-deadline listings (200, notice, `noindex`, no JobPosting, unlisted);
404s; private pages `noindex`; robots.txt.

**Structured data, representative types (Build):** on-site job with pay (`graduate-electrical-engineer`): JobPosting with
`jobLocation` Harare/ZW, `baseSalary` USD 700–900 MONTH, `validThrough`, `identifier`; contract job with no deadline: no
`validThrough`; internship: `employmentType` INTERN; graduate programme in two cities: two `jobLocation` places, no
`employmentType` (trainee is not mapped); scholarship, tender, grant: BreadcrumbList only; withdrawn, expired, past-deadline:
none. **Google Rich Results Test and the Schema.org validator: NOT VERIFIED** (external services unreachable, site not public).

## 6. Performance (lab only)

Lighthouse 12, mobile emulation, simulated throttling, local production build, same machine. Lab LCP varied by up to
±0.6 s between identical runs depending on machine load (a test suite was running during the first baseline), so only
deterministic changes are claimed.

| Page | Before (perf / LCP / CLS) | After, idle machine (perf / LCP / CLS) |
|---|---|---|
| `/` | 94 / 3.0 s / 0 | 97–98 / 2.3–2.5 s / 0 (no home code change: the difference is load) |
| `/opportunities` | 95 / 2.8 s / 0 | 97 / 2.4 s / 0 (results now arrive in the first HTML) |
| `/opportunities/<job>` | 97 / 2.4 s / 0 | 98 / 2.3–2.4 s / 0 |
| `/jobs/harare` | — | 98 / 2.3 s / 0 |

CLS 0 everywhere; total blocking time 50–140 ms. The flat design, compact controls, colours and skeletons are unchanged.
Field Core Web Vitals (Search Console, 28 days of real traffic) are NOT VERIFIED. The remaining lever for the home LCP is
main-thread work before the hero paints (framework JavaScript), which is a larger change than this work justifies without
field data.

## 7. Tests executed in this session

| Check | Result |
|---|---|
| API: `ruff check`, `ruff format --check`, `mypy` (262 files), `makemigrations --check` | passed |
| API `pytest` (Python 3.14.6, PostgreSQL 16 — CI uses 18.6) | **1348 passed**, coverage 94.70 % (gate 85 %); new: `test_collections.py`, `test_indexing.py` (29), compose overlay test |
| OpenAPI `spectacular --validate`; contract test | passed |
| `pip-audit` on runtime pins (with `cryptography==50.0.2`) | no known vulnerabilities |
| Web: ESLint, `tsc`, Prettier, tokens check | passed |
| Web `vitest` | **473 passed** (35 files); new: `seo-hardening.test.tsx` (19) |
| `next build`; `npm audit --omit=dev` | passed; 0 vulnerabilities |
| Playwright (Build, pristine demo data): `seo.spec.ts`, new `landing-pages.spec.ts`, `opportunities.spec.ts`, `mobile-budget.spec.ts` | 51 passed, 4 skipped by their own conditions. An earlier run failed 4 listing tests only because this session had withdrawn, expired and back-dated demo listings; with fresh data all pass |
| Not run here | the other browser journeys (accounts, seeker, employer, CMS), CI's PostgreSQL 18.6 and Compose e2e jobs, the TLS rehearsal |

## 8. Google Search Console (manual, after deployment)

Follow `SEARCH_CONSOLE_GUIDE.md` (updated). Additions from this work: submit `sitemap.xml` and confirm the discovered count
includes landing pages that meet the threshold and company profiles; URL-inspect one landing page and one category list and
check the **Google-selected canonical** equals the declared one; run the Rich Results Test on at least one job with pay, one
internship, one graduate programme, one countrywide or remote job if any exist, and confirm a closed job shows no Job posting
item; then set up the Indexing API (`GOOGLE_INDEXING_API.md` section 4) in `record` mode before `live`.

## 9. Seven-day monitoring checklist (from the day the site is live)

| Day | Check | Expected / action |
|---|---|---|
| 0 | Live checks of `SEARCH_CONSOLE_GUIDE.md` §6 (HTTP→HTTPS, no `www` copy, trailing slash, robots, well-formed sitemap); domain property verified; sitemap submitted; Rich Results Test on the representative jobs | All pass; record the results |
| 0 | `indexing_status` in `record` mode after one test publication and one withdrawal | One `URL_UPDATED`, one `URL_DELETED`, nothing sent; then `live` |
| 1 | Sitemaps report: status Success, discovered URLs ≈ static + guides + categories with listings + qualifying landing pages + open listings + profiles | Investigate any "Couldn't fetch" (a 5xx means the API was down at that moment) |
| 1 | `indexing_status`: `sent` grows with publications, `dead` = 0, quota well under 200 | `403` → service account not Owner; `credentials_*` → key mount |
| 2 | URL Inspection: home, `/opportunities?category=jobs`, `/jobs/<a qualifying page>`, two job pages | "URL is on Google" or "Discovered"; user-declared = Google-selected canonical; no `noindex` surprise |
| 3 | Pages report: reasons for "Not indexed" | Expected: searched/filtered/paged lists, closed listings, sub-threshold landing pages, account pages. Unexpected: "Server error (5xx)" (check API uptime and the 240/min read limit), "Duplicate, Google chose different canonical" |
| 3 | Job postings enhancement report | Valid items rising; fix invalid items in the listing's data, never by inventing a field |
| 4 | Crawl stats | Server errors near 0; average response well under 1 s; no 429 bursts in the API logs for crawler addresses |
| 5 | Close a test job | Its URL leaves the sitemap at once and a `URL_DELETED` is sent within 5 minutes; search results may take days |
| 6 | Core Web Vitals / Page experience | Usually "Not enough data" in week one; note it, do not act on lab-only numbers |
| 7 | Week review: indexed count, impressions and clicks (Performance report), any manual action or security issue | Write a short note; adjust only with evidence. Do not claim indexing or ranking without these reports |

## 10. Outstanding issues requiring owner action

1. D-68 decided on 2026-11-05. Still open: the owner's **written authorisation to switch the Indexing API from `record` to
   `live`** once production readiness is verified; final review of the landing-page copy.
2. **Phase 7 deployment approval** (separate, written). Nothing here is deployed; The Granite Post, Traefik and Nginx are
   untouched.
3. **Search Console**: verify the domain property, submit the sitemap, add the service account as Owner.
4. **Google Cloud**: project, Indexing API, service account and key, installed on the server outside the repository.
5. **Real, verified listings** with stated places (B-09): landing pages and Google for Jobs depend on genuine content.
6. Guide wording still awaits the factual and editorial review of D-51 (3); Terms text about sources (D-67) is still open.
7. Consider raising the anonymous read limit or exempting verified crawler addresses if Search Console shows 5xx/429 under
   crawl (a 5xx is now the outcome, which is safe but slows crawling).

## 11. Rollback

Every change is in application code on this branch, plus one table migration (`indexing`, additive) and one optional
Compose overlay. Turning the Indexing API off is `UPNEXT_INDEXING_MODE=off`. Reverting the web commit restores the earlier
metadata, sitemap and pages; reverting the API commits removes the collection filter and the extra feed keys (the web reads
them as optional). The `indexing` migration can stay or be reversed with `migrate indexing zero`.

## Addendum 2026-11-09: Search Console "excluded by noindex" (30 URLs)

Status: DRAFT. Based on the code only; the Search Console export was not available to the audit and no production data was read.

| Finding | Cause | Change |
|---|---|---|
| `driver-salesperson-4q3mkv`, `stock-controllers-3-posts-grade-g-anfs6m` | By design (OQ-20): a listing that is not `published`, or whose deadline has passed (`deadline.state = expired`, derived per request), is answered `200` with `robots: noindex` and no JobPosting, and is out of the sitemap. Both were last crawled 30 Oct to 6 Nov; the likeliest cause is a passed deadline or a closed status. Confirm in the workspace (status, deadline) before treating it as a fault. | None. An open, published listing carries no robots tag (tested). |
| `category=jobsJobs`, `category=tendersTenders` | No link, menu, metadata or structured data in the repository builds these. They are a category code and its display name run together (the form `<select>` options read as one string). The list page treated them as an unknown filter: `200`, noindex. | `repairedListAddress` (`lib/list-seo.ts`): a permanent redirect to the clean category list, other filters kept. |
| `?q={search_term_string}` | The home page's `WebSite` `SearchAction` template; crawlers fetched the placeholder as an address. | `SearchAction` removed (Google retired the sitelinks search box in 2024); a request carrying the placeholder is redirected to the list without `q`. The search forms are unchanged. |
| Clean category filters | All six launch categories (jobs, internships, graduate-programmes, scholarships, tenders, grants) already have their own title, heading, text, canonical and sitemap entry while they hold an open listing; an empty one is `noindex, follow`. Combinations with search, filters, sort or paging stay `noindex` and canonical to the nearest list. Decision: keep as is. | None (tests added). |
| `/privacy`, `/terms` | Public (`200`), substantive, deliberately `noindex` and out of the sitemap until the owner sets `UPNEXT_LEGAL_APPROVED=true` after the legal review (B-02). | None: that gate is the owner's decision. Setting the flag makes both indexable and sitemap-listed. |
| Private pages | Unchanged: sign-in, account, saved, dashboard, for-you, profile, alerts, employer and workspace are `noindex` and/or disallowed. | None. |
