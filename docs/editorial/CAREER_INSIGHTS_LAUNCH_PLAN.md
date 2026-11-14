# Career Insights: guide review and editorial launch plan — DRAFT

Status: DRAFT (D-74) for the owner's editorial decision. **Nothing here is published or scheduled.** Each article
needs research, writing, fact-checking against primary sources, a second person's review and the owner's approval
before it goes live. No minimum word count is set: an article is as long as the reader's problem needs.

## 0. Is there a Career Insights CMS?

**Decided 2026-11-14 (O-11, D-75): a full article CMS (option B).** Implementation plan:
`CAREER_INSIGHTS_CMS_PLAN.md`. The comparison below is kept as the record of the choice.

No. The repository has no "Career Insights" model, API, page or document (searched on 2026-11-14). Editorial content
today is six guides written as static pages (`apps/web/src/app/guides/*/page.tsx`, listed in `src/lib/guides.ts`,
with Article and BreadcrumbList data, dates, sitemap entries and an optional mid-guide ad slot). Two ways forward, for
the owner:

| Option | What it means | Fits when |
|---|---|---|
| **A. Keep static pages (recommended for launch)** | Each article is a reviewed commit: page file, entry in `guides.ts`, sitemap and Article data follow automatically. Editorial review happens in the pull request | fewer than ~2 articles a week; editors comfortable with a developer publishing |
| B. Build a Career Insights CMS | Articles stored in the database, written and reviewed in `/workspace` with the same separation of duties as listings (author ≠ approver), revisions, scheduled publication off | sustained publishing by non-developers; needs its own decision, design and tests |

Either way the URL pattern stays `/guides/<slug>` (no new top-level route), and the name "Career Insights" can be a
section heading on `/guides` without changing addresses.

## 1. Review of the six published guides

| Guide | What is good | What is thin or generic | Substantive improvement |
|---|---|---|---|
| How to find jobs in Zimbabwe | accurate | mostly a manual for the search page; nothing on where Zimbabwean employers advertise | replace with draft 01 (`docs/editorial/drafts/`) |
| How to apply safely and avoid recruitment scams | concrete warning signs | no Zimbabwe-specific channels (police, mobile money) and no step-by-step check | keep; add the new guide "How to verify a recruitment advertisement" (draft 02) and link both ways |
| How UPNEXT Careers checks and verifies listings | honest about limits | cannot say what "Verified" requires because the policy is undefined (O-3) | rewrite once O-3 is decided; then it is the public verification policy |
| How to apply for graduate trainee programmes | sound structure | generic; no worked eligibility rules or certification advice | draft 04 |
| How to prepare a CV for employers in Zimbabwe | practical | little that is specific to Zimbabwean adverts (O/A Levels, certified copies, clearances) | draft 03 |
| Where to find engineering internships and attachments | useful approach letter | no explanation of attachment practice or professional registration | draft 05 |

## 2. Twelve articles for launch

Priority: **P1** = closes a reader need the live listings create today; **P2** = strengthens a category; **P3** =
broadens reach. "Original research" is work UPNEXT does itself (counting, comparing, asking), which is what makes an
article more than a rewrite. Primary sources are named as bodies, not links: the editor finds and opens the official
page.

### 1. How to verify a recruitment advertisement in Zimbabwe — P1
- **Audience:** every job seeker, especially first-time applicants.
- **Problem solved:** "Is this advert real before I send my documents?"
- **Original research:** review a sample of reported or rejected adverts (anonymised) for the most common warning
  signs; test how quickly employers answer a verification call or e-mail.
- **Primary sources:** Zimbabwe Republic Police (fraud reporting); the United Nations' public statement on free
  recruitment; POTRAZ or the Cyber and Data Protection Act [Chapter 12:07] for personal data.
- **Structure:** six checks in order (draft 02) → what to do if it fails → how UPNEXT labels listings.
- **Related categories:** all.

### 2. Where Zimbabwean employers actually advertise vacancies — P1
- **Audience:** job seekers starting a search.
- **Problem solved:** knowing which channels carry real, current vacancies.
- **Original research:** for one month, record where each listing UPNEXT publishes was first found (now possible
  because sources are recorded): employer site, portal, newspaper, notice, social media; publish the breakdown.
- **Primary sources:** Public Service Commission and Health Service Board recruitment pages; employers' career
  portals; newspaper classified sections.
- **Structure:** channels by sector → how to watch each → the month's figures → pitfalls of reposts.
- **Related categories:** jobs, graduate programmes.

### 3. Understanding common requirements in Zimbabwean job adverts — P1
- **Audience:** school leavers, graduates, career changers.
- **Problem solved:** decoding "5 O Levels including English and Maths", "certified copies", "contactable referees",
  "police clearance", "internal candidates".
- **Original research:** count how often each requirement appears in UPNEXT's listings over a period.
- **Primary sources:** ZIMSEC (what a pass means); ZRP (police clearance process); a Commissioner of Oaths or the Law
  Society for certification practice.
- **Structure:** phrase → meaning → what to send (draft 06).
- **Related categories:** jobs, internships, graduate programmes.

