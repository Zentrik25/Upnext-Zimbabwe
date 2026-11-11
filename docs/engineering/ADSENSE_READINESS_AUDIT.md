# Google AdSense readiness audit (2026-11-10) — DRAFT

Status: DRAFT (D-72). An engineering and content assessment against Google's published AdSense eligibility and
programme policies, made from the repository and a local production build. **It is not a prediction of Google's
decision**: AdSense review is manual and Google gives no guarantee. The live site could not be reached from this
session (see `SEO_AUDIT_2026-11-10.md` §0), so everything about production is NOT VERIFIED.

The technical integration (off by default, `verify`/`live` modes, page allow-list, consent prompt, `ads.txt`, CSP)
is documented in `ADSENSE_SITE_VERIFICATION.md` and is not repeated here.

## 1. Verdict

**Not ready to apply.** Three blockers are content and governance, not code: there is no real content (B-09), the
legal pages are unreviewed drafts that do not yet name the operator (B-02), and advertising contradicts two binding
decisions until the owner supersedes them. The code side is ready to stay switched off and, after those steps, to be
enabled without touching other pages.

## 2. Blockers (must be resolved before an application)

| ID | Area | Finding | Evidence | Who |
|---|---|---|---|---|
| AS-B01 | Decision | Advertising is a Release 1 non-goal (PRD, `SPEC_V1_RECONCILIATION` S22) and P4-04 says no advertising or tracking service and no consent banner. No register entry supersedes them | `ADSENSE_SITE_VERIFICATION.md` "Conflict with binding decisions" | Owner |
| AS-B02 | Content | The catalogue holds only fictional demo data (B-09). An application reviewed against demo listings would be reviewed against content that is not real; publishing demo listings as real would be misleading | `LAUNCH_BLOCKERS.md` B-09 | Owner, editors |
| AS-B03 | Trust | Privacy Policy and Terms are drafts with bracketed gaps (operator, legal bases, rights routes, minimum age, transfers, liability, governing law) and are `noindex` until `UPNEXT_LEGAL_APPROVED=true`. AdSense requires a privacy policy that discloses third-party advertising cookies; v1.2 has the text but has not had legal review | `LAUNCH_BLOCKERS.md` B-02; `app/privacy/page.tsx` | Owner, lawyer |
| AS-B04 | Trust | Site ownership: the operator's legal identity is not stated anywhere (part of B-02) | B-02 | Owner |
| AS-B05 | Trust | Contact address is hidden until the owner confirms `info@upnext.co.zw` receives mail (B-03) | `app/contact/page.tsx`, B-03 | Owner |
| AS-B06 | Consent | The built-in prompt is not a Google-certified consent management platform. Google requires a certified CMP for serving ads to visitors in the EEA, the UK and Switzerland; confirm the current requirement in the AdSense account and integrate one or restrict serving | `ADSENSE_SITE_VERIFICATION.md` item 3 | Owner |
| AS-B07 | Deployment | Nothing is deployed (Phase 7 approval needed); `/ads.txt` reaching the web app through Traefik/Nginx is untested | B-08 | Owner |

## 3. Content quality

| Check | Assessment | Evidence |
|---|---|---|
| Original, useful content | **Partly.** Six original editorial guides (three new, DRAFT wording) and About, verification and safety explanations. Listings themselves are third-party notices | `lib/guides.ts` |
| Complete opportunity descriptions | Enforced by validation before submission; empty optional facts are not drawn (D-71) | `VALIDATION_SPEC.md`, job view |
| Source attribution | **Risk.** D-67 removed every visible source from the public site. Google may treat republished vacancy notices without attribution as copied or low-value content. Recommendation for the owner: reconsider D-67 at least for the job page ("Originally published by …" with a link), or ensure each listing carries original editorial value (checked facts, verification label, safety notes) | D-67 |
| No empty or placeholder pages | Lists and landing pages with too few listings are `noindex` and carry no ads; ad slots render nothing without a real slot id; no "lorem" text in public pages | D-68 landing rules; `ad-slot.tsx` |
| No automatically generated low-value content | Landing pages hold only real listings selected by recorded facts; no generated articles; no FAQ markup | `collections.py`; guide tests assert no `FAQPage` |
| Copied notices presented as editorial work | Listings are labelled with their issuer and verification status, not presented as UPNEXT editorial; the guides are UPNEXT's own | job view |

## 4. Trust and transparency

| Check | Status |
|---|---|
| About page | Present, indexable, describes the service and verification |
| Contact page | Present; address shown only after B-03 |
| Privacy Policy with advertising disclosure | Text present (v1.2, section 6A); **not legally reviewed**; `noindex` until approval (still reachable by people and reviewers) |
| Terms of Use | Present as draft; advertising not reviewed |
| Cookie information and consent | First-party prompt inside the ad block before any Google request; not a certified CMP (AS-B06) |
| Verification explanations | Guide "How listings are verified"; labels on every listing (D-14, D-62) |
| Scam reporting | "Report this opportunity" on every listing; safety guide; contact page |
| No misleading application promises | UPNEXT does not receive applications and says so; `directApply: false` |

## 5. Website quality and ad placement safety

| Check | Status | Evidence |
|---|---|---|
| Mobile layout | No horizontal scroll at 320–1440 px on public pages; new guides checked at 320, 390, 1280 px | e2e a11y suite; this session's axe run |
| Speed | Lab Lighthouse 97–98 on main public pages; field data NOT VERIFIED | `SEO_AUDIT_2026-11.md` §6 |
| Accessible navigation | axe clean in CI; manual assistive-technology audit not done (B-10) | B-10 |
| No popups, no intrusive ads | No interstitials, no sticky or fixed ads, reserved height (no layout shift) | `ad-unit.tsx` |
| Ads never next to Apply, listing cards, employer links, navigation or downloads | Only two placements: after the job description (away from Apply/Save/Share and How to apply) and mid-guide (away from the "More guides" links); a test pins the only files that may render an ad | `ad-rules.ts`, `ad-rules.test.ts` |
| No ads on private, staff, employer or account pages | Allow-list of two path patterns; the slot re-checks the real request path | `ad-rules.ts`, `ad-slot.tsx` |
| Labelled ads | "Advertisement" label, bordered box | `ad-unit.tsx` |
| Publisher id and ads.txt | Never invented; `/ads.txt` 404 until `UPNEXT_ADSENSE_CLIENT` holds a valid `ca-pub-` id | `app/ads.txt/route.ts` |

## 6. Path to an application (in order)

1. Owner decision superseding the non-goal and P4-04 (AS-B01), recorded in the register.
2. Real, reviewed content: listings entered and verified by staff, plus the guides approved (AS-B02).
3. Legal review of Privacy and Terms, operator identity named, `UPNEXT_LEGAL_APPROVED=true` (AS-B03, AS-B04).
4. Contact mailbox confirmed (AS-B05); decide on source attribution (§3).
5. Phase 7 deployment; check `/ads.txt`, `/privacy`, `/about`, `/contact` from outside.
6. Set only `UPNEXT_ADSENSE_CLIENT` and request review using the ads.txt method (no Google script on pages).
7. After approval: certified CMP decision (AS-B06), ad units, slot ids, `UPNEXT_ADSENSE_MODE=live` on a staging host
   first with a CSP review, then production; confirm Core Web Vitals afterwards.
