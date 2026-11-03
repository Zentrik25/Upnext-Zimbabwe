# Phase 3 report — accounts, saved opportunities and staff security

Status: DRAFT, implemented and awaiting review. Authorised by the owner on 2026-10-17 (decision D-27). Nothing was deployed; the VPS, Traefik/Nginx and The Granite Post were not touched. Phase 4 has not been started.

## 1. Scope and how it differs from the roadmap

The owner's instruction was: user authentication, accounts and saved opportunities, together with staff security improvements, on the existing design and architecture, with all CI gates, and a stop for review afterwards. That **re-sequences** `docs/governance/ROADMAP.md`, where "Phase 3" was the public website and accounts came in phases 4 and 5. The roadmap now shows Phase 3 as this work and keeps the earlier public-website items (SEO sitemap and structured data, static pages) as "3b, not started". The questions this work touches (OQ-03, 04, 09, 15, 16, 17, 31) are still open; the build used provisional defaults **P3-01…P3-08** in the decision register, rationale in ADR-0019. They are engineering defaults, not owner decisions, and none is marked approved.

**Built**
- Registration, e-mail confirmation, resend, sign-in, sign-out, forgotten and changed password, display-name change, "where you are signed in" with per-session revoke, account-deletion request and cancel.
- A transactional e-mail outbox with a sender port, a `worker` service, retries and dead-lettering (no provider chosen yet).
- Saved opportunities: save, unsave, list with availability, category filter, paging, and a states-only lookup used to mark save buttons.
- Staff security: two-step verification (TOTP and recovery codes) in front of `/staff/`, a Content-Security-Policy for the staff site, 30-minute idle / 8-hour staff sessions (seekers 7 days idle / 30 days), audited sign-in and second-step events, an audited reset command.
- Web pages: `/register`, `/sign-in`, `/verify-email`, `/forgot-password`, `/reset-password`, `/saved`, `/account`; header state; save control on list rows and the detail page.

**Not built (still open):** profile and onboarding, For You, change of e-mail address, deletion *execution* and data export (OQ-09), an account-status administration screen, privacy notice and terms pages, analytics, sitemap and structured data, network restriction for staff, WebAuthn, second-administrator confirmation (OQ-13), a real e-mail provider.

## 2. Changed files (main ones)

| Area | Files |
|---|---|
| Identity and tokens | `apps/api/accounts/{models,services,tokens,sessions,signals,mfa,apps}.py`, migration `accounts/0003`, commands `reset_staff_mfa`, `demo_totp_code` |
| Outbox | `apps/api/notifications/` (models, sender port and adapters, services, templates, commands `process_email_outbox`, `last_email`), migration `notifications/0001` |
| Saved | `apps/api/opportunities/saved.py`, `SavedOpportunity` model and migration `0004` |
| API | `apps/api/api/{account_views,account_serializers,throttles,views,serializers}.py`, `api/v1/urls.py`, `docs/engineering/openapi/openapi.yaml` (additive) |
| Staff | `apps/api/core/{staff_mfa,middleware}.py`, `core/templates/admin/accounts/mfa.html`, `config/urls.py`, settings |
| Web | `apps/web/src/app/{register,sign-in,verify-email,forgot-password,reset-password,saved,account}/`, `components/account/*`, `components/opportunities/{parts,saved-row}.tsx`, `components/layout/site-header.tsx`, `lib/{client-api,safe-next,session}.ts` |
| Infrastructure and CI | `infrastructure/compose/compose.yaml` and `compose.prod-like.yaml` (`worker` service, local/CI-only conveniences), `.github/workflows/ci.yml` (account journey and CMS journey steps) |
| Docs | decision register (D-27, P3-01…08), ADR-0019, roadmap, security architecture, API contracts, technical architecture, local development, traceability (generated), `CLAUDE.md` stage line |
| Tests | `apps/api/tests/{test_accounts_api,test_outbox,test_saved,test_staff_mfa}.py`, `apps/web/tests/unit/accounts.test.tsx`, `apps/web/tests/e2e/{accounts-journey,cms-journey,exec}.ts` |

Contract changes (all additive, in `API_CONTRACTS.md`): `GET /me/saved` accepts `ids` and may answer 400; `User` gains nullable `deletion_requested_at`. The earlier Phase 1 and 2 behaviour is unchanged except that the staff site now requires the second step.

## 3. Security design points worth reviewing

- **No recoverable secret at rest.** E-mail links are `selector.HMAC(...)`; the database holds only a selector row. The staff TOTP secret is derived from a server key and a stored nonce. Rotating `UPNEXT_TOKEN_KEY` invalidates links and resets staff devices.
- **Uniform answers.** Register, resend and reset-request return the same 202 for every address; unknown addresses run "decoy" writes that are rolled back. Login stays generic and spends an Argon2 check for unknown addresses. Timing is *comparable*, not proven identical.
- **The second step is tied to the session**, so a password-only session created through the API cannot open `/staff/` (verified through the full production-mode stack: a staff API session was redirected to `/staff/mfa/`).
- **Links cannot be consumed by scanners.** Confirming an address is an explicit click; the token is removed from the address bar; the pages send `no-referrer` and `noindex`.
- **A squatted address can be recovered.** Someone registering a victim's address first would otherwise block them; a password-reset request for an unconfirmed address sends the confirmation link instead.
- **No open redirect.** Return addresses after sign-in (and after the staff second step) are matched against an allow-list.
- **Session records store the session key** (not a hash as in the ERD draft) so revocation is a keyed delete; it is the same value Django's session table already holds (P3-08).

