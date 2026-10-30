# SEO, AEO, GEO and Google indexing readiness: audit and final engineering report — DRAFT

Status: DRAFT (owner approval pending). Date: 2026-10-30. Branch: `claude/seo-readiness` (not merged, not deployed).
Nothing here promises rankings, indexing or appearance in AI-generated answers. It records technical correctness and
what is still unproven.

## 0. Evidence classes

| Class | Meaning |
|---|---|
| **Source** | Read in the repository and covered by a test |
| **Local build** | Observed in a production build (`next build` / `next start`) in this session, with `UPNEXT_PUBLIC_BASE_URL=https://upnext.co.zw` and a mock API (the Django stack and PostgreSQL were not running) |
| **NOT VERIFIED** | Needs the live site, an external tool or an account this session does not have |

**Production could not be audited.** From the sandbox, `https://upnext.co.zw/` and the VPS address answer `403` from the
egress proxy, and `docs/engineering/PRODUCTION_DEPLOYMENT_PLAN.md` states nothing has been deployed. No production fact below
is claimed; every production check is NOT VERIFIED and listed in section 6.

## 1. Findings (SEO audit report)

Severity: Critical, High, Medium, Low. "Status" is the state on this branch.

| ID | Sev | Route / component | Evidence | Search impact | Fix | Status |
|---|---|---|---|---|---|---|
| SEO-A01 | High | `/opportunities/[slug]` JobPosting and indexing | Source: JobPosting and `index` depended on `status === "published"`. A listing whose deadline had passed stayed `published` until the scheduled expiry job ran, so it kept `validThrough` in the past, was indexable and showed breadcrumbs | Google Jobs policy: expired jobs must not be marked up as open; stale results | `isOpen()` (published and deadline not expired) drives JobPosting, breadcrumb and `robots`; tests for the gap | Fixed |
| SEO-A02 | High | JobPosting `jobLocation` / remote | Source: a Zimbabwe-wide listing dropped the location entirely (no `jobLocation`, a required field); remote listings had no `applicantLocationRequirements` (required by Google) | Invalid structured data, ineligible for Jobs experience | Country-only `jobLocation` for Zimbabwe-wide; remote gets `applicantLocationRequirements` from a stated Zimbabwe location only; no place stated means no markup (never invented) | Fixed |
| SEO-A03 | Medium | JobPosting `identifier` | Source: bare string | Google expects `PropertyValue` | `{@type: PropertyValue, name: organisation, value: reference}` | Fixed |
| SEO-A04 | High | Category lists (`?category=`) | Source + e2e: every filtered list, including a single category, was `noindex` and canonical to `/opportunities`. Internships, scholarships, tenders and grants had no indexable landing page | Category queries cannot be satisfied by a category page | A list of exactly one known category is indexable with its own title, description, H1, canonical and sitemap entry. Owner decision needed (P4-02 was OPEN): D-50 proposal | Fixed (needs approval) |
| SEO-A05 | Medium | Paged and filtered lists | Source: all views, including later pages, were `noindex` with canonical to page one | Conflicting signals; page two is a distinct page | Later pages: noindex, follow, canonical to themselves. Other views: noindex, follow, canonical to the nearest indexable list. Tracking parameters (utm_*, fbclid) are ignored | Fixed |
| SEO-A06 | Medium | Twitter/X cards | Source: only the layout set `twitter`; Next.js does not merge it, so every page's card said "UPNEXT Careers" while Open Graph said otherwise | Wrong share previews | `socialFor()` sets Open Graph and Twitter together on every public page | Fixed |
| SEO-A07 | Medium | Listing titles | Source: `Title · Organisation \| UPNEXT Careers` | Less readable than the brief's pattern | `Title at Organisation \| UPNEXT Careers` | Fixed |
| SEO-A08 | Medium | `robots.txt` | Source: no rule for `/employer/` tools, report forms, `/employers/register`, `/django-admin/`, or re-sorted, re-sized and paged addresses | Crawl waste; private form addresses crawled | Rules added (the public `/employers` stays open; no rendering resource is blocked). Guard test: every non-public page is `noindex` or disallowed | Fixed |
| SEO-A09 | Low | API sitemap feed | Source: cap 50,000 plus static and category addresses could exceed the protocol's 50,000-URL file limit | Oversize file would be ignored | Cap 49,000; segmentation with `generateSitemaps` documented for when volume nears it | Fixed (segmentation not needed at current volume) |
| SEO-A10 | Medium | Informational content (AEO/GEO) | Source: only About and Contact; no guidance on finding jobs, safe applications, scams or verification | Thin answer coverage, weak trust signals | Three editorial guides (section 3), server-rendered, linked from the footer, About and listing pages, listed in the sitemap, with Article data and visible dates | Done (wording is DRAFT) |
| SEO-A11 | Low | Breadcrumbs | Source: listing breadcrumb skipped the category level | Weaker site structure signal | Opportunities > Category > Listing | Fixed |
| SEO-A12 | Low | Home/About/Contact/Employers social metadata | Source: Open Graph title and description fell back to the site defaults | Generic previews | Title and description passed explicitly | Fixed |
| SEO-A13 | Low | Employer profile pages not in the sitemap | Source: no API listing of profile slugs | Reached only through listing links | Needs a public API endpoint (no migration). Deferred, not required for launch | Open |
| SEO-A14 | Info | Closed and withdrawn listings | Source: `200` with `noindex`, no markup, not in the sitemap (P4-03 / OQ-20 default) | Acceptable: keeps shared links alive. `410` would drop them faster | Kept; revisit if closed pages accumulate | Accepted |
| SEO-A15 | Info | Redirects, www, HTTP | Source: no redirect rules in the app; the plan puts HTTP to HTTPS redirect and no-`www` at the proxy | Cannot be seen from source | See section 6 | NOT VERIFIED |
| SEO-A16 | Info | Existing strengths kept | Source: server-rendered pages, absolute `metadataBase`, one H1 per page, `noindex` on every account, staff and one-time-link page, JSON-LD escaping, 404 for unknown and unpublished listings (local build), no JavaScript-only links to listings | | | Confirmed |

