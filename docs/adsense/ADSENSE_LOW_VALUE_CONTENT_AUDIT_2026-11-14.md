# AdSense "Low value content" audit and readiness report (2026-11-14) — DRAFT

Status: DRAFT (D-74). Prepared after Google AdSense rejected https://upnext.co.zw on 14 November 2026 for **Low value
content**. This is an evidence-based assessment, **not a prediction of Google's decision**: AdSense review is manual
and nothing here promises approval. Advertising was not enabled and no review was requested.

## 0. Method and limits

| Item | What was done | Limit |
|---|---|---|
| Live site | Fetched from this session on 2026-11-14 05:20–06:10 UTC after the owner approved network access to `upnext.co.zw` (personal cloud environment "Upnext-Zimbabwe"). Raw HTML of 42 URLs, the public API (`/api/v1/opportunities`, `/opportunities/{slug}`, `/sitemap`, `/locations`) and a rendered pass in Chromium at 390 px and 1280 px with axe-core (WCAG 2.1 A/AA). | Read-only GETs. No sign-in, no staff pages. |
| External links | Application and source links collected (22 hosts). | **BLOCKED**: the session's network policy refuses every other host (UNOPS, Nedbank, Hivos, Magaya Mining, `lnkd.in`, `ipcjobs.org`, Google policy pages). Their reachability is not verified. |
| Google accounts | — | **BLOCKED**: no access to AdSense, Search Console or CrUX. Field Core Web Vitals, index coverage and the exact AdSense notice text are not verified. |
| Rich Results Test | — | **BLOCKED** (Google host unreachable). JobPosting absence was confirmed from the HTML and the eligibility code instead. |
| Repository | Read decisions D-14, D-51, D-62, D-67 to D-73, the earlier `ADSENSE_READINESS_AUDIT.md` (D-72), code for the job page, sitemap, structured data, Indexing API eligibility and the job editor. | — |

Evidence files: `docs/adsense/evidence-2026-11-14/` (crawl, rendered audit, listing snapshot, sitemap, robots, ads.txt).

**Important correction to earlier documents:** `CLAUDE.md`, `LAUNCH_BLOCKERS.md` and D-72 say "nothing is deployed"
and "the catalogue holds only fictional demo data". On 2026-11-14 the site is **live**, serves real third-party
vacancies, and `/ads.txt` publishes `google.com, pub-5550288003651205, DIRECT, f08c47fec0942fa0`. The governance
documents need the owner to record when and how the deployment and the AdSense application happened (O-1 below).

## 1. Verdict

**FAIL — do not request another review yet.** The rejection is well supported by evidence. The site is technically
sound (fast, accessible, crawlable, correct robots and canonicals), but its content gives a reviewer little reason to
see it as more than a small, thinly attributed copy of other people's adverts:

1. **Very little content.** 10 open listings, 7 of them in one category; 4 of the 6 categories are empty; 6 short
   guides; `/locations` empty.
2. **Original value is not visible.** Listing pages reproduce the advert. Until this change there was no source,
   no publication date and no explanation of the verification label on the page (D-67 removed sources).
3. **Credibility problems in the content itself.** Listings marked **Verified** include an anonymous issuer with a
   Gmail address, a "Confidential" issuer whose apply button goes to a third-party job board while the text says
   WhatsApp, a title with a broken parenthesis, and a vacancy of the site operator's own company — while the site's
   own scam guide lists free webmail and WhatsApp-only contact as warning signs.
4. **Trust pages are visibly unfinished.** Privacy Policy and Terms are `noindex` pending legal review (B-02); the
   employer page calls the privacy notice "a draft awaiting owner and legal review"; About does not name the operator.
5. **A hidden data fault removes the site's search features.** The production place catalogue is empty, so no
   listing has a structured place, no page carries JobPosting markup, nothing is eligible for the Indexing API and
   the location directory is empty (ADS-T01).

Items 1, 3 and 4 need people (editors, the owner, a lawyer), not code. This change fixes what code can fix safely.

## 2. Page inventory (live, 2026-11-14)

