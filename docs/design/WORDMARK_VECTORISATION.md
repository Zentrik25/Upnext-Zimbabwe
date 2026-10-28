# Replacing the temporary wordmark with the approved vector identity — DRAFT

Status: DRAFT. The black-and-white UN monogram is traced from the supplied sheet (`docs/design/brand/UPNEXT_LOGO_SHEET.png`, `tools/brand/monogram.json`) and is flat black or white only. The wordmark "UPNEXT" / descriptor "CAREERS" shipped today is a **temporary typeset stand-in** (Inter ExtraBold/Medium outlines built by `tools/brand/build_assets.py`). The supplied wordmark exists only as raster. No logo has been invented or redesigned.

## 1. What must be supplied (owner / designer)

| # | Requirement |
|---|---|
| W-1 | Vector master of the approved wordmark and, preferably, the full lockup (monogram + wordmark + descriptor): SVG (plain paths, no live text, no embedded raster, no filters/gradients/effects) or a vector PDF/AI/EPS from which one is exported |
| W-2 | Confirmation that the supplied raster sheet is the approved artwork and which variant is canonical (horizontal lockup, stacked lockup, wordmark only, monogram only) |
| W-3 | Clear-space and minimum-size rules from the designer (or approval to use those in `BRAND_GUIDELINES.md`) |
| W-4 | Written approval of the finished vectors (inclusion in the decision register) |

If only raster exists, the owner decides: commission the designer to deliver vectors (recommended), or approve a faithful trace by the designer; engineering does not trace the wordmark by its own judgement.

## 2. Technical requirements for the replacement

- Colours: `#000000` on light, `#FFFFFF` on dark; never recoloured; no shadow, outline, gradient or pill (D-39/D-42).
- Files to produce: `apps/web/public/brand/` wordmark and lockup SVGs (light and dark); `logo-paths.generated.ts` regenerated; PNG exports (`render-brand-pngs.mjs`) for favicon sizes, Apple touch icon, Open Graph image (1200×630) and e-mail header if used.
- Single source: replace the typeset-outline step in `tools/brand/build_assets.py` with reading the supplied vector, so assets stay reproducible; update `tools/brand/` README and `BRAND_GUIDELINES.md` open point 1.
- Accessibility: the logo link keeps an accessible name "UPNEXT Careers"; decorative copies are `aria-hidden`; text alternative in Open Graph images stays in metadata.
- Layout: header and footer lockups must not shift (set explicit width/height); check mobile at 320 px and the 24 px minimum monogram.
- E-mail: HTML bodies currently carry no images; adding a logo to e-mail is a separate decision (no remote images/tracking).

## 3. Acceptance checks

1. Visual diff of header, footer, favicon, Open Graph image on desktop and mobile; screenshots attached.
2. `npm run tokens:generate`, web lint/typecheck/unit, the e2e journeys and axe checks pass.
3. Brand checks still pass (no "NextJob Zimbabwe" in public output; docs/code gate).
4. The decision register records approval; the temporary-wordmark notice is removed from the guidelines.

**Launch effect:** this is an owner-visible brand-quality item. It is **not** a technical blocker; the owner decides (O-5 in `LAUNCH_DECISIONS_TRIAGE.md`) whether launching with the typeset stand-in is acceptable.
