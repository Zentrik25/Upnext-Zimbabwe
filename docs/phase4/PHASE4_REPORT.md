# Phase 4 report — public launch readiness, SEO and account completion

Status: DRAFT, implemented and awaiting review. Authorised by the owner on 2026-10-17 (D-28); baseline `6b688b8` (CI 39059357800). Nothing was deployed; the VPS, Traefik/Nginx and The Granite Post were not touched. Phase 5 has not been started. **Nothing here is legal approval:** the privacy and terms pages are drafts for owner and legal review.

## 1. Scope

| Priority | Built |
|---|---|
| 1. Website foundations | `robots.txt`, `sitemap.xml` fed by a new `GET /api/v1/sitemap`, canonical and noindex rules, JobPosting structured data using only stated facts, breadcrumbs, a real home page, `/about`, `/contact`, `/privacy`, `/terms` |
| 2. Account deletion | 14-day cooling-off with cancel, scheduled execution as a tombstone (saved rows, sessions, tokens, MFA devices deleted; outbox addresses scrubbed; audit kept), notices by e-mail, retention jobs for tokens, sessions and outbox |
| 3. Privacy and terms | Draft pages, marked as drafts, noindex, bracketed gaps where facts are missing |
| 4. E-mail provider architecture | Adapter registry, hardened SMTP adapter (tested against a stub server only), suppression list, Administrator-only outbox view with audited retry, `check_email_config`, `outbox_status`, `suppress_address`. **No provider chosen, no credentials invented, production sends nothing until configured** |
| 5. Security review | Production start-up refusals (see section 5), staff access runbook, production configuration guide |
| 6. Accessibility and mobile | axe at four widths on every page, structure, 400% reflow and keyboard specs; fixes listed in section 6 |
| 7. Performance | Synthetic 24,012 listings; section 4 |
| 8. Decisions and blockers | `docs/governance/LAUNCH_BLOCKERS.md`, D-28, D-29, P4-01…P4-11, ADR-0020 |
| Owner instruction during the phase | **D-29**: 4px radius on buttons, inputs, selects and textareas (section 7) |

Provisional defaults P4-01…P4-11 are engineering defaults, not owner decisions (English only, indexing rules, noindex for closed listings, no analytics, 14-day cooling-off, retention windows, provider-agnostic e-mail, production safeguards, public base URL, contact address unset, structured-data policy).

## 2. Commits (on `claude/new-session-t9v0fd`, after `6b688b8`)

`74ddf6a` SEO foundations · `8176589` deletion lifecycle · `7f2dde2` e-mail provider · `e3d946c` production configuration guide and staff runbook · `a25a19c` accessibility suite · `ddd0299` performance · `54c3a5c` control radius (D-29). The last commit also carries the remaining working-tree changes of the phase (CMS-journey extension, CI `E2E_DEMO_PASSWORD`, sitemap cache setting, decision register, ADR-0020, roadmap, launch blockers, traceability, secret-scan allow-list); it is larger than its title says. A Dockerfile fix made during the final run follows it.

## 3. Checks actually run (local, PostgreSQL 18.6)

| Check | Result |
|---|---|
| Backend `ruff check`, `ruff format --check`, `mypy` (126 files), `makemigrations --check`, `spectacular --validate --fail-on-warn` | pass |
| Backend `pytest` | **398 passed**, coverage 95.24% (threshold 85%) |
| Web `lint`, `typecheck`, `format:check`, `tokens:check`, `build` | pass |
| Web unit tests (Vitest) | **84 passed** |
| Production-mode stack (`upnext-prod`), full Playwright run with `E2E_STRICT_CONSOLE=1 E2E_DEMO_DATA=1 E2E_ACCOUNTS=1 E2E_CMS=1`, one worker | **131 passed**, 0 failed, 0 skipped (includes the SEO, accessibility, control-radius, account and staff CMS journeys) |
| Docs check, traceability generator (177 tests, 33 requirements), secret scan | pass (docs check, traceability regenerated with no diff, secret scan clean over 40 commits) |
| GitHub Actions (CI run 39064354219, head `cbc802c`) | **success** |

