# Phase 1 report — application foundation

Status: **complete, awaiting owner review.** Phase 2 has not been started. Date: 2026-10-17. Branch: `claude/new-session-t9v0fd`.

Everything below was produced by a command actually run in this environment. Items that were *not* run are listed in §6 and are not claimed as passed.

## 1. Quality gates (D-24 / round-4 instruction)

| # | Gate | Result | Evidence (executed) |
|---|---|---|---|
| 1 | Frontend starts and renders | **pass** | dev stack and production-mode stack from a clean clone; Playwright `home renders with landmarks and a live API status` |
| 2 | Backend responds through `/api/v1/` | **pass** | `GET /api/v1/` → `{"name":"UPNEXT API","version":"v1","status":"ok"}`; `/health/ready` → `{"status": "ok"}` through the proxy |
| 3 | PostgreSQL connects, migrations run | **pass** | PostgreSQL 18.6; `showmigrations --plan` all applied (accounts, core, auth, sessions, admin, contenttypes); `makemigrations --check` → "No changes detected"; `migrate` → "No migrations to apply" on the running stack |
| 4 | Frontend + backend together in Docker Compose | **pass** | project `upnext-clean` (fresh clone, fresh volumes): dev stack, then the `compose.prod-like.yaml` override (gunicorn + Next standalone); all four services healthy |
| 5 | Automated tests | **pass** | backend `pytest`: 69 passed, coverage 93.08% (gate 85%); web Vitest: 30 passed; Playwright: 30 passed on the dev stack (non-strict) and 30 passed on the production-mode stack with `E2E_STRICT_CONSOLE=1` |
| 6 | Type check and lint | **pass** | `ruff check`, `ruff format --check` (46 files), `mypy` strict (46 files); `eslint .`, `tsc --noEmit`, `prettier --check .`, `tokens:check` — all run both on the host and inside the clean-clone web container |
| 7 | OpenAPI validation | **pass** | `manage.py spectacular --validate --fail-on-warn` exit 0; generated schema contract-tested against `docs/engineering/openapi/openapi.yaml` (`tests/test_openapi.py`) |
| 8 | No secrets committed | **pass** | `tools/scan-secrets.sh` (detect-secrets 1.5.0): "no secrets detected in the working tree or in 11 commits"; a planted secret was detected earlier in the phase. One documentation placeholder in history was reviewed and allow-listed by hash; the doc now uses an interactive prompt |
| 9 | UI matches the approved flat design | **pass (computed-style parity)** | 30 Playwright tests: zero radius/shadow/gradient, Arial 13px/1.55, element-by-element computed-style parity against the reference evidence at 1440px where *only* DEV-01…DEV-04 may differ; axe-core; no horizontal scroll at 320/768/1440 |
| 10 | Documentation consistent | **pass** | `tools/check_docs.py` reported exactly 5 missing-path errors, all for this file; re-run result is in §7 |

## 2. Pinned versions (verified in running containers)

Python 3.14.8 · Django 5.2.18 LTS · DRF 3.18.3 · psycopg 3.3.6 · PostgreSQL 18.6 · Node.js 24.22.0 (npm 11.19.1) · Next.js 16.4.2 · React 19.3.1 · Tailwind CSS 4.3.3 · TypeScript 5.9.3 · ESLint 9.39.5 · Vitest 4.1.12 · Playwright 1.64.1 · drf-spectacular 0.30.0 · argon2-cffi 25.1.0 · gunicorn 26.2.0. Python deps are hash-locked (21 runtime, 47 dev); `package-lock.json` has 595 packages; images are pinned by digest. Full evidence, including two deliberate non-latest choices: `docs/engineering/PHASE1_VERSION_VERIFICATION.md`.

## 3. Startup

See `docs/engineering/LOCAL_DEVELOPMENT.md`. In short: copy `infrastructure/compose/.env.example` to `.env` (set the secrets), then `docker compose up --build` from `infrastructure/compose/`; the site is on `http://localhost:8080` (override with `UPNEXT_HTTP_PORT`). Production-like: add `-f compose.prod-like.yaml`.

## 4. Delivered

Monorepo (`apps/web`, `apps/api`, `infrastructure`, `tools`, `docs`); Django/DRF API with custom UUID user model created before the first migration, role registry (Contributor, Editor, Administrator; no Publisher) and pure separation-of-duties policy functions (D-22, D-23), session auth with CSRF, Argon2id, throttling, uniform errors, JSON logging with redaction, health probes; Next.js 16 app with token-generated Tailwind theme and UI primitives (`/design-system`); nonce CSP; Compose stack with Nginx dev proxy; GitHub Actions workflow and Dependabot; secret scan; documentation and traceability tooling. Implemented endpoints: `GET /api/v1/`, `/auth/csrf`, `/auth/login`, `/auth/logout`, `/me`.

Not implemented (out of scope by instruction): opportunity CMS, matching engine, employer portal, payments, notifications, registration/profile product, VPS deployment. The Granite Post and its Traefik/Nginx were not touched.

## 5. Decisions recorded

D-25 (Node 24 LTS and version verification), D-26 (Phase 1 authorisation), ADR-0011…ADR-0017; the register, matrix, workflow, ERD and traceability were updated in the same commits.

## 6. Known limitations and things not run

- **GitHub Actions has not run.** The workflow was linted with actionlint only; its first run is the real test.
- Official Django, Python, PostgreSQL, Next.js and endoflife.date pages were unreachable from this environment (task V-05): support-window dates need confirmation by a person with access.
- ESLint 9 is flagged "no longer supported" by npm (Next's lint plugins cap at ESLint 9).
- `npm audit` reports 5 high advisories, one dev-only chain (`braces` via `eslint-config-next`); no patched release exists. Production dependencies: 0 vulnerabilities.
- Visual parity is computed-style based; there is no pixel-diff regression.
- The end-of-life build watch (OPS-12) is not implemented.
- Sessions and rate-limit cache are database-backed (D-11), as designed.
- Web container memory limit raised to 2g because ESLint and the build ran out of memory at the default.

## 7. Documentation check

`python tools/check_docs.py` after adding this file: `docs consistent: 47 operations, 169 planned tests (36 implemented), 59 decision ids, 6 category schemas, 12 examples` (exit 0). `tools/traceability/generate.py` regenerates `TRACEABILITY.md` with no diff.

## 8. Recommendations for Phase 2

1. Run the CI workflow on GitHub and fix whatever it finds before building on it.
2. Implement the opportunity model and editorial workflow service against `access/policy.py`, with transactional row locks and the audit log in the same transaction.
3. Registration, email verification and password reset on top of the outbox design.
4. Confirm the V-05 support dates; add the OPS-12 end-of-life check.
5. Decide OQ-13/OQ-16 (administrator controls, MFA) before staff UI work.
