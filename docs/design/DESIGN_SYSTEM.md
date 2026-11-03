# UPNEXT design system — APPROVED DIRECTION; tokens extracted
**Binding reference:** `reference/approved-flat.html` (D-08). **Tokens:** `DESIGN_TOKENS.md` (exact values measured from the reference; none invented).

## Non-negotiable
- Flat visual language: square corners (`border-radius: 0`) except buttons, inputs, selects and textareas, which are 4px (D-29, `--radius-control`); no shadows, gradients, glassmorphism or glow.
- Thin 1px dividers and borders; Arial; restrained palette; blue accent `#174c83`.
- Compact controls as measured (33px standard button, 36px fields, 39px search), preserving the reference's spacing and sizing. Targets under 24px conform only through the WCAG 2.5.8 spacing exemption: keep at least the reference spacing.
- No decorative hero clutter, oversized buttons or generic marketing blocks.
- Mobile-first; usable at 320px; accessible focus states.

## Token policy
The reference's computed values are the only source. New components (pagination, forms, states, badges, detail page, banners) are derived from recorded tokens and approved before build. Any departure is a dated design decision record.

## Accessibility
Target WCAG 2.2 AA, and **accessibility takes precedence over exact fidelity where they conflict (D-19, ADR-0012)**. Only the minimum necessary corrections are made; they are the four deviations in `ACCESSIBILITY_DEVIATIONS.md` (three one-to-four-step text colour adjustments and one control-border token). Nothing else departs from the reference: text sizes, spacing, Arial, blue accent, square corners and compact layout are preserved. Non-visual requirements (focus on every focusable element, labels, landmarks, dialog behaviour, error association, live regions, reduced motion, skip link, `lang`) are mandatory in the build.

## Components
In the reference: header/nav, search group, category and feed tabs, filter panel, listing row, detail block, tags, save control, modal, empty state, footer. To design from tokens: see `DESIGN_TOKENS.md §4`.
