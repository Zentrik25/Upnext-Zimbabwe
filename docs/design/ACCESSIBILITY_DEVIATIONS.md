# Accessibility deviations from the approved reference — DRAFT

Authority: D-19 / ADR-0012. Where `reference/approved-flat.html` conflicts with WCAG 2.2 AA, accessibility takes precedence; the flat design, Arial, blue accent, square corners and compact layout are preserved, and only the **minimum necessary** corrections are made. Every deviation is listed here; anything not listed here is not permitted (test A11Y-08 compares built styles with the reference allowing only these changes).

**Evidence.** Computed from the rendered reference in Chromium (alpha-composited effective backgrounds) across 7 UI states × 2 viewports (1440, 390) — 47 distinct text/background pairs measured — plus axe-core 4.10.2 (WCAG 2.0/2.1/2.2 A/AA + best-practice rules). Raw data: `docs/design/evidence/reference-accessibility-audit.json`. Reference unchanged (SHA-256 `77883daef17704f358e42a27a9b4197ac0c83aad9143e5335b071ca23977cce8`). Limits: automated checks find roughly a third of accessibility issues; manual keyboard and screen-reader review (A11Y-02…A11Y-05) is still required on the built product, and the prototype states reachable without a backend were the only ones sampled.

## 1. Deviations (visual) — the complete list

| ID | WCAG SC | Element(s) | Reference | Production | Measured (before → after) | Visual impact |
|---|---|---|---|---|---|---|
| DEV-01 | 1.4.3 Contrast (Minimum) | metadata text and tags (`.metadata`, `.tag`) 11px | `#66768a` | `#627185` | on `#f3f5f6` 4.25 → 4.55; on hover row `#f9fafb` 4.44 → 4.76; on white 4.64 → 4.98 | none perceptible (≈4 RGB steps) |
| DEV-02 | 1.4.3 | `muted` text (`.notice`, `.small`, hero paragraph, footer) | `#687481` | `#687380` | on notice strip `#f7f8f9` 4.48 → 4.54; on `#f8f9fa` 4.52 → 4.58; on white 4.77 → 4.82 | none perceptible (1 step) |
| DEV-03 | 1.4.3 | organisation name (`.company`) 12px | `#697586` | `#687485` | on hover row `#f9fafb` 4.48 → 4.54 | none perceptible |
| DEV-04 | 1.4.11 Non-text Contrast | borders of text inputs, selects and the search-group outline | `#d9e1eb` (fields, filters), `#dce2e8` (search/sort controls), `#cbd4de` (search group outline); 1.31–1.50:1 | one token, `#7693b7`, 1px | 1.32 → 3.17 on white (3.01 on `#f8f9fa`) | **visible**: form-control outlines become mid-tone blue-grey; layout, padding, radius (0) unchanged |

Derivation: each replacement is the same-hue colour with the smallest lightness reduction that reaches 4.5:1 (text) or 3:1 (control boundary) against **every** background the colour appears on. DEV-04 consolidates three failing greys into one control-border token because the three have the same role; the internal 1px dividers inside the search group (`#dce2e8`) are kept, treating the group as one composite control whose outer boundary now meets 3:1 — to be confirmed in manual review (if reviewers judge each segment a separate control, the dividers take the same token).

Alternatives considered for DEV-04 and rejected as larger changes: tinted field fills (cannot reach 3:1 against white without changing the flat white surface), underline-only inputs (changes the control language), thicker borders (changes sizing).

## 2. Checked and conforming — no change (and why)

