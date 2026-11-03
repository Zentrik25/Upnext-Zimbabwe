# AdSense site verification (status: DRAFT, not approved)

**Origin:** owner request of 2026-11-03: Google AdSense lists `upnext.co.zw` as "Requires review / Not found" and asks for its code snippet in the `<head>` of every page.

## Conflict with binding decisions (to be decided by the owner)
- PRD non-goals and `SPEC_V1_RECONCILIATION` S22: no advertising in Release 1.
- P4-04: "No analytics, advertising or tracking service and no cookies beyond the session and CSRF cookies, so there is no consent banner."
- B-02: privacy text is not yet reviewed. Google's script sets third-party cookies and sends visitor data to Google, so `/privacy` and a consent mechanism for visitors need legal review before it is live.

Nothing here changes those decisions. A decision-register entry (superseding the points above) is required before the variable is set in production.

## What was built
- `apps/web/src/lib/adsense.ts` and the root layout: when `UPNEXT_ADSENSE_CLIENT` is a well-formed `ca-pub-…` id, the snippet `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=…" crossorigin="anonymous">` is added to `<head>` of every **public** page. It is never added to `/workspace` (staff) or to the sign-in, register and password pages. It carries the per-request CSP nonce.
- **Off by default:** blank or malformed means no output and no request to Google. Wired in `compose.production.yaml` and `production.env.example`.
- The CSP (`proxy.ts`) is unchanged. `script-src 'nonce-…' 'strict-dynamic'` lets the nonced snippet load, which is all that site verification needs. Showing ads would additionally need Google hosts in `img-src`, `connect-src` and `frame-src`; that is not done and needs its own review.

## To go live (needs separate owner approval; nothing is deployed)
1. Owner records the decision and approves privacy/consent text.
2. Set `UPNEXT_ADSENSE_CLIENT=ca-pub-5550288003651205` for the web service and redeploy (Phase 7 approval applies).
3. In AdSense choose "AdSense code snippet", tick "I've placed the code" and "Request review".
4. Alternative with no page change: AdSense's *ads.txt* method (serve `/ads.txt`) or the *Meta tag* method; neither loads Google's script.
