# AdSense readiness audit and fixes (2026-11-16) — DRAFT

Status: DRAFT (D-79). Follows `ADSENSE_LOW_VALUE_CONTENT_AUDIT_2026-11-14.md`. It records what was found on the
live site on 16 November 2026, what this change fixes in code, and what still needs the owner and the editors.
**It is not a prediction of Google's decision.** No review was requested, nothing was deployed and advertising stays off.

## 1. What could and could not be checked

| Item | Result |
|---|---|
| AdSense account (Sites status, Policy Center, the rejection notice) | **NOT VERIFIED**: no account access. The only recorded reason is the owner's report of 14 November: "Low value content" (D-74). |
| Search Console (the reported exclusions) | **NOT VERIFIED** in the account. Representative addresses were checked from outside (§4). |
| Google policy pages | Read on 2026-11-16 from `support.google.com`: answers 7299563 (site readiness), 12131223 and 12169212 (sites and verification), 7584263 (connect your site), 81904 (account not approved), 13554116 (consent platforms), publisher policies 11112688 (no content, low value, under construction) and 11190248 (replicated content). |
| Live site | 97 addresses fetched (status, robots, canonical, text); 31 pages rendered in Chromium on a phone (Pixel 7) and a desktop (1280 px); every listing read through the public API. Read-only. |
| Outbound application links | **NOT VERIFIED**: other hosts are unreachable from the audit environment. |

## 2. What Google's pages require (and what they do not)

- **No minimum** traffic, number of pages or articles, word count or site age is stated on any of the pages read.
  None is treated as a requirement here.
- Readiness (7299563): "unique content that's relevant to your visitors", "clear, easy-to-use navigation", and "It's
  really important that you contribute your own original content".
- Publisher policy 11112688: no Google-served ads on screens "without publisher-content or with low-value content",
  "that are under construction"; "Ads should not be placed on 'dead end' or no content screens".
- Publisher policy 11190248: no ads on screens "with embedded or copied content from others without additional
  commentary, curation, or otherwise adding value to that content".
- Not approved (81904): "we may review all pages of your site"; navigation problems include "redirects, pages behind
  a login or restricted access, broken links ... and pages under construction or not yet launched".
- Verification (12169212, 7584263): the AdSense code snippet, the ads.txt snippet or the meta tag
  `<meta name="google-adsense-account" content="ca-pub-...">`; changes must be "accessible by the AdSense ads
  crawler (Mediapartners-Google and Google-Display-Ads-Bot)"; "You can only serve ads on a site after it has passed
  our review".
- Consent (13554116): a Google-certified consent platform integrated with the IAB TCF is required "when serving
  personalized ads to users" in the EEA and the UK (since 16 January 2024) and Switzerland (since 31 July 2024).

## 3. Findings on the live site

