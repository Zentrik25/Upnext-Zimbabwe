# Google Search Console and Bing Webmaster Tools: submission guide — DRAFT

Status: DRAFT. Do this only after the site is deployed at https://upnext.co.zw (Phase 7, separate written owner approval). Submitting a sitemap
asks search engines to look; it does not guarantee crawling, indexing, a Google Jobs listing or any ranking. The product names and menus below
change; if a screen differs, follow Google's and Microsoft's current help pages.

## 1. Before you submit (all on the live site)

1. `https://upnext.co.zw/` answers 200 over HTTPS with a valid certificate; `http://` redirects to `https://`; `www` is not used.
2. `https://upnext.co.zw/robots.txt` shows `Allow: /`, the private-area `Disallow` lines and `Sitemap: https://upnext.co.zw/sitemap.xml`.
3. `https://upnext.co.zw/sitemap.xml` returns 200, `application/xml`, and is a **sitemap index** (ADR-0027) listing `/sitemaps/pages.xml` (home, guides, category lists, city and province pages that qualify, remote jobs), `employers.xml`, `jobs-N.xml` and `opportunities-N.xml`. Open each file once. The privacy and terms pages appear only after the owner records legal approval, B-02.
4. Open one live job and one closed job: the open one has no `robots` meta tag and carries a JobPosting; the closed one says `noindex` and has none.
5. At least some real, verified listings are published. A site with no listings gives crawlers little to index.

## 2. Google Search Console

**Verify ownership (domain property, DNS TXT).**
1. Open https://search.google.com/search-console and sign in with the owner's Google account.
2. Add property → **Domain** → enter `upnext.co.zw`.
3. Copy the TXT record Google shows (`google-site-verification=…`).
4. In the DNS provider's zone for `upnext.co.zw`, add a TXT record at the apex (host `@`) with that value. Do not change A, MX, SPF or DKIM records.
5. Wait for DNS to update (minutes to hours), then press **Verify**. Keep the record in place permanently.
6. Add the accountable people under Settings → Users and permissions.

**Submit the sitemap.**
1. Indexing → **Sitemaps** → enter `sitemap.xml` (the index) → Submit. Search Console then lists each file under it, so jobs, other opportunities, pages and employers are reported separately.
2. Status should read **Success**; the discovered URL count of each file should match the file. Fix any error shown there (the file is generated per request; there is no file to upload).

**Test key pages (URL Inspection).**
1. Paste `https://upnext.co.zw/` → **Test live URL** → check "URL is available to Google", the canonical, and that the rendered page shows the content.
2. Repeat for one category list (`/opportunities?category=internships`), one open listing and one guide.
3. For a page that is ready, **Request indexing** (a few at most; do not repeat it for the same URL).

