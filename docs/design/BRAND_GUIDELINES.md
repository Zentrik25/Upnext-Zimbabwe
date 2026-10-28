# UPNEXT Careers — brand guidelines and implementation record — DRAFT

Status: DRAFT (owner instruction 2026-10-28, decision D-42). Previous development name: **NextJob Zimbabwe** (D-33). Current public brand: **UPNEXT Careers**. Nothing here is deployed; no DNS, mail or hosting setting was changed.

| Property | Value |
|---|---|
| Brand | UPNEXT Careers (short name UPNEXT; descriptor CAREERS) |
| Primary domain | https://upnext.co.zw (apex is canonical; `www` redirects to it) |
| Official mailbox | info@upnext.co.zw: contact, privacy, and every system e-mail. No other mailbox exists or is invented |
| Logo | Black UN monogram; white inverse; wordmark UPNEXT with CAREERS beneath |
| Design direction | Stripe-inspired structure (D-39) retuned to a monochrome identity with Inter (D-42) |
| Tagline (public) | Jobs and opportunities in Zimbabwe. |

## 1. Logo

The monogram is a **faithful vector trace** of the owner-supplied artwork (`docs/design/brand/UPNEXT_LOGO_SHEET.png`, the large monogram, traced at 8x with potrace; stored in `tools/brand/monogram.json`). It is not redrawn. The supplied wordmark is raster only, so the wordmark is **typeset** (UPNEXT in Inter ExtraBold, CAREERS in Inter Medium, letter-spaced to exactly the width of UPNEXT, converted to outlines so no font is needed). If the owner delivers a vector wordmark it replaces the typeset one in `tools/brand/build_assets.py`.

Rules: black on white, white on black; flat; no blue, gradient, 3D, bevel, glow, shadow or outline; no tagline inside the logo; clear space of one monogram "U" height on every side; minimum size 16px (monogram only). Below 28px high use the compact navigation logo (monogram and UPNEXT, no CAREERS, which would be unreadable). In the interface the logo is inline SVG drawn with `currentColor`, so it is automatically white on the black footer and in dark theme (`apps/web/src/components/brand/logo.tsx`).

## 2. Asset inventory (`apps/web/public/brand/`)

| File | Use |
|---|---|
| `upnext-monogram.svg`, `-white.svg` | Primary and inverse monogram |
| `upnext-wordmark.svg`, `-white.svg` | UPNEXT with CAREERS beneath |
| `upnext-lockup.svg`, `-white.svg` | Horizontal lockup (monogram and wordmark) |
| `upnext-nav.svg`, `-white.svg` | Compact navigation logo |
| `icon-black.svg`, `icon-black-rounded.svg`, `icon-white-rounded.svg`, `icon-circle-dark.svg` | Icon masters (app icon white/dark, circle) |
| `favicon.ico`, `favicon-16.png`, `favicon-32.png` | Browser tab (also `src/app/favicon.ico`, `src/app/icon.svg`) |
| `apple-touch-icon.png` (180) | iOS home screen |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | PWA (`src/app/manifest.ts`) |
| `social-profile-400.png` | Social profile icon |
| `og-image.png` (1200x630) | Open Graph and Twitter card |

Regenerate: `python tools/brand/build_assets.py` (needs `fonttools`, fonts-inter), then `PW_CHROMIUM=<chrome> node apps/web/scripts/render-brand-pngs.mjs` in `apps/web`. A test (`tests/unit/brand.test.ts`) checks the files exist and that every logo SVG contains only black or white fills and no gradient, filter, image or stroke.

## 3. Colour

Brand black `#000000`, white `#ffffff`. Interface tokens (`apps/web/src/design/tokens.json`, the single source; `npm run tokens:generate`): ink `#101828`, secondary text `#475467`, subtle surface `#f8fafc`, borders `#e4e7ec`. Primary buttons and links use black (white and `#1d2939` hover in dark theme). Functional colours stay: success green and warning amber (with the DEV-02/DEV-03 contrast corrections). Form-control borders use `#667085` (DEV-04: 3:1 against the surface). DEV-01 is retired because the new secondary text passes on its own. Dark theme (D-40) uses neutral near-black surfaces. Every text pair is checked at 4.5:1 and every non-text pair at 3:1 by `tests/unit/tokens.test.ts`.

## 4. Typography

