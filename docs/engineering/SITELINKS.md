# Branded search: eight priority destinations (Google Sitelinks) — DRAFT

Status: DRAFT (D-69). Date: 2026-11-05. Not merged, not deployed. **Google alone decides whether sitelinks appear, how
many, which pages and with which labels.** Nothing here guarantees sitelinks or rankings; it makes the site's
hierarchy clear and its signals consistent.

## 1. Route and SEO audit (before this change)

Observed on a production build reading the real API with demo data, behind the project's nginx (`infrastructure/compose/nginx.conf`).

| Area | Finding | Action |
|---|---|---|
| Home `<title>` | Already the owner's exact text | Kept |
| Home description | Older approved wording ("… from trusted sources") | Replaced with the owner's new text |
| Home canonical | `https://upnext.co.zw` (Next.js always drops the slash of a root canonical) | Written by the page itself as `https://upnext.co.zw/`, one tag, in `<head>` |
| Destinations | Seven of the eight already existed as public, indexable, self-canonical pages (the list, five category lists, `/employers`); Sign In exists and is private | No new routes |
| Titles and headings | `/opportunities` titled "Latest Jobs & Opportunities" (too close to "Latest Jobs"); H1 "Opportunities"; category titles did not use the destination names (e.g. "Internships in Zimbabwe") | Renamed to the destination names; unique H1 per list |
| Visible text on lists | Only "Applications happen on the issuer's own channel." | Each list now shows its own description under the H1 |
| Structured data | Organization and WebSite on the home page (valid; `url` without slash); BreadcrumbList on listings and guides; none on category lists; JobPosting only on eligible vacancies | `url` with slash; BreadcrumbList on category lists; JobPosting unchanged |
| Footer | "All opportunities" and "Browse by category" both pointed at `/opportunities`; no link to jobs, tenders, internships, graduate programmes or scholarships lists | Six distinct, descriptive opportunity links; Sign in added |
| Mobile menu | "Jobs" opened the all-opportunities list; no graduate programmes entry | "All opportunities", "Jobs" (jobs list) and "Graduate programmes" |
| Private pages | Sign in, employer dashboard and account pages `noindex`; private areas disallowed in robots.txt; none in the sitemap | Unchanged |

## 2. The eight destinations and their addresses

| # | Destination | URL | `<title>` (site name appended) | H1 | Index / sitemap |
|---|---|---|---|---|---|
| 1 | Jobs & opportunities in Zimbabwe | `/opportunities` | Jobs & Opportunities in Zimbabwe | Jobs and opportunities in Zimbabwe | yes / yes |
| 2 | Latest jobs | `/opportunities?category=jobs` | Latest Jobs in Zimbabwe | Latest jobs in Zimbabwe | yes while it holds an open listing (D-51) |
| 3 | Latest tenders | `/opportunities?category=tenders` | Latest Tenders in Zimbabwe | Latest tenders and procurement notices | same |
| 4 | Internships & attachments | `/opportunities?category=internships` | Internships & Attachments in Zimbabwe | Internships and attachments in Zimbabwe | same |
| 5 | Graduate trainee programmes | `/opportunities?category=graduate-programmes` | Graduate Trainee Programmes in Zimbabwe | Graduate trainee programmes in Zimbabwe | same |
| 6 | Scholarships & fellowships | `/opportunities?category=scholarships` | Scholarships & Fellowships | Scholarships and fellowships | same |
| 7 | For employers | `/employers` | For Employers | For employers | yes / yes |
| 8 | Sign in | `/sign-in` | Sign in | Sign in to your account | **no**: navigation only (`noindex`, not in the sitemap, crawlable so the `noindex` is read) |

The home page (`/`, title "UPNEXT Careers | Jobs & Opportunities in Zimbabwe") links all eight with plain HTML links in
its footer; the footer is on every public page. The desktop header links destinations 1, 7 and 8; the phone menu
links all eight. Single source: `apps/web/src/lib/destinations.ts`. The employer dashboard (`/employer`)
and employer tools stay private and `noindex`; the public employer page is `/employers`.

Wording checked against the data: internships cover "attachments, internships and apprenticeships"; graduate
programmes are "structured entry-level programmes"; the scholarships schema covers study and research funding up to
postdoctoral, so "fellowships" means study and research fellowships.

## 3. Google Search Console checklist (after deployment; needs the verified domain property)

1. URL Inspection → Test live URL for `/` and each of destinations 1–7: "URL is available to Google"; the
   user-declared canonical equals the Google-selected one; the rendered page shows the H1, the intro text and listings.
