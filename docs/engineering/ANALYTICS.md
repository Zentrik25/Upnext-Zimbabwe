# Staff analytics: what is counted and how (D-65)

Status: DRAFT until the owner approves (CLAUDE.md rule 6). Implements the owner's instruction of 2026-11-03.

## What is stored

Per listing, per **UTC hour** (`employers_listinghourlystat`) and per **UTC day** (`employers_listingdailystat`): the number of page views and the number of apply clicks. Nothing else. No cookie, session, IP address, user agent or any other identifier is written. Both counters are written in one transaction, so they never disagree. Counters older than 12 months are deleted by the retention job (provisional, for the lawyer to confirm, `docs/legal/DATA_INVENTORY.md`).

## Page views, and why there is no unique-visitor number

* A **view** is one open of a public, published listing page in one browser **tab session**. The page reports itself once the tab is visible; the session flag is set before the report is sent, so a re-render, React's development double effect, a second mount in the same tab or a repeated API call does not count again. A person who returns in a new tab, or on another day, counts again.
* **Unique visitors are not measured and no number is shown for them.** Counting people reliably needs an identifier (a cookie, an address or a fingerprint), which this product deliberately does not keep (Phase 6A, D-35). A rough deduplication would be presented as accuracy it does not have, so the screens say "Not measured".
* An **apply click** is a click on the listing's apply button or link (web address or e-mail). It is **not** a submitted or successful application: UPNEXT never receives applications.

## What is not counted

* **Automated clients.** The server reads the `User-Agent` and prefetch headers once and drops the request: no User-Agent or a very short one, crawlers and spiders, link-preview fetchers (Facebook, WhatsApp, Telegram, LinkedIn, X, Slack, Discord), scripted tools (curl, wget, python, Java, Go, axios, node-fetch), headless and test browsers (Headless, Playwright, Puppeteer, Selenium, Lighthouse) and `Purpose`/`Sec-Purpose`/`X-Moz: prefetch`. This is a best effort: a bot that imitates a browser is counted. The browser also skips `navigator.webdriver`.
* **Staff previews** never mount the reporting component, and only listings with status *published* are counted. A staff member who opens the public page in a normal browser is counted like any reader.
* A hidden tab (opened in the background, or prerendered) reports when it first becomes visible.

## Definitions used on every screen

| Figure | Definition |
|---|---|
| 24-hour / 7-day / 30-day views | Rolling. The hour buckets starting at or after `now − 24 h / 7 d / 30 d`, rounded **up** to the next whole hour, through the current (partial) hour. The hour that straddles the edge is excluded, so the window is never longer than asked. |
| All-time views | The sum of the **daily** counters: everything recorded since counting began. |
| Tracking start | `daily_since` (first daily row) and `hourly_since` (first hourly row). Rolling and hourly figures exist only from `hourly_since`. Nothing earlier is estimated; earlier days appear only in the all-time total, and the screens say when counting began. |
| Click-through rate | Apply clicks ÷ views of the **same window**. Blank when that window has no views. Never mixes a period with all-time. |
| Period chart | 24 h: per hour; 7 and 30 days: per Harare day; 90 days: per Harare week (Monday); all time: per month of the daily counters. The first bucket of a rolling window may be partial and the latest is still in progress. Quiet buckets are zero. |
| Time zone | Stored and queried in UTC, bucketed and shown in Africa/Harare (UTC+2, no daylight saving). A custom range is whole Harare days, both ends included. |

## Who sees what

`analytics.read` is held by Editors and Administrators (`docs/engineering/ROLE_PERMISSION_MATRIX.md`). An Administrator sees every listing; an Editor sees the listings the staff scope allows (`opportunities.staff.listings_scope`); a Contributor, a seeker and an anonymous visitor see nothing, enforced in the API. No public endpoint returns any of it.

## Cost

The dashboard fetches its figures from the browser, so the page itself is never held up. `GET /staff/analytics` is cached for 60 seconds per person and period (per-process memory); the ranked table reads a page of 15 listings with the sums computed in the database; the Views column is one grouped query per page. Query counts do not grow with the number of listings (tested). Recording is two upserts, rate limited by address (120 per minute) and does not run in the page request.