A real bug was found by the production-mode build: the start-up safeguards added in this phase made the image's build-time `collectstatic` fail. The Dockerfile now sets `UPNEXT_ENVIRONMENT=local-prod-like` for that one command only.

## 4. Performance (24,012 synthetic listings, before → after)

| Query | Before | After |
|---|---|---|
| Default list | 159 ms | 46 ms |
| Closing-soon sort | 160 ms | 44 ms |
| Deep cursor page | 136 ms | 26 ms |
| Search `q=engineer` | — | about 100 ms |
| Saved list | — | 21 ms |
| Sitemap (2.3 MB) | — | about 375 ms |

Change: `live_version` is now one-to-one (`live_for`), the public join uses it, and two orderings walk indexes (`opp_public_newest_idx`, `ver_deadline_id_idx`, migration `0005`). Raw output: `docs/phase4/acceptance/perf-before.txt`, `perf-after.txt`; tooling in `tools/perf/`. Single-connection timings on one machine; not a load test with concurrent users. Search is still `ILIKE`-style (no full-text index); acceptable at this size, revisit with real content.

## 5. Security review

Production (`UPNEXT_ENVIRONMENT=production`, the default) refuses to start if: staff two-step is off, demo tools are on, HSTS is under one year, hosts contain `*`, CSRF origins or the base URL are not https, the token key equals the secret key or is short, a development e-mail backend is set, or SMTP settings are inconsistent. `local-prod-like` relaxes these for local images only. Staff-role holders cannot be self-deleted (409). Registration, resend and reset keep uniform answers with decoy work; timing is comparable, not proven identical. Cookies were checked over HTTP in the production-mode stack only (`Secure`, `HttpOnly`, `SameSite=Lax`); HSTS and TLS are unverified until there is a real domain. Procedures: `docs/engineering/PRODUCTION_CONFIGURATION.md`, `STAFF_ACCESS_RUNBOOK.md` (drafts).

## 6. Accessibility and mobile

Automated: axe (WCAG 2.2 A/AA, best practice) is clean on every public and account page at 320, 390, 768 and 1440; no horizontal scroll; 400% reflow; keyboard flow. I inspected real renders (home, list, sign-in, account at several widths; screenshots under `docs/phase4/acceptance/`). Fixes: 44px tap targets for standalone links, `h1` on error and not-found pages, the save link for visitors no longer underlined. **Not done:** a manual screen-reader pass and testing on real phones (B-10). The grey square in dev screenshots is the Next.js development indicator.

## 7. Control radius (D-29)

Owner instruction: 4px on all buttons, inputs, selects and textareas, desktop and mobile. Implemented through the token `--radius-control` (`tokens.json` → generated CSS), a global rule for native controls, `rounded-control` on `Button`, `ButtonLink`, fields, a new `Textarea` primitive, and two button-styled links (home category links, the apply link). The joined search group is rounded as a whole and keeps its inner edges square from 651px. Checkboxes, radios, panels, tags, notices, callouts and rows stay square. The zero-radius guards were changed to allow only that exception; reference-parity tests override the radius for controls; a new spec checks radius and minimum heights at four widths. Sizes, colours and focus styles are unchanged. This deviates from D-08/ADR-0001 for controls; `reference/approved-flat.html` is untouched. I treated the home category links as buttons because they look like secondary buttons; say if they should stay square. The Django staff site is not changed.

## 8. Not done / limitations

No e-mail provider and no real delivery (stub-tested only); no legal text; no analytics; no data export (OQ-09); change of e-mail address, profile, For You and matching are not built; deletion execution was tested with a fake clock, not over days; the worker's scheduling is a loop, with no alerting; manual accessibility audit; no concurrent load test.

## 9. Launch blockers and decisions

See `docs/governance/LAUNCH_BLOCKERS.md` (B-01…B-10: e-mail provider, legal review and operator identity, contact address, domain/TLS, staff access policy, approval of provisional defaults, backups and monitoring, deployment path, real content, manual accessibility audit) and its owner-decision table.

## 10. Phase 5 readiness

The Phase 4 scope works end to end in the production-mode stack. Real use stays blocked by the items above. I have **not** started Phase 5 and am waiting for written approval.