2. Request indexing once for `/` and `/opportunities` only (do not repeat it).
3. Sitemaps: `sitemap.xml` reads Success; destinations 1–7 are listed (2–6 only while each category has an open
   listing); `/sign-in` is not listed.
4. Pages report: destination 8 shows as "Blocked by robots.txt" or "Excluded by noindex" — expected.
5. Rich Results Test on `/` (Organization, WebSite), one category list (Breadcrumb) and one open job (Job posting).
6. Search `UPNEXT Careers` after a few weeks of crawling: note which sitelinks, if any, Google shows. There is no
   control to choose them; if an unwanted page appears, improve the wanted page's links and titles rather than
   hiding the unwanted one (use `noindex` only for pages that must never appear).
7. Performance report → Queries containing "upnext": branded impressions and clicks per destination.

## 4. Corrections before merge (owner instruction, 2026-11-05)

**Graduate overlap resolved by consolidation.** `/jobs/graduate-trainee` ("Graduate Trainee Jobs": graduate programmes
plus jobs at entry level) and `/opportunities?category=graduate-programmes` ("Graduate Trainee Programmes") answered the
same search: in Zimbabwe a graduate trainee programme *is* the graduate trainee job, and on the demo data the landing
page held the category's two programmes plus one entry-level job. Two indexable pages for one intent compete with each
other, so the landing page now answers **308** straight to the category list (one hop, the target is final and
self-canonical, any query such as an old cursor is dropped). It is gone from the sitemap, the landing-page links and
the API collections; entry-level jobs stay on the jobs list. Five landing pages remain (Harare, Bulawayo, engineering,
finance and accounting, NGO); none repeats a category: their sets differ and a page that would repeat a list exactly is
never indexed (D-68).

**Category URLs.** The five category destinations are ordinary `<a href>` links (category tabs, footer, phone menu);
the first HTML response already holds the listings, so no script is needed. Each has its own title, description, H1,
visible introduction and BreadcrumbList, and a canonical that keeps its `?category=` parameter. Any other parameter
(tracking, search, filters, page size) is `noindex, follow` and canonical to the category; later pages are
self-canonical (D-51). An empty category is `noindex` and left out of the sitemap. No `/jobs`, `/tenders` or other new
routes were added: the existing addresses are already crawlable, canonical and linked, and moving them would need
redirects for every indexed URL without a demonstrated gain.

**Sign In and robots.txt.** `/sign-in`, `/register` and `/forgot-password` are linked from public pages and carry
`noindex`. They are **no longer disallowed** in robots.txt: a crawler barred from a page cannot read its `noindex` and
may list the bare address ("Indexed, though blocked by robots.txt"); allowed, it reads the tag and keeps the page out.
They stay out of the sitemap. Account, saved, dashboard, profile, alerts, staff, employer tools, API and the
one-time-link pages (`/reset-password`, `/verify-email`) stay disallowed: they are private or carry tokens and are not
reached by a signed-out crawler.

## 5. Final canonical mapping

| Address | Answer | Canonical | Sitemap |
|---|---|---|---|
| `/` | 200 | `https://upnext.co.zw/` | yes |
| `/opportunities` | 200 | itself | yes |
| `/opportunities?category={jobs,tenders,internships,graduate-programmes,scholarships}` | 200 | itself, with the parameter | while it holds an open listing |
| `/opportunities?category=…&utm_source=…` (or any search, filter, sort, size) | 200, `noindex, follow` | the category list | no |
| `/employers` | 200 | itself | yes |
| `/jobs/graduate-trainee` (and with any query) | **308** → `/opportunities?category=graduate-programmes` | — | no |
| `/jobs/{harare,bulawayo,engineering,finance-and-accounting,ngo}` | 200 | itself | from 3 open listings, and not a repeat of another list |
| `/sign-in`, `/register`, `/forgot-password` | 200, `noindex` | — | no |
| `/opportunities/<unknown>`, `/<unknown>` | 404 | — | no |
| Public pages while the API is unavailable | 503, `Retry-After: 120` | — | sitemap 503 too |

## 6. Remaining risks

- **Sign In cannot be a sitelink while it is `noindex`** (Google only shows indexed pages); it stays a navigation link
  by the owner's rule.
- **Old links to `/jobs/graduate-trainee`** keep working through the permanent redirect; Google drops the old URL
  after recrawling it.
- **Category lists leave the index when empty** (D-51): a destination with no open listing is `noindex` and not in the
  sitemap until a listing is published.
- Sitelinks usually need sustained branded searches and crawling history; a new domain may show none for months.
