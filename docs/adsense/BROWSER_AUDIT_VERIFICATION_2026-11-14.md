# Verification of the external browser audit (2026-11-14) — DRAFT

Status: DRAFT (D-74). An external browser audit of https://upnext.co.zw, made after the AdSense "Low value content"
rejection, reported eight findings. Each was treated as a claim to verify against the live site (initial HTML, the
public API, the sitemap) and the code. Live checks ran 2026-11-14 06:00–06:40 UTC from this session (network access to
`upnext.co.zw` approved by the owner); raw evidence is in `docs/adsense/evidence-2026-11-14/`.

## 1. The audit's findings

| # | Audit finding | Verdict | Evidence |
|---|---|---|---|
| A1 | 25 sitemap URLs | **CONFIRMED** | `/sitemap.xml` at 06:00: 7 static pages (`/`, `/opportunities`, `/categories`, `/guides`, `/about`, `/employers`, `/contact`), 6 guides, 2 category lists (jobs, graduate programmes), 10 listings = 25 |
| A2 | 10 sitemap job listings | **CONFIRMED, correct behaviour** | 15 listing pages are public; 10 are open. The 5 others (Artisan – Lines, Junior Project Officer, Leading Hand, Procurement Officer, Truck Assistant) passed their deadline on 13 Nov 23:59 Harare time and are left out by design (`sitemap_entries`: published and deadline not passed; P4-03, D-51). No open listing is missing |
| A3 | 6 career guides | **CONFIRMED**; all 6 are in the sitemap with real `lastmod` | sitemap; `apps/web/src/lib/guides.ts` |
| A4 | `/opportunities` returns loading placeholders without JavaScript | **CONFIRMED (with nuance), FIXED** | The first response did contain all 10 listing links, but only inside React's `<div hidden id="S:n">` streaming containers, which an inline script moves into place. With JavaScript disabled in Chromium the page showed 0 listing links and "Loading …". Googlebot's user agent received the same HTML. Same for `?category=jobs` (7 links, all hidden), `?category=graduate-programmes` (3) and the home page (7). Cause: `<Suspense fallback>` around the results, search, tabs and filters (`app/opportunities/page.tsx`) and around four home sections (`app/page.tsx`). See §3 |
| A5 | Thin category pages | **CONFIRMED** | Indexable: `/opportunities?category=graduate-programmes` (3 listings, 160 words rendered), `/categories` (96 words, links only, no counts, 4 of 6 categories empty). `noindex` and out of the sitemap, correctly: internships, scholarships, tenders, grants (0 listings each), `/locations` (no places), 5 `/jobs/*` landing pages (0–1 listings, below the threshold of 3) |
| A6 | Limited original editorial content | **CONFIRMED** | 6 guides of 340–450 words, mostly about UPNEXT's own features; no other editorial content. Review in `docs/editorial/CAREER_INSIGHTS_LAUNCH_PLAN.md` §1 |
| A7 | Listings may substantially reproduce external adverts | **LIKELY; text comparison BLOCKED** | The original adverts' hosts are refused by this session's network policy, so no side-by-side comparison was possible. Indicators: application instructions are verbatim notice text (Merchandising Manager keeps "Share this opportunity with someone who may be interested!"); 9 of 10 open listings record no source, so UPNEXT cannot show where a text came from. Duplication *between* listings is negligible: one shared sentence, in two Delta Beverages adverts |
| A8 | Expiring vacancies reduce active inventory | **CONFIRMED** | 5 of 15 listings closed on 13 November; 3 open listings close by 20 November (PROBFIX 15 Nov, Senior Programmes Lawyer 20 Nov, Merchandising Manager 14 Nov). Without new publishing the site will hold 7 open listings on 21 November, 3 of them with no closing date |

## 2. The brief's seven questions

