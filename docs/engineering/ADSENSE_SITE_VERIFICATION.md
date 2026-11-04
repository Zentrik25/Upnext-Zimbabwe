# Google AdSense: verification, placements and consent (status: DRAFT, not approved, not active)

**Origin:** owner requests of 2026-11-03. Google AdSense lists `upnext.co.zw` as "Requires review / Not found" and asks for its snippet in the `<head>`; the owner also asked for a privacy-policy update and AdSense-safe ad placements.

## Conflict with binding decisions (the owner must decide)
- PRD non-goals and `SPEC_V1_RECONCILIATION` S22: no advertising in Release 1.
- P4-04: "No analytics, advertising or tracking service and no cookies beyond the session and CSRF cookies, so there is no consent banner."
- B-02: privacy text is not reviewed. `/privacy` and `/terms` stay `noindex` until `UPNEXT_LEGAL_APPROVED=true`.

Nothing here changes those decisions. A decision-register entry superseding them is needed before any variable below is set in production.

## Completed implementation (in the repository)
| Area | What exists | Where |
|---|---|---|
| Off by default | No Google request, script, cookie or ad unless the owner sets the variables below | `apps/web/src/lib/adsense.ts` |
| Three modes | `off` (default), `verify` (Google's ownership snippet in `<head>` of public pages, no ads), `live` (labelled ads, Google loads only after the visitor agrees) | `lib/adsense.ts`, `app/layout.tsx` |
| Page rules | An allow-list: a single opportunity page (`/opportunities/<slug>`) and the guides (`/guides/<guide>`). Everything else, including sign-in, registration, account, saved, alerts, profile, For you, the employer portal, the staff workspace, the report form, privacy, terms, contact and the list pages, never shows an ad | `lib/ad-rules.ts` |
| Defence in depth | The slot re-checks the real request path, so an `<AdSlot>` dropped on a disallowed page renders nothing; a test lists the only two files that may use it | `components/ads/ad-slot.tsx`, `tests/unit/ad-rules.test.ts` |
| Placement | Job page: after the description, away from the Apply, Save and Share controls at the top and the "How to apply" block. Guides: in the middle of the article, never at the top or next to the "More guides" links. Never in headers, footers, forms or the bottom navigation | `job-view.tsx`, `guide-page.tsx` |
| Appearance | A plain "Advertisement" label, a bordered box apart from the text, reserved height (280px, 250px on phones) so the page does not jump, tokens only (light and dark), no overlay, no sticky or fixed ad | `components/ads/ad-unit.tsx` |
| Consent | The visitor is asked inside the reserved box with two equal buttons; nothing from Google loads until "Allow advertisements"; refusing leaves one line ("Advertisements are off. Allow advertisements"); while ads show, "Stop advertisements" sits under the box; the choice is kept in local storage `upnext-ad-consent` (not a cookie, never sent to us). The control lives in the ad block, not the site footer, because Next ships every client component a page can reach and a footer control would weigh on every page, ads on or off | `lib/ad-consent.ts`, `components/ads/ad-unit.tsx` |
| CSP | Google hosts are added only in `live` mode and only on a path that may show an ad; all other pages keep the strict policy | `proxy.ts`, `lib/adsense.ts` |
| Privacy Policy v1.2 | New section 6A on Google AdSense (cookies, personalised and non-personalised advertising, what Google may receive, what UPNEXT does not pass, EEA, UK and Switzerland consent, Google settings and opt-out links). The text follows the owner's status: with the variables blank it says **no advertisements are shown and no Google advertising script loads**; in `verify` it says a Google script loads and no ads are shown; in `live` it says ads are shown after consent. Sections 3, 6 and 7 change with the status. Existing disclosures are unchanged. `/privacy` is linked from the site footer and the sign-in footer | `content/legal/privacy.ts` (`privacyFor`), `app/privacy/page.tsx` |
| Tests | Configuration, path rules, consent behaviour in jsdom, slot refusal, CSP additions, the policy text in every mode, where `<AdSlot>` is used | `tests/unit/adsense.test.ts`, `ad-rules.test.ts`, `ads.test.tsx`, `privacy-advertising.test.ts` |

## Variables (all blank in git; the owner sets them in the deployed environment)
| Variable | Meaning |
|---|---|
| `UPNEXT_ADSENSE_CLIENT` | The real publisher id `ca-pub-…` from the owner's AdSense account. Invalid or blank: advertising is off and `/ads.txt` answers 404. On its own it only serves `/ads.txt`: no Google script loads and no ad shows |
| `UPNEXT_ADSENSE_MODE` | `verify` or `live`. Blank or anything else: off |
| `UPNEXT_ADSENSE_SLOT_JOB_DETAIL`, `UPNEXT_ADSENSE_SLOT_GUIDE` | Real ad-unit ids (digits) created in AdSense after approval; a placement with no id renders nothing |

## Requires Google AdSense approval, configuration or legal review (NOT done)
1. **Owner decision** recorded in the decision register, superseding the non-goal and P4-04.
2. **Legal review** of the Privacy Policy v1.2 (it asserts nothing about Google beyond linking to Google's pages, but the wording on consent for the EEA, the United Kingdom and Switzerland, and on cross-border transfer, is a legal judgement), then `UPNEXT_LEGAL_APPROVED=true` (OQ/B-02). The Terms have not been reviewed for advertising either.
3. **Certified consent platform.** The built-in prompt is a simple first-party choice, **not** a Google-certified consent management platform (CMP). Google's AdSense rules for serving ads to visitors in the EEA, the United Kingdom and Switzerland are understood to require a Google-certified CMP (for example one using the IAB TCF); confirm the current requirement with Google and either integrate a certified CMP or limit serving. Until then do not set `live` for those audiences. The prompt asks every visitor because UPNEXT does not locate visitors.
4. **Publisher id and ad units** from the owner's AdSense account (none is in git, none is invented). Ad units cannot be created before the site is approved.
5. **Content-Security-Policy check.** The Google hosts in `lib/adsense.ts` follow Google's published guidance but were not tested against real AdSense output (the browser run used intercepted requests). Ads also write inline styles, which `style-src` (no `'unsafe-inline'`) may block. Test on a staging host with a real approved account, review any widening (security review), and do not relax the policy on other pages.
6. **ads.txt** is built (`app/ads.txt/route.ts`): `/ads.txt` serves Google's one authorising line once `UPNEXT_ADSENSE_CLIENT` is set, and answers 404 until then. The certification id in the line (`f08c47fec0942fa0`) must be confirmed against the snippet AdSense shows in the owner's account. The route needs the Nginx and Traefik in front of the app to pass `/ads.txt` through to the web app; that was not checked and the infrastructure was not touched.
7. **AdSense content eligibility.** Google decides whether the site has enough original, substantial content. The guides and listings are the only eligible pages; thin pages (lists, forms) deliberately carry no ads.
8. **Deployment** (Phase 7 approval) and the privacy text's `/privacy#advertising` anchor are live only after a release; nothing is deployed.
9. Layout shift is reserved by height; confirm real Core Web Vitals after activation.
10. **Page weight.** With ads off, the home, search and sign-in pages ship no ad code (measured identical to the base build). Opportunity and guide pages carry the ad block (about 1.3 KiB gzipped) even with ads off, so the listing-page script allowance in `tests/e2e/mobile-budget.spec.ts` is 153 KiB; real-device testing is still required (B-10).

## How to activate (owner, after the steps above)
1. **Preferred way to get the site verified (no Google script on the pages):** set only `UPNEXT_ADSENSE_CLIENT`, redeploy, open `https://upnext.co.zw/ads.txt` to confirm it shows the line, then in AdSense choose "Ads.txt snippet" and "Request review". Leave `UPNEXT_ADSENSE_MODE` blank. Alternative: also set `UPNEXT_ADSENSE_MODE=verify` and choose "AdSense code snippet"; then a Google script loads for every visitor with no prompt, because the crawler must find it in the page, and the policy says so.
2. After approval, create ad units, set the two slot variables and `UPNEXT_ADSENSE_MODE=live`.
3. To turn it all off, blank the variables.