**Validate the job markup.**
1. Open https://search.google.com/test/rich-results, test the live URL of one open job. Expect a valid **Job posting** item; resolve any error, and read warnings (a warning such as a missing recommended field is acceptable if the listing does not state it, because UPNEXT does not invent data).
2. Optionally check the markup in the Schema.org validator (https://validator.schema.org).
3. After Google has crawled listings, Enhancements → **Job postings** shows valid, invalid and unindexed items.

**Monitor.**
- Indexing → **Pages**: indexed versus not indexed, with reasons. Expected "not indexed" entries: searched, filtered and paged lists (`noindex`), sign-in and account pages, closed and withdrawn listings.
- Experience → **Core Web Vitals** and **Page experience**: field data appears after enough real visits. Good targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- **Security & Manual actions**: both should read "No issues". Check weekly in the first months.
- Settings → Crawl stats: look for server errors or very slow responses.

## 3. Bing Webmaster Tools

1. Open https://www.bing.com/webmasters, sign in, and **Add a site** → `https://upnext.co.zw`. If the owner already verified Search Console, use "Import from Google Search Console".
2. Otherwise verify with a DNS CNAME record (the screen gives the host and value) at the apex zone, or by the XML file/meta tag method if the owner prefers (a meta tag or file needs a small code change and a deployment).
3. **Sitemaps** → Submit `https://upnext.co.zw/sitemap.xml`.
4. Use **URL Inspection** and the crawl and SEO reports for diagnostics.
5. IndexNow is not enabled (see the report, section 7). Bing discovers new listings through the sitemap.

## 4. Google Jobs: what to expect

- Eligibility depends on valid, accurate JobPosting data on real, open vacancies, plus Google's own quality systems. UPNEXT never emits markup for scholarships, tenders, grants, closed listings or listings with no stated place.
- Because UPNEXT does not take applications, `directApply` is false and each listing links to the issuer's own channel.
- Expiry: a listing that is closed, withdrawn or past its deadline loses its markup and is removed from the sitemap on the next sitemap build; the page itself says `noindex` and shows its status. Google may take days to reflect it in results. The Indexing API (section 7) can speed this up once the owner has approved it; it is built and off.

## 5. Weekly routine for the first month

1. Search Console → Pages: new errors? (server error, "Submitted URL marked noindex", "Duplicate without user-selected canonical").
2. Job postings report: invalid items? Fix the cause in the listing's data, never by inventing a missing field.
3. Sitemap status and discovered count against the number of open listings.
4. Check a closed listing falls out of the sitemap and results.

## 6. After deployment: checks that could not be done before

| # | Check | Expected |
|---|---|---|
| 1 | `curl -I http://upnext.co.zw/` | permanent redirect to `https://upnext.co.zw/` |
| 2 | `curl -I https://www.upnext.co.zw/` | not resolved or redirected to the apex; never a second copy of the site |
| 3 | `curl -I https://upnext.co.zw/opportunities/` | one redirect to the address without the trailing slash, or the page directly |
| 4 | `curl -s https://upnext.co.zw/robots.txt` | as in section 1 |
| 5 | `curl -s https://upnext.co.zw/sitemap.xml \| xmllint --noout -` | no output (well-formed) |
| 6 | Social previews: Facebook Sharing Debugger, LinkedIn Post Inspector, a WhatsApp message, an X post preview | correct title, description and image; no private data |
| 7 | The Granite Post | unchanged (deployment plan V-11) |

## 7. Google Indexing API and Search Console API: owner setup (ADR-0027)

Status: DRAFT. Do not start before the site is deployed and Search Console (section 2) is verified. **UPNEXT sends nothing to Google until `UPNEXT_INDEXING_ENABLED=true`, which only the owner sets after approving it in writing (OQ-35).** Menus and quotas change; where a screen differs, follow Google's current documentation for the Indexing API and the Search Console API.

What it does and does not do: the Indexing API tells Google that a *job posting* page was published, changed or removed so it can be recrawled sooner. It is supported by Google only for pages with `JobPosting` markup (UPNEXT sends only jobs, internships and graduate programmes that state a place; never scholarships, tenders, grants or drafts). It does not guarantee crawling, indexing, a Google Jobs listing or any ranking. An accepted notification (HTTP 200) means Google *received* it, nothing more. The sitemap stays the main discovery route and carries the same truth.

**A. Create the service account (Google Cloud).**
1. Open https://console.cloud.google.com and create a project (for example `upnext-search`), or choose an existing one the owner controls.
2. APIs & Services → Library: enable **Web Search Indexing API** and **Google Search Console API**.
3. IAM & Admin → Service Accounts → Create. Name it `upnext-indexing`. It needs **no** Cloud IAM role.
4. Open the account → Keys → Add key → Create new key → JSON. A file downloads. **It is a secret**: anyone holding it can act as the account. Do not e-mail it, paste it into chat or commit it.
5. Note the account's e-mail address (`…@….iam.gserviceaccount.com`).

**B. Give the account access in Search Console.**
1. In https://search.google.com/search-console choose the verified property (Domain property `upnext.co.zw` recommended).
2. Settings → Users and permissions → Add user → the service-account e-mail → permission **Owner**. The Indexing API requires owner-level access for the property; Owner also covers reading performance data and URL inspection. If the owner prefers least privilege for reading only, a second account with Restricted access can be used for Search Console data, but the Indexing API still needs Owner.
3. Only the property owner can do this. UPNEXT staff cannot and the application never changes Search Console permissions.

**C. Check the quota.** In the Cloud console open APIs & Services → Web Search Indexing API → Quotas. Google's default allowance is intended for testing; for production use Google asks you to request approval and quota. Read the real "publish requests per day" figure, then set `UPNEXT_INDEXING_DAILY_LIMIT` (default 150) comfortably below it. (The 200-a-day figure often quoted for the default could not be verified from Google's pages in this work: confirm it in the console.)

**D. Store the key (not in git).**
1. Make it one line: `python3 -c "import json,sys; print(json.dumps(json.load(open(sys.argv[1]))))" key.json`.
2. Put the line in the production env file or secret store as `UPNEXT_GOOGLE_SERVICE_ACCOUNT_JSON` (or mount the file and set `UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE`). Set `UPNEXT_SEARCH_CONSOLE_SITE` to the property exactly as Search Console names it (`sc-domain:upnext.co.zw` for a Domain property, `https://upnext.co.zw/` for a URL-prefix property).
3. Delete the downloaded file. Rotate the key (create a new one, replace the value, delete the old key in Cloud) if it is ever exposed or when someone with access leaves.
4. Leave `UPNEXT_INDEXING_ENABLED=false`.

**E. Prove the key works without sending anything.** From the worker container: `manage.py indexing_check --search-console` (loads the key, asks Google for tokens, sends nothing) and `manage.py indexing_status`. Open `/workspace/seo` as an Administrator: Search Console should change from *Setup required* to *Connected*. Fix the shown next step if it says Google refused.

**F. Switch submissions on (owner's decision).**
1. Record the written approval (decision register OQ-35).
2. Set `UPNEXT_INDEXING_ENABLED=true` and restart the worker. New publications, material updates, withdrawals, expiries and take-downs now queue and send within a worker cycle (about five minutes).
3. First submission of what is already live is deliberate: `manage.py indexing_backfill --dry-run`, then `manage.py indexing_backfill --limit 20`, then more on later days within the quota. Notifications queued while submissions were off are dropped after seven days, never sent late.
4. Watch `/workspace/seo` and `manage.py indexing_status`: *Queued* → *Accepted by Google* (or *Will retry*, *Failed* with the reason). Alerts: the `indexing` job appears in `core_jobrun`; a refusal by Google (401/403) shows it failed.

**G. Switch off or roll back.** Set `UPNEXT_INDEXING_ENABLED=false` and restart the worker. Queued rows wait harmlessly. Removing the account from Search Console also stops it.

**H. Reading the results honestly.** Four different things appear on `/workspace/seo`: *queued* (UPNEXT recorded it), *accepted by Google* (HTTP 200; not indexing), *indexed* (only Google's URL Inspection says this; the page shows it for a sample of five pages), and *impressions/clicks* (Search Analytics, about three days late). Do not treat the first two as proof of the last two. The Rich Results Test and the Job postings report in Search Console are the checks for markup validity.
