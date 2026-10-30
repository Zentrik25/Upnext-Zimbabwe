# Google Search Console and Bing Webmaster Tools: submission guide — DRAFT

Status: DRAFT. Do this only after the site is deployed at https://upnext.co.zw (Phase 7, separate written owner approval). Submitting a sitemap
asks search engines to look; it does not guarantee crawling, indexing, a Google Jobs listing or any ranking. The product names and menus below
change; if a screen differs, follow Google's and Microsoft's current help pages.

## 1. Before you submit (all on the live site)

1. `https://upnext.co.zw/` answers 200 over HTTPS with a valid certificate; `http://` redirects to `https://`; `www` is not used.
2. `https://upnext.co.zw/robots.txt` shows `Allow: /`, the private-area `Disallow` lines and `Sitemap: https://upnext.co.zw/sitemap.xml`.
3. `https://upnext.co.zw/sitemap.xml` returns 200, `application/xml`, and lists the home page, guides, six category lists and open listings (the privacy and terms pages appear only after the owner records legal approval, B-02).
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
1. Indexing → **Sitemaps** → enter `sitemap.xml` → Submit.
2. Status should read **Success**; the discovered URL count should match the sitemap. Fix any error shown there (the file is generated per request; there is no file to upload).

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
- Expiry: a listing that is closed, withdrawn or past its deadline loses its markup and is removed from the sitemap on the next sitemap build; the page itself says `noindex` and shows its status. Google may take days to reflect it in results. The Indexing API could speed this up; it is not used (see the report).

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