| URL | HTTP | Indexable | Rendered words (main) | Findings |
|---|---|---|---|---|
| `/` | 200 | yes | 556 | Content streams in after "Loading …" placeholders (server-rendered in the same response; fine for Google, empty for non-JS readers). Shows 3 guides only. No About/operator statement. |
| `/opportunities` | 200 | yes | 325 | 10 listings. |
| `/opportunities?category=jobs` (`/jobs` 200, canonical to it) | 200 | yes | 262 | 7 listings. |
| `/opportunities?category=graduate-programmes` | 200 | yes | 160 | 3 listings. |
| `?category=internships`, `scholarships`, `tenders` (grants likewise) | 200 | **noindex, follow** | 84–88 | **Empty.** Correctly `noindex` and out of the sitemap (D-51), but linked from the home page and header as main sections. |
| `/categories` | 200 | yes | 96 | Directory of 6 categories, 4 empty. |
| `/locations` | 200 | **noindex, follow** | 43 | **Empty** (no places in production, ADS-T01). Linked from the main header. |
| `/guides` | 200 | yes | 226 | 6 guides. |
| 6 × `/guides/...` | 200 | yes | 342–452 | Accurate, original, Article data with dates; mostly about UPNEXT's own features, little Zimbabwe-specific career help (§5). |
| `/about` | 200 | yes | 219 | Does not name the operator, the team, the location or when the service started. |
| `/contact` | 200 | yes | 78 | Shows info@ and support@upnext.co.zw and the operator. `support@` conflicts with D-42 ("the only official mailbox is info@"). No phone or postal address. |
| `/employers` | 200 | yes | 216 | Says the privacy notice is "a draft awaiting owner and legal review". |
| `/privacy` | 200 | **noindex, follow** | 3,826 | Unreviewed (B-02); out of the sitemap. Has the third-party advertising disclosure. |
| `/terms` | 200 | **noindex, follow** | 2,060 | Unreviewed (B-02). Titled "Terms of Service"; footer says "Terms of Use". Still says each listing "shows its source" (D-67 note). |
| 15 × `/opportunities/{slug}` | 200 | 10 yes, 5 noindex (closed) | 221–572 | See §3. |
| `/sign-in`, `/register` | 200 | noindex | 29–99 | Correct (D-69). |
| `/opportunities?q=engineer` | 200 | noindex, follow; canonical `/opportunities` | 128 | Correct. |
| Unknown guide / employer | 404 | noindex | — | Correct. |

All 76 internal links found on these pages return 200. No public page loads any Google advertising script or the
`google-adsense-account` meta tag (verification is by `ads.txt` only).

## 3. Vacancy audit (all 15 listings in the sitemap on 2026-11-14)

No listing appears fictional or demo (no "Example …" issuer, no `@demo.upnext.example`). No duplicates found.
Abbreviations: **V** = labelled Verified; **src** = recorded sources; **place** = structured place.

