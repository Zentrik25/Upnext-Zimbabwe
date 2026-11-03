# Accessibility audit — DRAFT

Status: DRAFT, 2026-10-30. Target WCAG 2.2 AA. **This pass did not run the browser accessibility suite, did not test with a keyboard in a browser and did not use a screen reader.** Automated results can show some failures; they cannot establish compliance, and no compliance claim is made here.

## 1. Confirmed findings

None new. Nothing was observed in a browser.

## 2. What exists (read from the repository, not re-run)

- Automated axe checks and keyboard and reflow checks in the Playwright suite at several widths; per `docs/governance/LAUNCH_BLOCKERS.md` B-10 they passed in earlier phases, and **no manual or assistive-technology test has ever been done**.
- A unit test on heading order (`apps/web/tests/unit/heading-order.test.tsx`), added after a real defect (A-01 in the M1 fixes).
- Documented, minimal deviations from the visual design where contrast required it: `docs/design/ACCESSIBILITY_DEVIATIONS.md` (DEV-02 to DEV-06).
- A manual audit plan with mobile budgets: `docs/engineering/ACCESSIBILITY_AUDIT_PLAN.md`.
- Vitest (257 passed) includes component-level checks; they were run here.

## 3. Implemented fixes

None. The two fixes in this pass change an API response field and a request header; the visible text for a closed saved listing already existed ("This listing has closed").

## 4. Proposed improvements

1. Run the existing Playwright accessibility specs against a built stack (needs the full Compose stack; not available in this session) at 320, 360, 390 and 430 px, and record the output.
2. Perform the manual plan: keyboard-only passes of sign-in, search with filters, save and unsave, employer submission; a screen-reader pass (NVDA with Firefox or Chrome; VoiceOver on iOS; TalkBack on Android); 200% zoom and text spacing; reduced motion.
3. Check that the saved list announces a status change (live region) when an item is unsaved.

## 5. Test evidence

Unit tests only (above). No axe, no keyboard, no screen-reader output from this pass.

## 6. Unverified conditions

Everything in WCAG 2.2 AA that needs a browser or a person: focus visibility and order, target size (2.5.8) on the real pages, dialog focus handling, error-message association, colour contrast of the shipped palette, behaviour of PR #35's new bottom navigation and pages (unmerged).

## 7. Outstanding blockers

B-10 (manual accessibility audit by people with real devices and assistive technology).

## 8. Required owner decisions

Who performs the manual audit and when; whether the launch can wait for it (recommended: yes for the core journeys).
