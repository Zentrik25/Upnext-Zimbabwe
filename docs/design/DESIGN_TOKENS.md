# UPNEXT design tokens — extracted from the approved reference

> **Update 2026-10-29 (D-45): the interface follows the Stripe design system supplied by the owner** (`DESIGN.md`, `preview.html`, `preview-dark.html`). Where this document describes the monochrome palette, 600-weight headings or the black accent of D-39/D-42, the values in `apps/web/src/design/tokens.json` now govern: purple `#533afd` (hover `#4434d4`) for primary actions, links and focus; deep navy `#061b31` headings and slate `#64748d` secondary text; borders `#e5edf5`; brand dark `#1c1e54` for the footer and employer band; weight 300 for body and headlines and 400 for buttons, links and navigation; tracking -1.4px at 56px, -0.96px at 48px, -0.64px at 32px, -0.26px at 26px, -0.22px at 22px; shadows `rgba(23,23,23,.06) 0 3px 6px`, `rgba(23,23,23,.08) 0 15px 35px`, `rgba(50,50,93,.25) 0 30px 45px -30px` with `rgba(0,0,0,.1) 0 18px 36px -18px`, and `rgba(3,3,39,.25) 0 14px 21px -14px` with `rgba(0,0,0,.1) 0 8px 17px -8px`; radii 1, 4, 5, 6, 8px; Source Code Pro for code and technical labels; ruby `#ea2261` and magenta `#f96bee` only as a decorative hero accent and for the error ring. Dark theme values are the owner's dark preview (surface `#0e0f2e`). **The logo is unchanged: the flat black or white UN monogram, never recoloured.** Söhne is not redistributable, so Inter stands in. Accessibility corrections: `ACCESSIBILITY_DEVIATIONS.md` DEV-02 to DEV-06. Light is the default theme.


> **Superseded by D-39 (2026-10-28).** The web app now follows the Stripe-inspired design system. The live token values are in `apps/web/src/design/tokens.json` (generated into `tokens.generated.css`); the corrections to the system are in `ACCESSIBILITY_DEVIATIONS.md` section 0. Everything below describes the earlier flat reference and is kept as a historical record.


**Status: DRAFT for owner sign-off.** Source of truth: `reference/approved-flat.html` (SHA-256 `77883daef17704f358e42a27a9b4197ac0c83aad9143e5335b071ca23977cce8`, unchanged). Authority: DECISION_REGISTER D-08 (the reference is the definitive design source; blue accent, Arial, sizing, spacing and square corners are preserved) as amended by D-19 (accessibility takes precedence over exact fidelity where the reference conflicts with WCAG 2.2 AA; minimum corrections only). Reference values are exact measurements; the four **production deviations** are listed in `ACCESSIBILITY_DEVIATIONS.md` and in §1a. Nothing else is invented.

**Method.** Values were read from the *computed* styles of the rendered reference in Chromium (Playwright) at 1440, 390 and 320px, then cross-checked against the CSS source. Raw output: `docs/design/evidence/reference-computed-styles.json`. The reference contains two CSS layers; the later "strict flat editorial UI" layer wins and is what is recorded below. Where a value could only be read from CSS source (an element not rendered in the sampled state), it is marked **(css)**.

## 1. Colour

All values exact. The reference uses many close greys; they are recorded as found. They are not consolidated: under D-19 only the minimum accessibility corrections are applied (§1a).

| Role | Value | Where used |
|---|---|---|
| ink (text) | `#18232f` | body text, titles |
| muted | `#687481` | secondary text, notice, `.small`, hero paragraph, footer |
| line | `#dce2e8` | header/hero/category/feed dividers, card dividers |
| **accent blue** | `#174c83` | primary button, logo accent, active tab, active text, match-reason rule |
| accent blue hover | `#103b69` | primary button hover (background) |
| green (source ok) | `#176345` on `#f1f6f3` | `.tag.good` **(css)** |
| urgent | `#8d542c` on `#fff7f0` | `.tag.urgent` |
| page / surface | `#ffffff` | body, header, hero, inputs, modal |
| surface pale | `#f8f9fa` | interest bar, sign-in lock panel |
| surface notice | `#f7f8f9` | notice strip |
| row hover | `#f9fafb` | listing row hover |
| match-reason bg | `#f6f8fa` | `.matchwhy` **(css)** |
| nav text | `#354355` | header nav buttons |
| secondary button text | `#253d55` | `.btn.secondary` |
| eyebrow text | `#556473` | hero eyebrow |
| category pill text | `#647180` | inactive category tab |
| feed tab text | `#68768b` | inactive feed tab |
| check/select text | `#536276` | checkbox labels, sort select |
| company text | `#697586` | organisation under title |
| metadata text | `#66768a` | location/type chips row |
| bookmark idle | `#7c8ba1` | save icon |
| empty-state text | `#68778c` | empty message |
| avatar | bg `#eef1f4`, text `#43566a`, border `#e1e5e9` | organisation initials tile |
| tag | bg `#f3f5f6`, border `#e9edf0`, text `#66768a` | metadata chips |
| border strong | `#bdc8d4` | secondary button, modal |
| border search | `#cbd4de` | search group outline |
| border field | `#d9e1eb` | inputs/selects in side panels |
| border panel | `#e0e5ea` | filter and aside cards |
| border interest bar | `#e0e4e8` | interest bar |
| border notice | `#e1e6ea` | notice strip |
| empty-state border | `#cdd7e4` (1px **dashed**) | empty state |
| focus ring | `#6886cb` | `outline: 2px solid; offset 2px` |
| overlay scrim | `rgba(22,35,48,0.565)` (`#16233090`) | modal backdrop |