| # | Finding | Evidence | Cause | Status |
|---|---|---|---|---|
| A1 | The main navigation leads to empty sections | Header "Locations" → `/locations`: "Locations are not available right now". Header and phone tab "Career Insights" → `/insights`: "The first Career Insights articles are being written". Home chips, home category cards and footer → `/opportunities?category=tenders`, `scholarships`, `grants`: "0 opportunities". Home search shows an empty Location list | Template: fixed link lists | **FIXED in code** (§5) |
| A2 | One vacancy public twice, two cases | `/opportunities/transport-and-office-associate-6pkxba` and `/opportunities/acbf-transport-office-associate-harare`; `/opportunities/supply-assistant-nmk7k5` and `/opportunities/totalenergies-supply-assistant-harare` | Code: the duplicate check compared only within one organisation record and treated "Harare" and "Harare, Zimbabwe" as different places. Data: the same employer exists as several records (TotalEnergies 2, Chabveka Solicitors 2, National Foods Limited 3) | **Check FIXED in code**; the four pages need an editor (§6) |
| A3 | 35 of 36 open listings record no source | Public API `sources` is empty on all but `software-developer-p5qjrp` | Editorial backlog (the job page shows a source when one is recorded, D-74) | Editors |
| A4 | No listing has a structured place; no page carries JobPosting data; location pages and the five `/jobs/...` pages are empty or `noindex` | `/api/v1/locations` → `{"data":[]}`; 0 of 36 job pages contain JobPosting | Deployment data: `seed_taxonomies` was never run in production (D-75, approved in principle) | Owner (release step), then editors |
| A5 | 15 listings are labelled Verified from before the standard | `reverification_pending` on 15 listings | Editorial backlog (D-75) | Editors |
| A6 | Thin or incomplete listings | 11 listings with very short text; 5 with no closing date; 3 applying to free webmail; 1 with nine `lnkd.in` links | Editorial | Editors (§6) |
| A7 | Privacy Policy and Terms are `noindex` | `/privacy`, `/terms`: `noindex, follow` | Deliberate gate `UPNEXT_LEGAL_APPROVED` (D-76); the pages are public and complete, so a reviewer and the AdSense crawler can read them | Owner |
| A8 | `support@upnext.co.zw` is the contact address throughout `/privacy`, `/terms` and `/contact`, while D-42 names `info@` as the only official mailbox | Rendered pages | Wording and a fact only the owner knows (does the mailbox exist?) | Owner |
| A9 | `www.upnext.co.zw` does not resolve | DNS: no record; `deploy/verify.sh` asserts this on purpose | Deliberate | Owner may add a DNS record and a redirect at the shared edge; not required by any page read |
| A10 | Small original editorial content | Six guides of 340 to 450 words; no Career Insights article | Editorial | Editors |

Checked and sound: `http` → `https` 301; every one of the 52 sitemap addresses answers 200, is indexable and
self-canonical; trailing-slash addresses 308 to the canonical one; closed listings (7 checked) answer 200 with a
"Closed" banner, no Apply button, `noindex` and are out of lists and the sitemap; unknown addresses answer 404;
private pages redirect to sign-in; no page is stuck on a skeleton, none overflows a phone screen, no console error,
no third-party request, all 120 internal links resolve; `/ads.txt` answers 200 with
`google.com, pub-5550288003651205, DIRECT, f08c47fec0942fa0` (the format Google documents); no Google script and
no advertisement is served (the strict Content-Security-Policy is in force), so advertising is **off** in production.

## 4. The Search Console exclusions

These are Google Search reports. They do not block the AdSense review: the AdSense crawler has its own user agent
and is not affected by `noindex`; it needs the pages to be reachable, which they are.

| Report | Representative addresses | Source | Verdict |
|---|---|---|---|
| Blocked by robots.txt | `/saved`, `/dashboard`, `/for-you`, `/account`, `/alerts`, `/profile`, `/employer/...`, `/workspace`, `/api/v1/auth/google/start` (the Google sign-in link on `/sign-in`) | `app/robots.ts` | Deliberate (private pages and the API). Keep. No public content page is blocked |
| Excluded by noindex | `/sign-in`, `/register`, `/forgot-password`; `/opportunities?q=...`; closed listings; empty lists (`?category=tenders`, `scholarships`, `grants`); `/locations`, `/insights`, `/jobs/harare` and the other four landing pages; `/privacy`, `/terms`; `/design-system` | page metadata (D-51, D-68, D-69, D-76) | Deliberate for all but two groups: the legal pages (A7, owner switch) and the location and landing pages, which become indexable when places exist (A4) |
| Not found (404) | `/tenders`, `/scholarships`, `/internships`, `/companies`, `/cookies`, `/faq`, `/help`, `/health/` | no such page; none is linked from the site | Valid 404s. `/jobs` alone redirects (to the jobs list); short category addresses were declined in D-69 (c) |

## 5. Fixed in this change (code; local checks only, not deployed)