### 4. Graduate trainee programmes in Zimbabwe: eligibility rules decoded — P1
- **Audience:** final-year students and recent graduates.
- **Problem solved:** knowing quickly which programmes they qualify for.
- **Original research:** table of the eligibility rules (age limit, degree class, graduation window, programme
  length) across every graduate programme UPNEXT lists in a season.
- **Primary sources:** the programmes' own notices and employer pages.
- **Structure:** the rules seen this season → how to read each → a two-week application plan (draft 04).
- **Related categories:** graduate programmes.

### 5. Preparing a CV that Zimbabwean employers can screen in a minute — P1
- **Audience:** all applicants.
- **Problem solved:** CVs that hide the requirements the screener is ticking.
- **Original research:** ask three or four Harare recruiters or HR officers (on the record or anonymised) what they
  check first; one worked before/after example.
- **Primary sources:** ZIMSEC and HEXCO qualification names; professional bodies' membership terminology.
- **Structure:** what screeners look for → section by section → worked example → sending it (draft 03).
- **Related categories:** all employment categories.

### 6. Industrial attachment for engineering students: a practical guide — P2
- **Audience:** engineering students at universities and polytechnics.
- **Problem solved:** finding and securing an attachment place in time.
- **Original research:** compare attachment length and paperwork across three or four institutions' handbooks;
  list sectors that took attachés in UPNEXT's records.
- **Primary sources:** institutions' attachment offices; Engineering Council of Zimbabwe; Zimbabwe Institution of
  Engineers.
- **Structure:** how attachment works → where placements come from → the letter → registration later (draft 05).
- **Related categories:** internships, graduate programmes.

### 7. Applying to NGO and United Nations jobs from Zimbabwe — P2
- **Audience:** graduates and professionals targeting development work.
- **Problem solved:** different systems (portals, competency questions, contract types such as consultancies).
- **Original research:** walk through two real application portals step by step; note documents asked for.
- **Primary sources:** the agencies' own recruitment pages and their published contract-type definitions.
- **Structure:** contract types → the portal → competency-based answers → scams that impersonate the UN.
- **Related categories:** jobs (NGO landing page).

### 8. Public service and local authority jobs: how recruitment works — P2
- **Audience:** applicants to government, councils and parastatals.
- **Problem solved:** postal applications, reference numbers, long timelines.
- **Original research:** document the steps from three council or parastatal adverts UPNEXT published.
- **Primary sources:** Public Service Commission; Health Service Board; the Urban Councils Act and Rural District
  Councils Act only if an editor confirms what they say about recruitment.
- **Structure:** who recruits whom → reading the notice → postal and hand delivery → what happens after.
- **Related categories:** jobs, graduate programmes.

### 9. Scholarships for Zimbabwean students: how to judge an offer — P2
- **Audience:** school leavers and graduates seeking funding.
- **Problem solved:** telling real scholarships from fee-charging schemes; preparing documents.
- **Original research:** list of documents asked for across scholarships UPNEXT lists; fee and deadline patterns.
- **Primary sources:** funders' own pages; Ministry of Higher and Tertiary Education announcements where relevant.
- **Structure:** types of funding → red flags → documents → timeline.
- **Related categories:** scholarships (currently empty: publish when the category has listings).

### 10. Responding to tenders as a small business in Zimbabwe — P3
- **Audience:** SMEs and sole traders.
- **Problem solved:** understanding a tender notice and avoiding disqualification on paperwork.
- **Original research:** checklist of documents demanded across tenders UPNEXT lists.
- **Primary sources:** Procurement Regulatory Authority of Zimbabwe (PRAZ) and the Public Procurement and Disposal of
  Public Assets Act — an editor confirms current registration rules before stating them.
- **Structure:** reading the notice → registration → the bid file → common rejections.
- **Related categories:** tenders (currently empty).

### 11. Your rights when you apply for a job in Zimbabwe — P3
- **Audience:** all applicants.
- **Problem solved:** what an employer may ask for and what happens to personal data sent with an application.
- **Original research:** none beyond the law; reviewed by a qualified Zimbabwean legal adviser before publication.
- **Primary sources:** Labour Act [Chapter 28:01]; Cyber and Data Protection Act [Chapter 12:07]; POTRAZ guidance.
- **Structure:** questions an employer may and may not ask → your data → where to complain.
- **Related categories:** all. **Needs legal review (same reviewer as B-02).**

### 12. Starting salaries in Zimbabwe: what adverts actually say — P3
- **Audience:** graduates and entry-level applicants.
- **Problem solved:** knowing what pay to expect, and what "competitive" means.
- **Original research:** count how many UPNEXT listings state pay, in which currency and period, by category, over a
  quarter; no figures beyond what adverts state.
- **Primary sources:** UPNEXT's own listing records; ZIMSTAT only if its published wage data is current and cited.
- **Structure:** how often pay is stated → ranges where stated → how to ask about pay.
- **Related categories:** jobs, graduate programmes. Publish only when enough listings state pay to say something
  honest.

## 3. Sequence

1. P1 articles 1–5 (drafts 01–06 cover most of the writing) after their facts are verified.
2. P2 articles 6–9 as the matching categories gain listings.
3. P3 articles 10–12 when their research data exists and, for 11, after legal review.

A steady rhythm matters more than a launch burst: for example one reviewed article a week, each linked from the job
categories it serves ("Career resources" on the lists already links the guides by category).