Sitemap/robots/canonical results observed in the local build are in section 4. No broken internal links, redirect chains or soft 404s were
found in source or local build (unknown pages and unpublished listings return a real `404`; a test resolves every guide, static and category
link to an existing route).

## 2. Implementation summary

- `src/lib/list-seo.ts`, `category-seo.ts`: indexing rules and search copy for the six launch categories (only codes in the catalogue get a page).
- `src/lib/structured-data.ts`: `isOpen`, stricter `jobPostingFor`, `articleFor`.
- `src/lib/brand.ts`: `twitterFor`, `socialFor`.
- Pages: `opportunities` list and listing metadata, home, about, contact, employers, legal; `robots.ts`; `sitemap.ts`.
- `src/lib/guides.ts`, `components/content/guide-page.tsx`, three pages under `/guides/`; footer column; links from About and listings.
- API: `SITEMAP_LIMIT` 49,000 (constant and comment only; **no migration**).
- Tests: `tests/unit/seo-readiness.test.tsx` (new), `seo.test.tsx`, `tests/e2e/seo.spec.ts`, `a11y.spec.ts`.

Not changed: infrastructure, Traefik/Nginx, CI workflows, secrets, permissions, the editorial workflow, the design system, the domain.

## 3. Content added (DRAFT: owner review needed before any publication)

Three guides, written only from what the product does, with no invented statistics, legal claims, partners or contact details:
`/guides/how-to-find-jobs-in-zimbabwe`, `/guides/apply-safely-and-avoid-scams`, `/guides/how-listings-are-verified`. Each has one H1, H2
sections, a visible publication date equal to the Article data, and links to the other guides and the listings. They do not repeat for
keywords and no FAQ markup is used. The safety advice is general good practice, not Zimbabwean law; the owner should review it.

