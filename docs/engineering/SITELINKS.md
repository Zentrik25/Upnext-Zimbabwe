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
| 8 | Sign in | `/sign-in` | Sign in | Sign in to your account | **no** (`noindex`, disallowed in robots.txt, not in the sitemap) |

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

## 4. Risks and owner decisions

- **Sign In cannot be a sitelink while it is `noindex`.** Google only shows indexed pages as sitelinks. Because
  robots.txt also blocks `/sign-in`, Google may still list the bare address without a description if others link it,
  but it will not show the page's content. Keeping it private is the owner's rule (P4-02, D-69); making it eligible
  would mean removing the `robots.txt` rule and the `noindex` (an owner decision, not recommended for an account page).
- **Graduate pages overlap.** `/opportunities?category=graduate-programmes` ("Graduate Trainee Programmes") and the
  landing page `/jobs/graduate-trainee` ("Graduate Trainee Jobs": programmes plus entry-level jobs) target similar
  searches. They hold different sets, and the landing page is never indexed when it repeats the category list
  exactly (D-68), but Google may pick either.
- **Category lists leave the index when empty** (D-51): a destination with no open listing is `noindex` and not in the
  sitemap until a listing is published.
- Sitelinks usually need sustained branded searches and crawling history; a new domain may show none for months.