| Item | Result | Note |
|---|---|---|
| Body, title, link and button text | pass (≥4.5:1; large text ≥3:1) | e.g. ink `#18232f` on white 15.9:1; white on `#174c83` 8.76:1; accent text `#174c83` on white 8.76:1 |
| Text size (10 px eyebrow, 11 px metadata/tags/notice/footer, 12 px controls) | no WCAG 2.2 AA minimum size | Preserved. Resizing to 200% and reflow at 320 CSS px verified without horizontal scroll in the reference (SC 1.4.4, 1.4.10). Readability of 10–11px text is a usability concern, not a conformance failure; revisit only by an owner design decision |
| Save "heart" glyph `#7c8ba1` | 3.46:1 on white, 3.31:1 on hover row | Treated as a graphical object (SC 1.4.11 needs 3:1) → conforms; axe flags it as text. **Requirement:** programmatic name ("Save <title>"), `aria-pressed`, and the filled/outline glyph change as the non-colour state cue. If reviewers classify it as text, add DEV-05 (`#7c8ba1` → `#64748c`: 4.75:1 on white, 4.55:1 on the hover row) |
| Focus indicator | `outline: 2px solid #6886cb; offset 2px` = 3.58:1 on white, 3.40 on `#f8f9fa` | Meets 1.4.11/2.4.7; defined for `button`, `input`, `select` only — production must apply it to **every** focusable element (links, labels with controls, dialogs) with the same token |
| Target size (SC 2.5.8, 24 px) | several targets are 19–20.6 px tall (nav buttons, "Clear filters", checkbox labels, "Sign out") | Conform through the **spacing exemption** (no other target within a 24 px circle). Production must keep at least the reference spacing, or enlarge to ≥24 px; no 44 px requirement is imposed (that is AAA 2.5.5) |
| Off-palette saved colour `#3658a4` (from the first CSS layer) | 6.8:1 on white | Conforms; not an accessibility matter. Preserved as in the reference; flagged as a design inconsistency for the owner (not a deviation) |
| Placeholder text | browser default `#757575` = 4.6:1 | Conforms; production must set the placeholder colour explicitly (≥4.5:1) and never use placeholders as labels |
| Dashed empty-state border `#cdd7e4`, panel/card borders `#e0e5ea`, row dividers | 1.4–1.5:1 | Decorative; not required to meet 1.4.11 |
| Secondary button outline `#bdc8d4` | 1.7:1 | The visible text label identifies the control; conforms |
| Primary button (white on `#174c83`) and filled blue tab underlines | pass | |
| Colour as sole cue | pass | active tab = colour + weight + 2px rule; verification/urgent tags carry text; saved = glyph shape |

Correction to earlier documentation: `DESIGN_TOKENS.md` and the first review package stated "`#687481` on `#f8f9fa` measures 4.4:1". The measured values are 4.52:1 on `#f8f9fa` (passes) and **4.48:1 on `#f7f8f9`** (the notice strip; fails by 0.02). Fixed by DEV-02.

## 3. Non-visual conformance requirements revealed by the audit (implementation, not deviations)

axe findings on the prototype markup are not binding structure (the prototype is a design reference), but the production build must satisfy them:

| axe rule | Prototype finding | Production requirement |
|---|---|---|
| color-contrast (serious) | the pairs above | DEV-01…DEV-03 |
| heading-order | h3 follows h1 without h2 | one h1 per page; sequential headings |
| landmark-unique | several `<nav>`/`<aside>` without distinct labels | label repeated landmarks (`aria-label`) |
| region | content outside landmarks (notice strip, eyebrow) | all content inside `header / nav / main / aside / footer` landmarks |
| (manual) | unlabeled email input in the alert widget; placeholders as labels | visible `<label>` for every field (this widget is out of scope anyway, OQ-24) |
| (manual) | modals | `role="dialog"`/`aria-modal`, accessible name, focus trap and return, Escape to close |
| (manual) | forms | errors programmatically associated (`aria-describedby`), summarised, focus moved on submit failure (SC 3.3.1, 3.3.3, 4.1.3) |
| (manual) | dynamic results | result-count and status changes announced (`aria-live` polite); loading/empty/error states have text, not colour only |
| (manual) | motion | honour `prefers-reduced-motion`; no auto-moving content |
| (manual) | skip link, `lang` attribute, page titles | required (SC 2.4.1, 3.1.1, 2.4.2) |

## 4. Process

1. Tokens: `DESIGN_TOKENS.md` lists the reference value and the production value side by side; Tailwind theme keys use the production value.
2. Tests: A11Y-06 computes contrast for every token pair; A11Y-07 asserts control-border and focus-ring ratios; A11Y-08 diffs computed styles of built pages against the reference and fails on any change outside DEV-01…DEV-04; A11Y-01…A11Y-05 as before.
3. Any new component derived from tokens (pagination, forms, banners, badges) must pass the same checks before approval; any further deviation needs a new DEV entry approved by the owner.
4. Open owner confirmation (approval checklist item): DEV-04 visibility, and the heart-glyph classification.
