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

## Re-verification after D-53 (executed 2026-10-31)

D-53 changed real sizes (40px form controls, the type scale, the home hero), so the skeletons were measured again against the **real stack** this time: the Django API on PostgreSQL 16 with the `seed_demo` data, the web app in front of it, and a delaying proxy (1.5 to 2.5 s) between them. Layout shift is the browser's own `layout-shift` entries, at 390 and 1280 px.

| Page | Before | After |
| --- | --- | --- |
| Home (hero search 4 px short, button was 37.6 px not 44 px) | 0.0019 (390), 0.0005 (1280) | **0** |
| `/opportunities` and its category, search and filter views (search skeleton 4 to 8 px tall) | 0.0067 (390), 0.0024 (1280) | **0** |
| `/opportunities/[slug]`, empty search, failed load | 0 | 0; the failure shows the error and **Try again**, never an empty list |
| `/account` (skeleton 633 px against 1332 px, no sign-out button, wrong title height) | 0.1785 / 0.078 | **0** (five panels at their real heights) |
| `/profile`, `/alerts` (skeleton 663 px against 3207 and 1944 px, intro height wrong) | 0.1469 / 0.09 and 0.1469 / 0.045 | **0** (long forms, real intro height) |
| `/saved` with saved items | 0.3893 / 0.2417 | **0** (three rows, real intro height) |
| `/dashboard`, `/for-you` | 0 | 0 |
| Staff workspace: overview, opportunities, activity, content health, manage, records, audit, new listing (as the demo administrator, with the two-step code) | not measured | **0** at both widths |

What changed: `SkeletonInput` fields in the search skeletons are 40 px (`h-field`) and the desktop search group 42 px; the home submit button has an explicit `h-[44px]` (the old `min-h-[44px]` lost to the button's own `min-h-control`, so the real button was 37.6 px); `SkeletonPageHeader` takes the real introduction height at phone and desktop widths and the page title is 29 px under 651 px and 35 px above; `SeekerPageLoading` and the saved and for-you loading files pass that height; new `ProfileLoading`, `AlertsLoading` and `SkeletonChoiceGroup` replace the generic form skeleton; `AccountLoading` draws the five real panels. `tests/unit/skeleton-system.test.tsx` has four tests that tie these sizes to the real controls.

Not zero, by nature of the data: a person with **nothing saved** sees three placeholder rows and then a short "You have not saved anything yet" page, so the footer rises into view (0.22 at 390, 0.13 at 1280). The employer portal skeleton draws the dashboard of an organisation; a person with no organisation yet gets a short claim card instead (0.13 at 390). The staff and employer skeletons were not exercised with an employer account (none is seeded).

## Limits

- The 2026-10-30 run used Node 22 (the repository pins 24) with a stub API, in `next dev`; the 2026-10-31 re-verification above used the real Django API and PostgreSQL 16 but still Node 22 and `next dev`, no Docker and no production build timing. The Playwright e2e suite needs the full stack and was not run here; it runs in CI.
- Staff, employer and account skeletons were checked as rendered components (screenshots) and in unit tests, not behind a real login, since there is no seeded staff account in this environment.
- Widths 320, 360, 430, 768 and 1024 were not each captured; the layouts use the existing breakpoints (`max-sm`, `md`, container queries) and 390 and 1280 were measured.
- `listCategories`/`listLocations` return `[]` on failure by design, so the home category tiles are hidden (not shown as an error) if that one request fails. Changing that is a library change outside this task.
- Screenshots are dev-mode; fonts and timing differ slightly from production.