| ID | Change | Files | Tests |
|---|---|---|---|
| G1 | The navigation offers only sections that hold something: the header leaves out Locations while there are no places and shows Career Guides until an article is published; the phone tab opens the guides; the footer, the home shortcuts and the home category cards leave out empty categories; the home search hides an empty Location list. Sections return by themselves when they have content; their addresses keep working. Unknown (API unreachable) keeps the link | `lib/site-sections.ts`, `components/layout/site-header.tsx`, `site-footer.tsx`, `bottom-nav.tsx`, `components/home/sections.tsx`, `browse.tsx`, `app/layout.tsx`, `lib/catalog.ts` | `tests/unit/site-sections.test.tsx` (7), `sitelinks.test.tsx` |
| G2 | Duplicate check: the same employer under several organisation records is one employer (name without case, punctuation or legal form); a place written more or less precisely is the same place; the country alone is no place | `apps/api/opportunities/duplicates.py` | `tests/test_duplicate_detection.py` (4 new) |
| G3 | An organisation cannot be added, or renamed, to a name another record already has | `apps/api/catalog/staff_forms.py` | `tests/test_staff_catalog.py` (1 new) |
| G4 | Meta-tag verification: `UPNEXT_ADSENSE_MODE=meta` writes `<meta name="google-adsense-account" content="ca-pub-...">` on public pages (never sign-in or the workspace) and loads no Google script. ads.txt (already live) and the code snippet (`verify`) are unchanged | `lib/adsense.ts`, `app/layout.tsx`, `content/legal/privacy.ts` | `tests/unit/adsense.test.ts` |

Not changed: robots, sitemap rules, canonicals, the editorial workflow, any listing or legal wording, infrastructure,
the staff workspace and employer dashboard. A duplicate warning still never blocks publication.

## 6. Listings that need an editor

Every open listing lacks a structured place (after `seed_taxonomies`, re-saving matches it), and all but the
Zentrik Solutions one lack a recorded source. Beyond that:

