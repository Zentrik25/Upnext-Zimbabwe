# UPNEXT design system — APPROVED DIRECTION; tokens extracted
**Binding reference:** `reference/approved-flat.html` (D-08). **Tokens:** `DESIGN_TOKENS.md` (exact values measured from the reference; none invented).

## Non-negotiable
- Flat visual language: square corners (`border-radius: 0`), no shadows, gradients, glassmorphism or glow.
- Thin 1px dividers and borders; Arial; restrained palette; blue accent `#174c83`.
- Compact controls as measured (33px standard button, 36px fields, 39px search), preserving the reference's spacing and sizing.
- No decorative hero clutter, oversized buttons or generic marketing blocks.
- Mobile-first; usable at 320px; accessible focus states.

## Token policy
The reference's computed values are the only source. New components (pagination, forms, states, badges, detail page, banners) are derived from recorded tokens and approved before build. Any departure is a dated design decision record.

## Accessibility
Target WCAG 2.2 AA: contrast, visible keyboard focus, labelled controls, semantic headings, reduced motion, meaningful errors. **Known conflicts between the preserved reference and AA** (10–11px text; 4.4:1 muted-on-pale; off-palette `#3658a4`) are documented in `DESIGN_TOKENS.md §5` and awaiting an owner decision (OQ-25); they are not silently changed.

## Components
In the reference: header/nav, search group, category and feed tabs, filter panel, listing row, detail block, tags, save control, modal, empty state, footer. To design from tokens: see `DESIGN_TOKENS.md §4`.
