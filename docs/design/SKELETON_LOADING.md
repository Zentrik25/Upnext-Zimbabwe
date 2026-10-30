# Skeleton loading system

Status: **DRAFT** (owner instruction 2026-10-30; traceability R-52, STATE-01 to STATE-06). Nothing here is deployed, merged or approved.

## What it is

One set of placeholder components (`apps/web/src/components/ui/skeleton.tsx`, page compositions in `components/ui/page-skeletons.tsx`, listing and home pieces beside their pages) used in three ways:

| Where | Mechanism | Why |
| --- | --- | --- |
| Private routes (account, jobseeker pages, employer portal, staff workspace) | route-level `loading.tsx` | The page is unavailable without a session, so there is no status code to protect. The layout checks the session first, so an unauthenticated visitor is redirected before any placeholder is drawn. |
| Public pages (home, `/opportunities`) | `<Suspense>` boundaries around the sections that wait for the API | A route-level `loading.tsx` on a public route streams a 200 before the page runs. |
| Public detail page (`/opportunities/[slug]`) | no skeleton for the listing itself; the visitor's session (save control) is streamed in its own boundary | The one listing request decides 200 or 404 and must finish first. |

**Evidence for the public-route rule.** With a temporary `loading.tsx` in `opportunities/[slug]`, a request for an unknown listing answered **200** (with `noindex`) instead of **404**; without it, **404**. This was checked against a running `next dev` (16.4.2). STATE-02 keeps a test that fails if a public route gains a loading file. If the owner prefers an instant skeleton on the detail page over a true 404 status, that is a decision to record (it would also need the test and STATE-02 changed); this change does not make it.

## States

| State | What is drawn | Notes |
| --- | --- | --- |
| Loading | skeleton | announced once ("Loading …"), decorative blocks `aria-hidden`; lasts exactly as long as the request |
| Success | real content | replaces the skeleton in place; sizes were measured against the real content |
| Empty | `EmptyState` / "New opportunities are added as they are checked." | only when the request succeeded with zero rows |
| Failed | `SectionError`: message, `role="alert"`, **Try again** | retry re-runs the server render (`router.refresh()`), shows "Trying again…", is disabled while pending; never described as an empty list |
| Invalid filter | message and "Clear filters" link | a retry cannot help, so none is offered |
| Unauthorised | redirect to sign-in (jobseeker), access state (staff) | unchanged; resolved before any placeholder |

No placeholder carries a name, e-mail, number or other value, so nothing private can show while the session or data is unresolved. No minimum display time, no artificial delay: if data is ready it is rendered at once.

## Motion and design

- Colours: `bg-line`, `bg-surface-pale`, `bg-avatar-bg`, borders from tokens; light and dark follow the theme. No new colour, no gradient (the design guard still passes), no inline style (the CSP forbids it), radii only from the token scale.
- One 1.8 s opacity pulse (1 → 0.6) on the whole region, declared under `prefers-reduced-motion: no-preference`; reduced motion gets a still placeholder (also covered by the existing global reduced-motion rule). Opacity is composited, never changes layout and is far below the three-flashes-a-second limit. Never on page backgrounds, never one animation per block.
- A caller's `w-*`/`h-*` replaces the default size instead of competing with it (two conflicting utilities are resolved by stylesheet order, not class order).
- This **supersedes** the earlier "static, no animation" rule of STATE-02 and `BRAND_GUIDELINES.md`; both are updated.

## Inventory

Primitives: `SkeletonText`, `SkeletonHeading`, `SkeletonImage`, `SkeletonAvatar`, `SkeletonButton`, `SkeletonBadge`, `SkeletonCard`, `SkeletonInput`, `SkeletonTable`, `SkeletonList`, `SkeletonPageHeader` (plus `SkeletonLine`, `SkeletonBlock`, `SkeletonPanel`, `SkeletonTabs`, `SkeletonMetricCard/Grid`, `SkeletonListingRow(s)`, `SkeletonHomeRow`, `LoadingRegion`, `SectionError`).

| Page | Skeleton |
| --- | --- |
| Home | hero search (static hero frame is sent at once), category tiles, latest rows; each in its own boundary |
| `/opportunities` (also category, search, filter and location views, which are filters of this route) | search, category tabs, filter form, result count + rows + pagination; each in its own boundary |
| `/opportunities/[slug]` | save control only (see above) |
| `/dashboard`, `/for-you`, `/saved`, `/profile`, `/alerts`, `/account` | header, the real static jobseeker navigation, body |
| `/employer`, claim, new listing, listing, organisation profile | dashboard (figures + table) / form |
| `/workspace` | welcome band, five figures, two panels, table |
| workspace opportunities, activity, content health, manage, records | header, tabs and filter bar where the page has them, table (cards below 768px) |
| workspace opportunity / record / new | detail or form |

Not drawn, because the real page has no such element: a featured image, a related-opportunities block and a separate closing-date block on the opportunity page; images on listing rows (they show an organisation mark). Nothing was invented to fill a skeleton.

## Not applicable in this architecture

There is no client-side data fetching: search and filters are plain `GET` forms and links, so every change is a normal document navigation. The browser keeps the old page on screen until the new response starts, and the new page then streams in. Consequently there is no client request to debounce, no stale result list to keep dimmed, and no scroll position to preserve beyond the browser's own. Duplicate requests are removed on the server with React `cache` (shared categories on home and listing; the listing request shared by the detail page's metadata and body).

## Verification (executed 2026-10-30)

- `npm run test`: 251 passed (227 existing, 24 new in `tests/unit/skeleton-system.test.tsx`), including axe on the skeletons and the error state.
- Real browser (Chromium, Next dev, stub API with controllable delay and failure), desktop 1280 and mobile 390:
  - layout shift while loading: home, listing and detail **0.000** at both widths; the skeletons were tuned against the measured sizes of the real content (hero search 188 px, category block 121 px, filter panel, row heights within 1–3 px on desktop);
  - no horizontal overflow on any page or skeleton at either width;
  - exactly one API call per endpoint per page load (categories, locations, list, listing);
  - no skeleton remains after load in the fast, slow, empty and failed cases; empty shows the empty state, failure shows the error state, **Try again** loads the rows with one more call per endpoint;
  - computed `animation-name` is `skeleton-pulse` without a preference and `none` with `prefers-reduced-motion: reduce`;
  - no hydration warnings (the 33 CSP inline-style messages in dev are identical before and after this change).
- Screenshots (before / after, loading and loaded): `docs/design/evidence/skeleton-loading/`. "Before" has no skeleton for the public pages: a blank screen until the whole page is ready.

## Limits

- Run on Node 22 (the repository pins 24) with a stub API, in `next dev`; no Django stack, no Docker, no production build timing. The Playwright e2e suite needs the full stack and was not run here; it runs in CI.
- Staff, employer and account skeletons were checked as rendered components (screenshots) and in unit tests, not behind a real login, since there is no seeded staff account in this environment.
- Widths 320, 360, 430, 768 and 1024 were not each captured; the layouts use the existing breakpoints (`max-sm`, `md`, container queries) and 390 and 1280 were measured.
- `listCategories`/`listLocations` return `[]` on failure by design, so the home category tiles are hidden (not shown as an error) if that one request fails. Changing that is a library change outside this task.
- Screenshots are dev-mode; fonts and timing differ slightly from production.
