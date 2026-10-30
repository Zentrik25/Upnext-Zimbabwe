# UI/UX audit and redesign report — DRAFT (status: awaiting owner review)

Branch `ccr-e260651c-jojraz` (contains the integration branch and the merged SEO work, PR #28). Not merged, not deployed.

## Method and limits
- Built the app (Node 22, not the pinned 24) and ran the real Django API (Python 3.14.6, PostgreSQL 16, demo seed) locally. No Docker, no Nginx proxy.
- `tools/ui-audit.mjs` screenshots 19 routes at 390 and 1440 px and tests horizontal overflow at 320, 360, 390, 430, 768, 1024 and 1440 px. Results: `before/overflow.json`, `after/overflow.json`.
- **Before screenshots:** the 390 px set is complete; the 1440 px "before" set was cut short (the run was interrupted), so desktop comparisons exist for the "after" state only.
- Signed-in screens (account, employer dashboard, alerts, for-you) were **not** screenshotted or redesigned beyond the shared heading size; no seeker/employer session fixtures were set up.

## Findings (ranked)
| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | High | No `/categories` route: the phone "Categories" tab and footer link pointed at `/#categories` (an anchor, never "active") | Fixed: new `/categories` page, tab, footer, home "All categories" link |
| 2 | High | No guides index; footer only listed individual guides | Fixed: `/guides` |
| 3 | Med | Listing rows used 22 px titles on phones, ~210 px per row; poor scan density | Fixed: 18 px title on phones, tighter padding |
| 4 | Med | About / Employers / Contact / verification guide were long bullet or paragraph runs | Fixed: header band, numbered steps, fact cards, definition list for the three levels, CTA |
| 5 | Med | Home "How listings are checked": three large nested cards | Fixed: compact fact cards (shared `InfoCard`) |
| 6 | Med | Bottom bar ignored the iOS safe area | Fixed: `viewport-fit=cover` + `env(safe-area-inset-bottom)` |
| 7 | Low | Mixed H1 sizes (32 px on phones); sign-in/register illustration pushed the form below the fold | Fixed: 28 px on phones; illustration hidden on phones |
| 8 | Low | Legal pages: dense list/TOC sizes | Typography polish only; **legal text untouched** |

## Shared components (`src/components/content/blocks.tsx`)
`PageHeader`, `ContentSection`, `ProcessSteps`, `InfoCard`/`InfoGrid`, `VerificationLevels` (wording from the single `VERIFICATION` source), `PageCTA`, `TextLink`. `ProsePage` now renders `PageHeader`. Existing `EmptyState`, `Tag`, `ButtonLink`, `Container` reused. No new tokens, colours, radii or shadows.

## Not done (honest list)
- Opportunity detail, All Jobs filters, account, employer dashboard, auth form internals: audited by screenshot only at 390 px; no structural redesign made.
- `/categories` and `/guides` are indexable (tests updated) but **not added to the sitemap** (SEO sitemap rules left untouched; recommend adding after owner review).
- No dark-mode visual review beyond the existing axe dark check.

## Test report (all run locally)
| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint | pass |
| Prettier check | pass |
| `tokens:check` | pass |
| `next build` | pass |
| Vitest | 19 files, 251 tests pass (SEO "private routes" test extended with the two new public routes) |
| Playwright foundation + mobile-menu | 32 pass, 2 fail: both need the Nginx `/api` proxy (not available here) |
| Playwright a11y, legal, seo, opportunities, controls, mobile-budget, report-journey | 38 pass, 85 skipped (skips need staff/seeker fixtures not provisioned), 0 failed |
| axe on `/` (390, 1440, dark), mobile menu | pass after fixing one `link-in-text-block` defect found by the first run |
| Backend pytest, employer/auth/saved E2E journeys | **not run** |
| Visual diff tooling | not available; manual screenshot comparison only |