| Address | Issuer | What is missing or wrong |
|---|---|---|
| `/opportunities/transport-and-office-associate-6pkxba` | African Capacity Building Foundation (ACBF) | **duplicate of `acbf-transport-office-associate-harare` (same vacancy, same deadline)** |
| `/opportunities/acbf-transport-office-associate-harare` | African Capacity Building Foundation (ACBF) | **duplicate of `transport-and-office-associate-6pkxba`**; labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/bata-ehs-officer-gweru` | Bata Zimbabwe | source and place only |
| `/opportunities/cure-community-mobilisation-officer-bulawayo` | CURE Children's Hospital of Zimbabwe | labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/chabveka-solicitors-office-cook-general-assistant` | Chabveka Solicitors | thin text (responsibilities 36 words, requirements 33) |
| `/opportunities/chabveka-solicitors-legal-intern-harare` | Chabveka Solicitors | thin text (responsibilities 29 words, requirements 49) |
| `/opportunities/accountant-a3n4am` | Chabveka Solicitors | thin text (responsibilities 42 words, requirements 45); labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/school-administrator-project-coordinator-z7vxnt` | Enrollin Classes | no closing date recorded; labelled Verified before the standard: re-verify or set Not verified; applications go to free webmail (hospitalitytrain2026@gmail.com) |
| `/opportunities/district-engineer-grade-10-f3ymgs` | Gutu Rural District Council | source and place only |
| `/opportunities/idss-it-technical-graduate-trainee-harare` | IDSS | source and place only |
| `/opportunities/nurse-aides-9ndkgz` | Magaya Mining | no closing date recorded; thin text (responsibilities 38 words, requirements 49); labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/msuas-cybersecurity-specialist-mutare` | Manicaland State University of Applied Sciences (MSUAS) | thin text (responsibilities 39 words, requirements 65) |
| `/opportunities/msuas-chief-software-developer-mutare` | Manicaland State University of Applied Sciences (MSUAS) | thin text (responsibilities 45 words, requirements 65) |
| `/opportunities/msuas-systems-analyst-mutare` | Manicaland State University of Applied Sciences (MSUAS) | thin text (responsibilities 42 words, requirements 64) |
| `/opportunities/masvingo-polytechnic-caretaker` | Masvingo Polytechnic | no application link or address, instructions only |
| `/opportunities/graduate-trainee-civil-engineering-phduf3` | Mbire Rural District Council | thin text (responsibilities 4 words, requirements 12); labelled Verified before the standard: re-verify or set Not verified; applications go to free webmail (mbirerdcrecruitment@gmail.com) |
| `/opportunities/msu-data-analytics-developer-gweru` | Midlands State University (MSU) | source and place only |
| `/opportunities/mutapa-gold-resources-graduate-trainees-2026` | Mutapa Gold Mines | no closing date recorded; thin text (responsibilities 49 words, requirements 42); labelled Verified before the standard: re-verify or set Not verified; application links are `lnkd.in` shorteners: replace with the employer's own form addresses; no application link or address, instructions only |
| `/opportunities/national-foods-fabricator-stockfeeds-harare` | National Foods Limited | thin text (responsibilities 103 words, requirements 24) |
| `/opportunities/national-foods-millwright-stockfeeds-harare` | National Foods Limited | source and place only |
| `/opportunities/national-foods-workshop-foreman-stockfeeds` | National Foods Limited | source and place only |
| `/opportunities/senior-programmes-lawyer-1-post-skx7p4` | National Human Rights Organisation | labelled Verified before the standard: re-verify or set Not verified; applications go to free webmail (recruitmentnew2026@gmail.com) |
| `/opportunities/head-of-electronics-division-uv7tca` | Peace Security Company (Pvt) Ltd | source and place only |
| `/opportunities/sos-childrens-villages-laboratory-assistant-bindura` | SOS Children's Villages Zimbabwe | source and place only |
| `/opportunities/sable-press-warehouse-assistant-harare` | Sable Press (Pvt) Ltd | no closing date recorded |
| `/opportunities/electrician-xwkh6c` | St John's Educational Trust | labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/thru-zim-data-manager-harare` | The Health Research Unit Zimbabwe (THRU-ZIM) | source and place only |
| `/opportunities/totalenergies-supply-assistant-harare` | TotalEnergies Marketing Zimbabwe | **duplicate of `supply-assistant-nmk7k5`**; labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/supply-assistant-nmk7k5` | TotalEnergies Marketing Zimbabwe (Private) Limited | **duplicate of `totalenergies-supply-assistant-harare`; no closing date here, 29 Nov on the other copy; no requirements**; no closing date recorded; thin text (responsibilities 168 words, requirements 0) |
| `/opportunities/unesco-secretarial-assistant-g5-harare` | UNESCO | source and place only |
| `/opportunities/senior-administrative-assistant-g-6-3hjyqb` | UNESCO | labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/communications-officer-graphic-design-social-media-49h3qe` | United Nations Office for Project Services (UNOPS) | labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/windmill-administration-clerk-harare` | Windmill (Pvt) Ltd | source and place only |
| `/opportunities/software-developer-p5qjrp` | Zentrik Solutions | labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/director-finance-and-administration-md2954` | Zimbabwe National Statistics Agency (ZIMSTAT) | labelled Verified before the standard: re-verify or set Not verified |
| `/opportunities/director-human-resources-82p7rz` | Zimbabwe National Statistics Agency (ZIMSTAT) | labelled Verified before the standard: re-verify or set Not verified |

For each duplicate pair keep the fuller, correctly attributed copy and withdraw the other (a withdrawn page stays
reachable, says so, and is `noindex`). The duplicate organisation records (TotalEnergies, Chabveka Solicitors,
National Foods Limited) need merging by an Administrator; no merge screen exists yet.

## 7. Advertising and consent

Advertising is off and stays off: Google serves nothing before approval ("You can only serve ads on a site after it
has passed our review"). Before `UPNEXT_ADSENSE_MODE=live`: the site shows "Ready" in AdSense; a Google-certified
consent platform is chosen in AdSense "Privacy & messaging" if visitors from the EEA, the UK or Switzerland are to
see personalised ads (the built-in prompt is not certified; AS-B06 is still open); ad units exist and their ids are
set. The Content-Security-Policy for live ads is untested against real ad output
(`docs/engineering/ADSENSE_SITE_VERIFICATION.md` item 5).