## 4. Structured data report

| Type | Where | Rules |
|---|---|---|
| `WebSite` (+ `SearchAction`), `Organization` | `/` | Name, URL, logo, the one official e-mail. No `sameAs`, `contactPoint` or registration numbers: none are public and verified |
| `JobPosting` | Open listings in categories jobs, internships, graduate-programmes only | `title`, `description` (plain text of the visible description), `datePosted`, `validThrough` when a deadline is stated, `hiringOrganization`, `jobLocation` or `applicantLocationRequirements` + `jobLocationType`, `employmentType` only when unambiguous (contract, temporary, part time, internship), `baseSalary` only with stated figures, `identifier` as `PropertyValue`, `directApply: false` (applications are made on the issuer's channel, not on UPNEXT). None for scholarships, tenders, grants, closed, withdrawn, past-deadline or unplaced listings |
| `BreadcrumbList` | Open listings, guides | Home or Opportunities > Category > Listing |
| `Article` | Guides only | Organisation as author and publisher; dates equal the visible dates |
| `FAQPage` | Not used | Google limits FAQ rich results to a small set of authoritative sites; no page needs it |

Validation: JSON structure and required fields were checked in unit tests and on the local build output
(`graduate-engineer` fixture: location, salary, identifier, no markup for a closed or past-deadline fixture).
**Google Rich Results Test and Schema.org Validator: NOT VERIFIED** (external services, not reachable from the sandbox, and the site is not public).
Run them after deployment (guide, section 4).

Local build output, observed (mock API):
- `GET /robots.txt` → 200 `text/plain`, 21 `Disallow` rules, `Sitemap: https://upnext.co.zw/sitemap.xml`.
- `GET /sitemap.xml` → 200 `application/xml`, well-formed, 15 URLs: 5 static, 3 guides, 6 category lists, 1 listing with `lastmod`; no query addresses other than categories; privacy and terms absent until owner approval.
- Canonicals and robots: plain list index; `?category=internships&utm_source=x` canonical `…/opportunities?category=internships`, indexable; `?q=` noindex, follow; `?category=jobs&cursor=abc` noindex, follow, self-canonical; open listing indexable with JobPosting; closed and past-deadline listings `noindex`, no markup; unknown and unpublished listings `404`.
- Titles, Open Graph and Twitter titles agree on every page checked.

## 5. Indexing readiness checklist

| Item | Result | Note |
|---|---|---|
| Domain ownership | NOT VERIFIED | Needs the DNS TXT record (owner/operator) |
| Production accessibility | NOT VERIFIED | Not deployed (Phase 7); unreachable from the sandbox |
| HTTPS | NOT VERIFIED | Needs the front and certificate (B-04); production code refuses non-HTTPS settings |
| Canonicalization | PASS (local) / NOT VERIFIED (HTTP→HTTPS, `www`) | Proxy-level redirects cannot be seen from source |
| robots.txt | PASS (local) | |
| XML sitemap | PASS (local) | Submit after launch |
| Public route discoverability | PASS | Crawlable links from home, footer, category tiles, lists, listings, guides |
| Metadata | PASS (local) | Unique titles, descriptions, canonicals, Open Graph, Twitter |
| JobPosting structured data | PASS (local, unit) / NOT VERIFIED (Rich Results Test) | |
| Expired job handling | PASS (source, local) | Scheduled expiry job exists with its own API tests (not re-run here: the API test stack was not available) |
| Privacy policy | FAIL by design | Draft, `noindex`, not in the sitemap until the owner records approval (B-02) |
| Terms of service | FAIL by design | Same |
| Mobile usability | PASS (local) / NOT VERIFIED (Search Console) | Viewport meta, no horizontal scroll at 390 px |
| Performance | NOT VERIFIED | Local, unthrottled, mock API: LCP 136–252 ms, CLS 0, no layout scroll. Lighthouse could not start in the sandbox; no field data exists |
| Google Search Console readiness | NOT VERIFIED | Procedure written: `SEARCH_CONSOLE_GUIDE.md` |

## 6. Remaining blockers and manual checks

1. **Owner decisions:** approve D-50 (category lists indexable; three guides' wording); privacy and terms approval (B-02) before they are listed.
2. **Deployment (Phase 7, separate written approval):** none was done. After it: V-1 to V-12 of the deployment plan plus the checks in the guide, section 6.
3. **Proxy behaviour to confirm on the live site:** HTTP→HTTPS, no `www` resolution or a redirect, trailing-slash behaviour, `X-Robots-Tag` and cache headers, `/sitemap.xml` freshness.
4. **External validation:** Rich Results Test and Schema.org Validator on one open job; URL Inspection for the home page, a category list and a listing.
5. **Real data:** JobPosting only appears for open listings that state a place. If many seeded or real jobs state neither a town nor Zimbabwe, they will have no markup; check the Search Console job report once indexed.
6. **Social previews** (WhatsApp, Facebook, LinkedIn, X): need a public URL to test; the shared image is the existing 1200×630 brand image.
7. **Core Web Vitals field data** needs real traffic (28 days) in Search Console; lab runs with Lighthouse on the deployed site.
8. **E2E suite** was updated but **not run** (needs the Django stack and demo data); CI will run it.

## 7. Evaluations (not implemented, with reasons)

- **Google Indexing API:** limited to job posting (and livestream) pages, needs a Google Cloud service account added as an owner in Search Console, has a default daily quota, and needs publish, update and expire events sent from the editorial workflow. Not implemented: credentials, quota and lifecycle wiring are not in place and the sitemap already reflects publication. Revisit after launch if freshness lags.
- **IndexNow (Bing and others):** needs a key file at the site root and a call at each publish, update and removal, with outbound network access from the worker. Not implemented; Bing reads the sitemap. Revisit with the same lifecycle hook.
- **`llms.txt`:** not a Google or Bing indexing mechanism and no major system documents it as a requirement; no operational value shown. Not added.
- **FAQ markup, extra keyword pages:** deliberately avoided.

## 8. Tests executed in this session

| Check | Result |
|---|---|
| `tsc --noEmit` | passed |
| `eslint .` | passed |
| `prettier --check` | passed |
| `vitest run` (web unit) | passed: 18 files, 220 tests (includes the new SEO suite; the private-route guard was checked by deleting `/workspace` from robots.txt and failing as expected) |
| `next build` | passed |
| Production-mode smoke (robots, sitemap, page heads, JSON-LD, status codes) | passed against a mock API |
| `ruff check` / `ruff format --check` on the API change | passed |
| Playwright e2e (`seo`, `a11y`, `mobile-menu`) | **not run**: needs the Django stack and seeded demo data |
| API pytest | **not run**: no database in the sandbox (the API change is a constant and comment) |
| Lighthouse | **not run**: could not start Chrome in the sandbox |

## 9. Rollback

Everything is in application code on one branch. Reverting the merge commit restores the previous metadata, robots, sitemap and structured data.
There is no migration and no configuration change. If category lists should not be indexed after all, change `classifyList` so a single category
returns `refined` (one function, covered by the tests).

## 10. Recommended next actions

1. Owner review of D-50 and the guides' wording; decide the legal approval (B-02).
2. Merge on approval; deploy only under the Phase 7 plan.
3. After deployment follow `SEARCH_CONSOLE_GUIDE.md`; run the Rich Results Test on one job.
4. Add employer profile pages to the sitemap through a small public API endpoint (SEO-A13).
5. Add real, verified opportunities (B-09): search visibility depends on useful, accurate content, which no markup can substitute for.