| Listing | State | Problems found (confirmed from the API/page) | Proposed remediation (editor, via an amendment) |
|---|---|---|---|
| Accountant, Chabveka Solicitors | open to 4 Dec | V, 0 src, 0 place. Short description (42 words). | Record the source (where the advert was seen); select Harare; confirm verification method. |
| Artisan – Lines (Kariba), ZETDC | closed 13 Nov | Internal-candidates-only post published publicly; "ZETDC" vs "ZESA (Private) Limited" in text. | Leave closed; editorial rule: do not publish internal-only adverts. |
| Communications Officer (Graphic Design & Social Media, UNOPS | open to 26 Nov | **Title missing ")"**; **deadline 26 Nov vs "Closing Date: 22 November" in the instructions**; V, 0 src; "Home-based" not mapped to remote. | Correct the title; check the closing date on the UNOPS portal and fix one or the other; record the source. |
| Graduate Trainee – Civil Engineering, Mbire RDC | open to 23 Nov | **Thin**: description 4 words, requirements 12 words; Gmail application address; V, 0 src. | Add responsibilities and requirements from the original notice, or record why none were published; record the source; the webmail note now shows. |
| Junior Project Officer, Hivos | closed 13 Nov | Not verified, 0 src. | None (closed). |
| Leading Hand (Grade 11), Delta Beverages | closed 13 Nov | SEO title repeated the brand (fixed in code). | None (closed). |
| Merchandising Manager, "Confidential – Leading Harare FMCG Organisation" | closes 14 Nov | **Anonymous issuer labelled Verified**; **apply button → `ipcjobs.org` (a third-party job board) while the text says "send CVs via WhatsApp to 0777…"**; "Share this opportunity" copied text. Classic low-value copied listing. | Withdraw or let close; editorial rule: do not mark anonymous issuers Verified; never link a job board as the application destination. **Owner/editor approval needed; nothing was deleted.** |
| Graduate Trainees – 9 Disciplines, "Mutapa Gold Mines" | no deadline | Issuer name differs from text ("Mutapa Gold Resources"); 9 application links are `lnkd.in` shorteners; no closing date; V, 0 src. | Confirm the issuer's legal name; replace shortened links with the employer's own form links; add the closing date or state none was given; record the source. |
| Nurse Aides, Magaya Mining | no deadline | No closing date; employment type empty; location "Zimbabwe" only; long URL overflowed phones (fixed in code). | Add place and type from the original; record the source. |
| Graduate Trainee Programme 2027/2028, PROBFIX | closes 15 Nov | V, 0 src. | Record the source. |
| Procurement Officer, Nedbank | closed 13 Nov | Not verified. | None. |
| School Administrator / Project Coordinator, "Enrollin Classes" | no deadline | Gmail address `hospitalitytrain2026@…`; issuer not findable from the listing; V, 0 src; no closing date. | Re-check the issuer; if it cannot be confirmed, set Not verified or withdraw. |
| Senior Programmes Lawyer, "National Human Rights Organisation" | open to 20 Nov | **Anonymous issuer labelled Verified**, Gmail address `recruitmentnew2026@…`. | Set Not verified unless staff have confirmed the issuer directly; record the source. |
| Software Developer, **Zentrik Solutions** | open to 30 Nov | **Zentrik Solutions (Pvt) Ltd is the operator of UPNEXT** (`content/legal/operator.ts`). Labelled Verified with no disclosure. | Owner to confirm it is a real vacancy; disclose "posted by the operator of UPNEXT" or remove (O-6). |
| Truck Assistant (Grade 14), Delta Beverages | closed 13 Nov | SEO title repeated the brand (fixed in code). | None. |

Cross-cutting: **13 of 15 listings are Verified but only 2 have any source recorded**, and the public explanation of
"Verified" ("UPNEXT staff have checked this listing and marked it as verified") does not say what was checked. That is
an **unsupported verification claim** in the sense of the brief. Remediation: the owner defines what Verified requires
(the old P2-08 default was "issuer contact only") and editors re-check or downgrade every Verified listing (O-3).

Broken application links: **BLOCKED** (hosts unreachable from this session). Expired vacancies: 5 closed listings are
correctly `noindex`, out of lists and (after cache refresh) out of the sitemap.

## 4. Implemented in this change

| ID | Change | Files | Tests |
|---|---|---|---|
| F1 | **"About this listing"** on every job page: publication date and last update (when different); **original source** where one is recorded, with an https link (`rel="noopener nofollow"`) and the date it was seen, nothing when none is recorded (D-74, owner choice of 2026-11-14, supersedes D-67 for the job page only); the verification label explained in words with the check date and a link to the policy; for Not verified, advice to check with the organisation. | `components/opportunities/listing-record.tsx`, `job-view.tsx` | `tests/unit/job-view.test.tsx` (5 new, 3 updated) |
| F2 | **Free-webmail note**: when applications go to Gmail, Yahoo, Outlook and similar, a neutral note says so and asks the reader to confirm the vacancy first. Derived only from the recorded address. | `listing-record.tsx` | same |
| F3 | **Duplicate brand in titles** ("… \| UPNEXT Careers \| UPNEXT Careers") removed: a staff SEO title that already ends with the brand is trimmed before the layout adds it. Live on 4 listings. | `lib/brand.ts`, `opportunities/[slug]/page.tsx` | `job-view.test.tsx` |
| F4 | **Phone overflow**: long unbroken text in a listing (a pasted URL) wraps instead of widening the page (confirmed on the Nurse Aides listing at 390 px). | `job-view.tsx` | rendered check below |
| F5 | **Preflight warning** when the place catalogue is empty (`check_production_config`), naming `manage.py seed_taxonomies`. A warning, never a block. | `apps/api/core/preflight.py` | `tests/test_preflight.py` (1 new) |
| F6 | Six **guide drafts** with Zimbabwe-specific content for editorial review; **not published**. | `docs/editorial/drafts/` | — |

Not changed: URLs, robots, canonicals, sitemap rules, JobPosting rules, the Indexing API, ad code (stays off), legal
text, any listing, the staff workspace and employer dashboard styling. Google for Jobs and Indexing API
infrastructure is untouched; F5 and O-2 make it able to work.

## 5. Content-quality assessment

| # | Check | Result | Evidence / reason |
|---|---|---|---|
| C1 | Enough substantive content for a review | **FAIL** | 10 open listings; 4 of 6 categories empty; 6 guides of 340–450 words |
| C2 | Original value beyond reproduced adverts | **FAIL → partly addressed** | F1/F2 add UPNEXT's own record and guidance to every listing; sources are recorded for only 2 of 15 |
| C3 | Accurate verification claims | **FAIL** | 13 Verified, 2 with a source; anonymous and webmail issuers Verified (§3) |
| C4 | Listing completeness | **FAIL** | Mbire 4-word description; 3 open listings without a deadline; UNOPS date conflict; broken title |
| C5 | No copied low-value listings | **FAIL** | Merchandising Manager (anonymous, job-board link, WhatsApp) |
| C6 | No fictional or demo listings | **PASS** | none found |
| C7 | No duplicates | **PASS** | none found |
| C8 | Expired listings handled | **PASS** | closed pages `noindex`, out of lists; sitemap refreshes (see T6) |
| C9 | Career guides useful and Zimbabwe-specific | **FAIL → drafts ready** | live guides mostly describe the product; drafts in `docs/editorial/drafts/` await review |
| C10 | Ongoing curation visible | **FAIL → partly addressed** | dates now visible on listings (F1); guides dated; 4 empty sections in main navigation |
| C11 | Conflict of interest disclosed | **FAIL** | operator's own vacancy not disclosed (O-6) |

## 6. Technical assessment

| # | Check | Result | Evidence |
|---|---|---|---|
| T1 | Server-rendered content | **PASS** | listing and guide text in the first response (streamed Suspense); "Loading …" placeholders only for non-JS readers |
| T2 | Mobile usability | **PASS after F4** | no horizontal scroll at 390 px except Nurse Aides (fixed, re-checked locally against live data) |
| T3 | Broken internal links | **PASS** | 76/76 internal links 200 |
| T4 | Broken external/application links | **BLOCKED** | hosts unreachable; `lnkd.in` and `ipcjobs.org` are quality problems regardless |
| T5 | Search | **PASS** | `/opportunities?q=` works, `noindex, follow`, canonical to the list |
| T6 | Sitemap accuracy | **PASS (minor note)** | 25 URLs at 06:00 UTC, only indexable pages; once after 7 h idle the web tier served a stale copy listing 5 just-closed jobs (stale-while-revalidate, `UPNEXT_SITEMAP_CACHE_SECONDS=300`); the next request was correct. Low severity: those pages say `noindex` |
| T7 | Canonicals | **PASS** | every indexable page self-canonical; `/jobs` → category list |
| T8 | Robots directives | **PASS** | private areas disallowed; legal pages `noindex` by design until B-02 |
| T9 | Structured data — JobPosting | **FAIL (data)** | **0 of 10 open jobs** carry JobPosting: production has **no places** (`/api/v1/locations` → `[]`), so no listing states a place (D-51 rule). Root cause ADS-T01; fix O-2 |
| T10 | Structured data — other | **PASS** | Organization, WebSite, BreadcrumbList, Article with visible dates |
| T11 | Indexing API | **BLOCKED (data)** | infrastructure intact; nothing is eligible until T9 is fixed; live mode is the owner's decision (D-68) |
| T12 | Empty category/location pages | **PASS (handling) / FAIL (navigation)** | empty pages are `noindex` and out of the sitemap, but `/locations` and 4 empty categories are prominent in the header and home |
| T13 | Core Web Vitals | **PASS (lab only)** | Chromium, 390 px, unthrottled: LCP 0.3 s (job, guide, list) to 1.5 s (home), CLS 0, TTFB 0.2–0.7 s. Field data **BLOCKED** |
| T14 | Accessibility | **PASS (automated)** | axe WCAG 2.1 A/AA: 0 violations on 40 live pages and on the changed job pages; manual audit still open (B-10) |
| T15 | AdSense site verification | **PASS** | `/ads.txt` correct; no ad script on any page (D-72 mode off); account-side status **BLOCKED** |
| T16 | Titles | **PASS after F3** | duplicate brand on 4 listings fixed |

## 7. Trust and transparency

| # | Item | Result | Note |
|---|---|---|---|
| R1 | About UPNEXT | **FAIL** | does not say who runs the service (Zentrik Solutions (Pvt) Ltd, Zimbabwe, per `operator.ts`), why, or how editors work; owner to approve wording (O-4) |
| R2 | Contact | **PASS with conflict** | addresses and operator shown; `support@` vs D-42 single-address rule (O-5); no phone/postal address (only if the owner wants them) |
| R3 | Privacy Policy | **BLOCKED** | legal review B-02; `noindex` |
| R4 | Terms of Use | **BLOCKED** | legal review B-02; title mismatch and D-67 wording |
| R5 | Verification policy | **FAIL → partly addressed** | the guide and the job page now explain the label and date; the policy itself (what Verified requires) is undefined (O-3) |
| R6 | Report a job | **PASS** | every listing links to `/opportunities/{slug}/report` |
| R7 | Employer verification explanation | **PASS** | `/employers` explains organisation checks and separate listing labels |
| R8 | Public "draft" wording | **FAIL** | `/employers` calls the privacy notice a draft; resolves with B-02 |

## 8. Owner decisions required

| ID | Decision | Why it matters |
|---|---|---|
| O-1 | Record the production deployment and the AdSense application in the register; update `CLAUDE.md`, `LAUNCH_BLOCKERS.md` B-08/B-09 | governance documents say nothing is deployed |
| O-2 | Approve running `python manage.py seed_taxonomies` in production, then have editors amend each open listing so its place is matched (the editor already matches "Harare", "Kariba", "Shamva" etc. when a listing is saved) | restores JobPosting, Indexing API eligibility, `/locations` and the Harare/Bulawayo landing pages |
| O-3 | Define what **Verified** requires (method and evidence), then editors re-check or downgrade the 13 Verified listings | unsupported verification claims |
| O-4 | Approve an About text naming the operator and the editorial process | trust |
| O-5 | Confirm whether `support@upnext.co.zw` is official (D-42 says info@ only) | consistency |
| O-6 | Confirm the Zentrik Solutions vacancy is real and choose disclosure or removal | conflict of interest |
| O-7 | Approve, edit or reject the guide drafts and the two new guide paths | original content |
| O-8 | Decide whether empty sections (Internships, Scholarships, Tenders, Grants, Locations) stay in the main navigation while empty | reviewers see empty sections first |
| O-9 | Complete the legal review (B-02) and publish Privacy/Terms as indexable | trust; AdSense privacy requirement |
| O-10 | Approve D-74 (this change) | register |

## 9. Remaining risks

- **Volume.** Even with every fix, 10 listings is a small site. A reviewer is more likely to see sustained value
  after several weeks of daily, attributed, complete listings across categories and the reviewed guides.
- **Copied content.** Listings remain third-party adverts; their value depends on the record, checks and guidance
  UPNEXT adds and on recording sources consistently (only 2 of 15 today).
- **Unverified links** (T4) and **field vitals** (T13) remain unchecked.
- **Self-listing** by the operator may be read as low-quality or misleading until disclosed.

## 10. Readiness checklist before requesting another review

- [ ] D-74 approved and this change deployed (F1–F5) — Phase 7 approval rules apply
- [ ] `seed_taxonomies` run; open listings amended with places; JobPosting visible on open jobs (Rich Results Test)
- [ ] Verified policy defined; every Verified listing re-checked; sources recorded on every listing
- [ ] Listing fixes in §3 made (UNOPS title/date, Mbire content, Mutapa links/issuer, Merchandising Manager, Enrollin, Senior Programmes Lawyer, Zentrik disclosure)
- [ ] Guide drafts reviewed, facts verified, published; About text published
- [ ] Privacy and Terms reviewed and indexable (B-02); "draft" wording removed from `/employers`
- [ ] Empty sections handled (O-8)
- [ ] Several weeks of steady publishing with sources and complete details
- [ ] Live re-check of every item in §5–§7 from outside (including application links and Search Console coverage)
- [ ] Only then request review; do not enable ads before approval and the CMP decision (AS-B06)