Inter (SIL Open Font License), Latin subset, weights 400 and 600, self-hosted through `next/font/local` (no third-party request; about 48 KB in all). Hero `clamp(36px, 5.2vw, 60px)` at weight 600, tracking -1.4px, leading 1.15; section titles `clamp(26px, 3.2vw, 36px)`; body 15px at 1.5. The `Inter` files are in `apps/web/src/fonts/`.

## 5. Components

Shared components only, no page-specific copies: header (logo, Opportunities, For employers, Sign in, Register; wraps on narrow screens, 44px targets), buttons (primary, secondary, inverse for black bands), search group, filter selects, opportunity rows, category cards, tags, tabs, forms and fields, notices, empty states, loading skeletons (private routes only, no animation) and the error view (retry, focus, reference), pagination, footer. Radii come only from the token scale (4px controls, 6px cards, 8px featured); shadows only from the four token levels; no gradients (`tests/unit/design-guard.test.ts`). Motion is limited to short colour transitions and is switched off for `prefers-reduced-motion`.

## 6. Responsive and accessibility

Checked in a real browser at 320, 390, 768 and 1440 px: no horizontal scroll, axe clean (WCAG 2.2 AA tags), one `h1` and the landmarks on every page, targets of 24px or more, 400% reflow, keyboard use, sticky header never covers an anchor (`scroll-padding-top`). The breakpoints are `sm` (651px) and `md` (991px); there is no `lg`. Tests: `tests/e2e/a11y.spec.ts`, `controls.spec.ts`, `report-journey.spec.ts`.

## 7. Homepage

Navigation; hero ("Your next opportunity starts here.", the supported search: keyword, category, location and type of work; primary action Find opportunities, secondary Explore categories); the six real categories from the API with their names; the latest real opportunities (an empty state when there are none); how listings are checked (sources, second-person review, the three verification labels, reporting); employer services as they exist (claim, verification, editor-reviewed listings, status and aggregate counts, company profile); footer. No vacancy counts, no popularity or verification claims beyond the enforced rules.

## 8. E-mail

Sender name **UPNEXT Careers**, from and reply-to **info@upnext.co.zw** (`UPNEXT_EMAIL_FROM`, `UPNEXT_EMAIL_REPLY_TO` default to it). Plain-text templates take the brand from the context (`brand_name`, `brand_short`); the HTML alternative is a text wordmark (UPNEXT, CAREERS beneath), black on white, no images. Subjects use the brand name. Real sending is unchanged: off until `delivery_verified()` (B-01).

## 9. Domain, SEO and the move from the old name

| Item | Change |
|---|---|
| Canonical | `UPNEXT_PUBLIC_BASE_URL=https://upnext.co.zw` in production (`infrastructure/compose/production.env.example`); development keeps localhost |
| Titles | Home: `UPNEXT Careers | Jobs & Opportunities in Zimbabwe`; other pages `<Page> | UPNEXT Careers` |
| Description, Open Graph, Twitter | Home uses the approved description; every page repeats site fields and the Open Graph image |
| Icons and manifest | favicons, Apple touch icon, `manifest.webmanifest`, theme colour |
| Structured data | WebSite and Organization with the logo and email |
| Sitemap, robots | unchanged paths; absolute URLs come from the configured origin |
| `www` to apex | application-level 308 in `src/proxy.ts` (`src/lib/canonical-host.ts`, only for a real hostname); the shared production proxy should also redirect (`DOMAIN_AND_DNS_SETUP.md`). **No DNS was changed** |
| Listing URLs | unchanged (slugs are immutable) |
| Links in e-mail | built from the same configured origin |

## 10. Not changed

Database tables, migrations, Django app names, `UPNEXT_*` variables, cookie names, API contracts, audit history, authentication, permissions, the editorial workflow, reporting and moderation, data retention. Historical documents keep the old name.

## 11. Open points for the owner

1. A vector of the wordmark (the supplied one is raster; the typeset wordmark is a close match, not identical).
2. Whether the staff site (Django Admin) should keep its own typography (it now uses the black header and logo).
3. Production proxy: add the `www` to apex redirect and TLS for `upnext.co.zw` (not done here).
4. Domain `upnext.co.zw` and mailbox `info@upnext.co.zw`: creation, SPF/DKIM/DMARC and sender verification (B-01).
5. Privacy and terms text still say "[to be decided]" in places and remain drafts for legal review (B-02).