## 4. Tests and checks actually run

All run locally in this environment against PostgreSQL 18.6 unless stated.

| Check | Result |
|---|---|
| Backend `ruff check`, `ruff format --check`, `mypy` (114 files) | pass |
| `makemigrations --check`, `spectacular --validate --fail-on-warn` | pass |
| Backend `pytest` (`config.settings.test`, full suite) | **350 passed**; coverage 95.1% (threshold 85%). New: 38 account tests, 13 outbox and token tests, 13 saved, session-limit and CSP tests, 14 staff two-step tests |
| Web `lint`, `typecheck`, `format:check`, `tokens:check`, `build` | pass |
| Web unit tests (Vitest) | **76 passed** (30 new) |
| Playwright on the production-mode stack, `E2E_STRICT_CONSOLE=1 E2E_DEMO_DATA=1` | 61 passed, 16 skipped (the two gated journeys) |
| Seeker account journey (`E2E_ACCOUNTS=1`), production-mode stack | 8 passed; also 8 passed on the dev stack after the header change |
| Staff CMS journey with two-step verification (`E2E_CMS=1`), production-mode stack | 8 passed |
| Secret scan, docs check, traceability generator | pass; 11 reviewed false positives added to the allow-list (enum names and test fixtures) |

The last change (header label "Register" and one screenshot wait) was re-run on the **dev** stack only (account journey, unit tests, type check); the full production-mode run above was made just before it. CI runs both. GitHub Actions: see the run URL in the hand-off message, not recorded here.

Bugs found by the new tests and fixed during the build: a password change signed the current browser out (session hash not re-bound); a squatted unconfirmed address could not be recovered; tests that depended on the developer's throttle environment (limits are now pinned in `config/settings/test.py`).

## 5. Visual and accessibility review

Screenshots from the real renders are in `docs/phase3/acceptance/screenshots/` (account pages at 320, 390, 768, 1440; journey states) and `staff-screenshots/` (staff site). I opened and checked: sign-in with the unconfirmed notice, account at 1440 and 390, the list with a saved heart, the saved page, register at 320 and sign-in at 320; I did not open every file. axe (WCAG 2.2 A/AA and best-practice) is clean on register, sign-in, forgot password, the accepted-registration state, reset, saved (with items and empty) and account (with the deletion state); no horizontal scroll at 320–1440 on the three public forms and at 390 on the account page. The pages use the existing flat primitives only.

Findings: at 320 px the header wrapped ("Sign in", "Create account" broke across lines) → fixed by shortening the link to "Register" and no-wrap; the sign-in page shows "Send the link again" above the fields when an address is unconfirmed (acceptable, could be moved); the grey square in the corner of dev screenshots is the Next.js development indicator and does not exist in the production build. **Not done:** a manual keyboard-only and screen-reader pass.

## 6. Performance

No load test was run for the new endpoints. Checked: the saved list and the staff queue make a constant number of queries as the number of items grows (regression tests). Each page render for a signed-in person adds one internal `/me` request (visitors with no cookie add none); the list page adds one saved-states request. Public listing endpoints are unchanged and stay anonymous. The database-backed throttle cache (ADR-0004) now also counts account endpoints; unchanged concern from the Phase 2 review.

## 7. Launch blockers and deferred items

**Launch blockers (before real accounts or staff use production):**
1. **No e-mail provider (OQ-03).** Until one is chosen and its adapter tested, confirmation and reset links cannot be delivered; production defaults to sending nothing.
2. **Privacy, retention and deletion (OQ-09).** No privacy notice or terms exist, deletion is only recorded, and retention periods are undefined. Needed before collecting personal data from real people.
3. **Owner decisions on the P3 defaults**, especially the staff two-step policy (P3-07), account states (P3-02), and the numeric limits (P3-03).
4. **Deployment checks not done here:** Secure/HttpOnly cookies and HSTS over real TLS (the production-mode stack was checked over HTTP: cookies carry `Secure`, `HttpOnly`, `SameSite=Lax`); `UPNEXT_DEMO_TOOLS`, the file mail backend and `UPNEXT_STAFF_MFA_REQUIRED=false` must never be set in production.
5. **Staff access procedure:** who gets accounts, how a sole administrator recovers (recovery codes, or the server-side break-glass command), and whether network restriction is also required (OQ-16).

**Deferred:** exact timing equality for unknown addresses; sessions created before Phase 3 are not tracked (development only); a concurrent two-process outbox claim test; a `job_run` table and alerting for dead mail (the worker only writes a heartbeat file); WebAuthn; change of e-mail address; staff CSP still allows inline styles (Django Admin needs them); the staff site on phones; manual accessibility pass; load testing.

## 8. Phase 4 readiness

Phases 1 and 2 stay as accepted. The implemented scope works end to end in a real browser and the test suites pass, but real use is blocked by the e-mail provider and the privacy decisions above. I recommend the owner decide the blockers and the provisional defaults before the next phase. **I have not started it and am waiting for written approval.**