| # | Question | Answer | Status |
|---|---|---|---|
| 1 | Does `/opportunities` return crawlable job links in its initial HTML? | Before: present in the HTML but hidden until a script runs. After this change: every link is visible in `<main>` of the first response (10/10, 7/7, 3/3, home 7) and nothing is in a hidden container | **FAIL → FIXED** (branch, not deployed) |
| 2 | Are category and location pages server-rendered? | Yes: `/categories`, `/locations` and the category lists' headings and introductions were already in the first HTML; the category lists' *results* were hidden like A4 (fixed). `/locations` is empty because production has no places (ADS-T01) | **PASS** (rendering); `/locations` **FAIL** (data) |
| 3 | Why does the sitemap hold fewer jobs than the live listings? | Only open listings are listed (A2). One additional effect: once after 7 hours idle the web tier served a 5-minute-stale copy containing the 5 just-closed listings (stale-while-revalidate); the next request was correct | **PASS** |
| 4 | Which pages are thin, duplicated, empty or inaccessible? | Thin: `/categories` (before this change), `/contact`, graduate list; empty: 4 category lists, `/locations`, 5 landing pages (all `noindex`); duplicated: `/jobs` and `/jobs/graduate-trainee` redirect to their category lists (308, canonical), no duplicate indexable pages; inaccessible: none (76/76 internal links 200); privacy and terms reachable but `noindex` pending legal review | see report |
| 5 | Which vacancies have original source attribution? | Recorded sources: 2 of 15 (ZETDC → zetdc.co.zw, closed; Zentrik Solutions → employer portal, open). Open listings with a source: **1 of 10**. Before this change no source was shown anywhere (D-67); the branch shows recorded sources on the job page | **FAIL** (data) |
| 6 | Are expired listings handled correctly? | Yes: closed pages stay reachable with a "Closed" banner, `noindex`, no JobPosting, out of lists, the sitemap and the related links; the Indexing API sends `URL_DELETED` only in live mode (off) | **PASS** |
| 7 | Are guides and article pages in the sitemap? | All 6 guides and `/guides` are listed, with the date their text last changed | **PASS** |

## 3. What changed in code (Phase 2 and Phase 5)

- **No fallback on discovery pages.** `/opportunities` (all views) and the home page render the search, tabs,
  filters, results, latest listings, places and entry-level listings in one complete response. Async sections render
  concurrently; the list request is shared with the metadata. Searching and filtering stay GET forms; the next page
  stays a `rel="next"` link. Measured on a local production build fed live data: identical visible links with and
  without JavaScript; filtered, searched, sorted and empty views still answer `noindex, follow` with the same
  canonicals; `/opportunities` first byte 0.4–0.6 s locally (it already awaited the list for its metadata).
- **`/categories`** shows each category's real open count (from the list API, never estimated), links to its newest
  three listings and a relevant guide, and says "No open listings right now" for an empty category. When a category's
  list cannot be loaded no count is shown (a fault is not "none").
- **Career resources** under every list: the published guides relevant to that category (never a draft).
- **No new URL and no new indexable view.** Landing pages keep the threshold of 3 (D-68). `/locations` will fill
  automatically once places are seeded (O-2); the Harare and Bulawayo landing pages may then become indexable on their
  own under the existing rule.
- Tests: `server-html.test.tsx` (no-JavaScript HTML of the list and home), `category-pages.test.tsx`,
  `skeleton-system.test.tsx` (no fallback may return on these pages), `sitelinks.test.tsx` (now reads server HTML).
  Screenshots: `docs/adsense/screenshots/nojs-before-live-opportunities-phone.png` and
  `nojs-after-branch-opportunities-phone.png`, `categories-*.png`, `career-resources-phone.png`.

## 4. Decision narrowed

The skeleton system (R-52, owner instruction 2026-10-30) placed in-page Suspense boundaries on public routes. The
owner's instruction of 2026-11-14 requires the first HTML to be useful without JavaScript, which those boundaries
prevent on the discovery pages; they are removed there only. The skeleton components and private-route loading files
are unchanged. Recorded in D-74 and `docs/design/SKELETON_LOADING.md`.
