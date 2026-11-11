# Public site design: Apple-inspired, light only (D-73) — DRAFT

Status: DRAFT, owner instruction of 2026-11-10 ("remove all Stripe rules and make it Apple themes on the public frontend").
Reference: the owner-supplied Apple-inspired `DESIGN.md`, `preview.html` (light) and `preview-dark.html` (documentation only;
the dark look is not used). This is a visual reference, not Apple's branding: no Apple logo, product navigation, imagery or font
file is used.

## Scope
Public and seeker pages: everything except `/workspace` and `/employer`. The root layout sets `data-surface="public"` on `<body>`
for them. The staff workspace and the employer dashboard keep the Stripe tokens of D-45 (`DESIGN_TOKENS.md`) until the owner asks
otherwise.

## Tokens (`tokens.json` → `public`, emitted by `npm run tokens:generate`)
| Role | Value |
|---|---|
| Interactive fill (buttons, focus ring) | `#0071e3`, hover `#0077ed`; white text on it is 4.65:1 |
| Text accent and links | `#0066cc`, hover `#0058b0` (`#0071e3` as text on `#f5f5f7` is 4.31:1 and fails AA) |
| Ink / muted | `#1d1d1f` / `#6e6e73` |
| Backgrounds | `#ffffff`, secondary `#f5f5f7` |
| Borders | `#d2d2d7`; control borders `#86868b` (3:1 non-text contrast) |
| Status | success `#1d7a3a` on `#e8f5ec`, warning `#8a5a22` on `#fdf4e7`, error `#c9302c` on `#fdeeee` (never forced to blue) |
| Font | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif` |
| Weights | body 400, medium 500, headings and labels 600 |
| Radii | 8px controls and cards, 12px dialogs, 980px pill for main calls to action, 2px micro |
| Shadows | none for `subtle`; `ambient`, `elevated`, `deep` are soft neutral; prefer spacing and thin borders |

Every public colour is redefined in that block, so a stored Dark choice cannot reach a public page. There is no public theme toggle.
Tailwind inlines shadow values at build time, so `globals.css` applies the public shadow tokens to the shadow utilities.

## Rules
- Light only; no gradients, blobs, cartoon illustration or decorative shapes; no invented counts, employers, salaries or badges.
- Links inside running text are underlined (WCAG 1.4.1); navigation, cards and buttons are not.
- Headings are semibold with slight negative tracking; the page `h1` is the only `h1`.
- Phone bottom navigation never shows private seeker tabs to a visitor.
- Tests: `apps/web/tests/e2e/foundation.spec.ts`, `controls.spec.ts`, `a11y.spec.ts`, `tests/unit/design-guard.test.ts`.

## Listing page on a phone (2026-11-11)
The filters sit behind one 44px "Filters" bar (a CSS-only checkbox toggle, no script; open when a filter is already applied,
showing "(n applied)"); from 991px the panel is the sidebar. The title of an opportunity stays the size of its section headings
(owner rule, `job-view.test.tsx`), so the detail page title was not enlarged.

## Pages re-laid-out (2026-11-11)
- Listing row (used by the list, landing pages, saved, For you and the seeker dashboard): a 18px semibold title, organisation, one
  line of facts and tags, and a "View details" text link at the end of that line (the separate button row is gone, so rows are
  about 45px shorter); the loading skeleton matches.
- Empty and error boxes on public pages are a calm pale panel (staff and employer pages keep the dashed box).
- Reading pages (guides, About, Contact, legal): a 40px-class title, an 18px intro, section headings without rules, a 55% leading.
- For employers: a hero, five step cards, a "What we do not do" panel. Landing pages: a quieter related-links column.
- Verified at 320, 390, 768 and 1440 px with axe and an overflow check, signed out and signed in as a demo seeker (dashboard, For
  you, Saved, Profile, Alerts, Account, Security).

## Not changed beyond the tokens
The opportunity (detail) page layout, the public employer profile (`/employers/[slug]`; the demo data has none, so it was not
viewed) and the authentication forms keep their structure and take the new colours, fonts and corners.