### 1a. Production values that differ from the reference (D-19; full evidence in `ACCESSIBILITY_DEVIATIONS.md`)

| Token role | Reference | Production | WCAG SC |
|---|---|---|---|
| metadata / tag text (DEV-01) | `#66768a` | `#627185` | 1.4.3 |
| muted text (DEV-02) | `#687481` | `#687380` | 1.4.3 |
| organisation name (DEV-03) | `#697586` | `#687485` | 1.4.3 |
| control border: inputs, selects, search-group outline (DEV-04) | `#d9e1eb` / `#dce2e8` / `#cbd4de` | `#7693b7` (one token) | 1.4.11 |

Every other value in this document is used exactly as measured. The theme must expose both the reference value (for the visual-regression baseline) and the production value (for the build).

## 2. Typography

| Token | Value |
|---|---|
| font family | `Arial, Helvetica, sans-serif` (the reference's earlier Inter stack is overridden) |
| base | 13px / line-height 1.55 (20.15px), weight 400 |
| logo | 25px, weight 750, letter-spacing −1.3px; accent span `#174c83` |
| h1 (hero) | `clamp(29px, 3.6vw, 39px)`, weight 650, letter-spacing −1.1px, line-height 1.2, margin 8px 0 6px |
| section title | 17px, weight 650, letter-spacing −0.25px |
| listing title | 14px, weight 650, line-height 1.35 |
| organisation | 12px, `#697586` |
| nav button | 12px, weight 400 |
| button | 12px, weight 500 |
| category/feed tab | 12px, weight 400; active 600 |
| filter label | 11px, weight 650 |
| checkbox label | 12px |
| metadata / tag / `.small` / notice / footer | 11px |
| eyebrow | 10px, weight 600, uppercase, letter-spacing 1.2px |
| detail heading (`h3`) | 12px, weight 700 |
| detail body | 12px |
| modal title | 22px, letter-spacing −0.6px **(css)** |

## 3. Layout, spacing, controls

| Token | Value |
|---|---|
| content max width | 1190px, side padding 24px (14px ≤650px) |
| header height | 58px (55px ≤650px); bottom border 1px `#dce2e8` |
| hero padding | 30px 0 28px (24px 0 ≤650px) |
| main padding | top 22px, bottom 65px |
| 3-column layout | 190px · fluid · 215px, gap 22px |
| ≤990px | 175px · fluid; aside moves under feed |
| ≤650px | single column, gap 15px; filters become 2-column grid, gap 8px |
| radius | **0** everywhere in the reference (`!important`); **4px on buttons, inputs, selects and textareas** by owner decision D-29 (`--radius-control`); everything else stays 0 |
| shadow / gradient / filter | none |
| button (standard) | padding 7px 12px, min-height 33px, 1px border |
| search controls | min-height 39px, padding 8px 11px (36px button ≤650px) |
| field / select in panels | padding 9px 11px, min-height 36px, 1px `#d9e1eb` |
| search group | 1px `#cbd4de` outline, controls separated by 1px `#dce2e8`; max width 790px, select 155px |
| category tab | padding 10px 14px, 2px bottom rule (transparent → `#174c83`) |
| feed tab | padding 0 0 11px, gap 19px, 2px bottom rule |
| listing row | padding 15px 14px, 1px bottom divider (first row also top), no card border |
| avatar | 39×39px |
| filter / aside card | 1px `#e0e5ea`, padding 14px |
| interest bar | padding 14px 16px, margin-bottom 21px |
| tag | padding 2px 6px, 1px border |
| modal | max width 570px, padding 22px, 1px `#bdc8d4`; overlay padding 16px |
| empty state | padding 28px, centred, dashed border |
| footer | top border 1px, padding 24px 0 |

Measured at 390px and 320px: no horizontal scroll (document width equals viewport).

## 4. Components in the reference vs components still to design

Present in the reference (tokens above apply): header/nav, notice strip, hero search, category tabs, filter panel, feed tabs and sort, listing row, expanded detail, save control, tags, match-reason block, interest bar, aside card, sign-in lock panel, modal (auth, interests), empty state, footer.

**Not present in the reference — must be derived from these tokens and approved before build:** pagination, loading skeletons, error and offline states, toast/inline status, account forms (validation/error text), email-verification pending screen, password reset screens, standalone opportunity detail page, expired/withdrawn banners, deadline-state badges for *unknown* and *expired*, source/verification badges (three levels), saved-list expired state, editorial tables (if a custom UI is ever built; Django Admin is currently expected), session-list UI.

## 5. Reference quirks and conflicts

1. **Off-palette blue:** `.bookmark.on` and `.accountbar button` use `#3658a4` **(css)** from the first layer; the accent is `#174c83`. `#3658a4` measures 6.8:1 on white, so it conforms; it is preserved as in the reference and flagged to the owner as a design inconsistency (no accessibility deviation).
2. **Button hover:** background goes to `#103b69`, but the first layer's `filter: brightness(.94)` is still in force on `.btn:hover` (higher specificity than the override) **(css)**. Confirm visually before copying.
3. **Control heights differ by context:** 33px (standard button), 36px (fields), 39px (search). The original DESIGN documents said "~34–36px". Preserved as measured.
4. **Small text:** 10px (eyebrow) and 11px (metadata, tags, notice, footer, `.small`) are used throughout. WCAG 2.2 AA sets no minimum text size, so these are preserved (D-19). Measured contrast failures are corrected by DEV-01…DEV-03: `#66768a` on `#f3f5f6` 4.25:1, `#66768a` on `#f9fafb` 4.44:1, `#687481` on `#f7f8f9` 4.48:1, `#697586` on `#f9fafb` 4.48:1. (An earlier draft wrongly stated `#687481` on `#f8f9fa` = 4.4:1; it is 4.52:1.)
5. **Form-control borders** are 1.3–1.5:1 against white and fail SC 1.4.11 (DEV-04).
6. **Demo-only content** (fictional organisations, "% preference match", alerts form, "For employers" link, "Apply unavailable in demo", localStorage accounts) is not a token matter; see OQ-24.
7. The first CSS layer contains rounded corners (5–10px) and a modal shadow; all are cancelled by `!important` on a fixed selector list. **Any new component must be added to the zero-radius/no-shadow rule explicitly.**

## 6. Process

Implementation must read these tokens from a single source (Tailwind theme keys named after the roles above), not from copied literals. Visual sign-off compares built screens to `reference/approved-flat.html` at 1440, 768, 390 and 320px (VIS-01…VIS-05 in the traceability matrix), allowing only the deviations in `ACCESSIBILITY_DEVIATIONS.md`. Any further deviation requires a dated design decision record approved by the owner.

## 7. Implementation (Phase 1)
- **Source:** `apps/web/src/design/tokens.json` (reference values; production values only for DEV-01…DEV-04). `npm run tokens:generate` writes `apps/web/src/styles/tokens.generated.css`, a Tailwind v4 `@theme` that *removes* the default palette, radii, shadows and blurs, so only approved tokens exist as utilities. `npm run tokens:check` (CI) fails if the generated file is stale.
- **Tailwind names:** colour roles keep the names above (`bg-accent`, `text-muted`, `border-control-border`, …); font sizes are `text-micro` (10px), `text-small` (11px), `text-ctl` (12px), `text-base` (13px), `text-title` (14px), `text-section` (17px), `text-hero`, `text-logo`; weights `font-medium/semi/strong/bold/logo`; control heights `min-h-control/field/search`; container `max-w-page`; breakpoints are one pixel above the reference's `max-width` queries (651px / 991px) because Tailwind's `max-*` variants use "<".
- **Reference-only values** are exposed as `--color-ref-*` for tests and are forbidden in application code.
- **Not replicated on purpose:** the reference's leftover `filter: brightness(.94)` on button hover (quirk 2); hover uses the `accent-hover` token only.
- **Verified:** computed-style parity with the reference for header, wordmark, notice, hero heading, buttons, fields, search group, tabs, tags, panel, listing row, save control and footer (Playwright, 1440px), with only DEV-01…DEV-04 differing; flat-design guard (no radius/shadow/gradient anywhere); axe clean at 390 and 1440; no horizontal scroll at 320/390/768/1440. A listing-row discrepancy found during review (facts were boxed; the reference leaves them as plain text) was fixed.
