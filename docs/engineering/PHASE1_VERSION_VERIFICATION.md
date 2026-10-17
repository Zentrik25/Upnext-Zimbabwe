# Phase 1 version verification (D-25 / OQ-28)

Date: 2026-10-17. Scope: the pins recommended in `VERSION_RECOMMENDATION.md`, with **Node.js 24 LTS** selected by the owner and the others provisionally accepted. D-25 required verification of package availability, compatibility, security advisories and runtime behaviour **before locking**, and a reported replacement for anything unavailable or incompatible. Every statement below was produced by a command run in this environment (outputs are summarised; commands are in `docs/phase1/PHASE1_REPORT.md`).

## 1. Outcome

| Component | Recommended pin | Final pin | Result |
|---|---|---|---|
| Python | 3.14.8 | **3.14.8** (`python:3.14.8-slim-trixie@sha256:a2b82f3c…9170`) | confirmed; runs the whole API, tests and production image |
| Django | 5.2.18 LTS | **5.2.18** | confirmed |
| Django REST Framework | 3.18.3 | **3.18.3** | confirmed |
| psycopg | 3.3.6 (`binary`) | **3.3.6** (bundled libpq 18.0.6) | confirmed |
| PostgreSQL | 18.6 | **18.6** (`postgres:18.6-trixie@sha256:74935e72…4336`) | confirmed; migrations and the full suite run on it |
| Node.js | 24.22.0 | **24.22.0** (`node:24.22.0-trixie-slim@sha256:7f486cab…c315`; host toolchain verified against the official SHASUMS256) | confirmed; Node 26 not used (D-25) |
| npm | 11.19.1 | **11.19.1** (bundled with Node 24.22.0) | confirmed |
| Next.js | 16.4.2 | **16.4.2** | confirmed (build, dev, standalone runtime, e2e) |
| React / React DOM | 19.3.1 | **19.3.1** | confirmed |

**No pin was unavailable or incompatible; none was replaced.** Supporting dependencies chosen for Phase 1 (not in the earlier recommendation) are listed in §5, including two deliberate *non-latest* choices with evidence (ESLint 9, TypeScript 5.9).

## 2. Availability (checked on 2026-10-17)
- **PyPI** JSON API: Django 5.2.18, DRF 3.18.3, psycopg 3.3.6 exist; `uv pip compile --python-version 3.14 --generate-hashes` resolved the 7 direct runtime requirements to 21 hash-pinned packages and the development tools to 47 more (two lockfiles) (`apps/api/requirements/runtime.txt`, `dev.txt`). Wheels exist for CPython 3.14 (installed from hashes into the pinned image).
- **npm registry**: next 16.4.2, react/react-dom 19.3.1, tailwindcss 4.3.3, vitest 4.1.12, etc. exist; `package-lock.json` has 595 packages; `npm ci` succeeds under Node 24.22.0.
- **Docker Hub**: `python:3.14.8-slim-trixie`, `postgres:18.6-trixie`, `node:24.22.0-trixie-slim`, `nginx:1.31.2-alpine` pulled; digests are pinned in Dockerfiles and Compose.
- **nodejs.org**: the 24.22.0 Linux tarball matched its published SHA-256 before use.

## 3. Compatibility and runtime behaviour (executed)
| Check | Evidence |
|---|---|
| Django 5.2.18 + DRF 3.18.3 + psycopg 3.3.6 on Python 3.14.8 | 69 pytest tests pass in the pinned image; mypy (strict, django-stubs) and ruff clean |
| Django 5.2 on **PostgreSQL 18.6** (task V-01) | all migrations apply (citext extension, custom user model, triggers, cache table); `makemigrations --check` clean; suite passes against 18.6; psycopg bundles libpq 18.0.6 |
| Django 5.2 removed `CIEmailField` | replaced by a small custom `citext` field (ERD still specifies citext) — a Django-5.2-specific finding, not a pin problem |
| Next.js 16.4.2 + React 19.3.1 + Tailwind 4.3.3 on Node 24.22.0 (task V-02) | `next build` (Turbopack), `next dev`, standalone production server, 30 Vitest and 30 Playwright tests |
| Whole stack in containers | `docker compose up` (dev) and the production-mode override: gunicorn + Next standalone; healthchecks green |
| Runtime versions inside the running containers | `python 3.14.8`, `django 5.2.18`, `drf 3.18.3`, `psycopg 3.3.6`, `PostgreSQL 18.6`, `node v24.22.0`, `next 16.4.2`, `react 19.3.1` |

## 4. Security advisories (executed)
| Scan | Result |
|---|---|
| `pip-audit --require-hashes -r runtime.txt` | no known vulnerabilities |
| `pip-audit --require-hashes -r dev.txt` | no known vulnerabilities |
| `npm audit --omit=dev --audit-level=high` (production dependencies) | 0 vulnerabilities |
| `npm audit` (including dev tools) | **5 high**, all one chain: `braces ≤3.0.3` (stack-exhaustion DoS on deeply nested glob patterns) ← micromatch ← fast-glob ← `@next/eslint-plugin-next` ← `eslint-config-next@16.4.2`. **No patched `braces` release exists** (3.0.3 is the latest). The npm "fix" would downgrade `eslint-config-next` to 14.x, which is incompatible. Accepted as a **known limitation**: development-only lint tooling that processes our own file globs, never shipped, never fed untrusted input. CI fails on production-dependency advisories and *reports* dev-tool advisories; revisit when `braces` or the ESLint config ships a fix |
| Earlier advisory checks (Phase 0) for the exact pins | PyPI per-release vulnerability fields and the npm bulk advisory API returned none (still true) |

## 5. Dependency decisions made while locking
| Choice | Why (evidence) |
|---|---|
| **ESLint 9.39.5**, not 10.13.0 | `eslint-config-next@16.4.2` declares `eslint >=9`, but its plugins (`eslint-plugin-import`, `jsx-a11y`, `react`) cap their peer range at ESLint 9; installing ESLint 10 produced invalid-peer errors (tested, then reverted). npm marks 9.39.5 "no longer supported" — a **known limitation** (dev tool only); upgrade when the Next.js lint config supports ESLint 10 |
| **TypeScript 5.9.3**, not 7.0.2 / 6.0.3 | `typescript-eslint@8.71.2` supports TypeScript `<6.1`; Next.js 16 type plugin and tooling are validated against 5.x; a major jump adds risk without need. Works (tsc strict, build) |
| **Vitest 4.1.12 + Vite 7.3.7 + @vitejs/plugin-react 5.2.0** | `@vitejs/plugin-react@6` requires Vite 8; Vitest 5 requires Node ≥22.12 and newer Vite — the chosen set is mutually compatible and fully within every declared peer range |
| `drf-spectacular 0.30.0`, `argon2-cffi 25.1.0`, `gunicorn 26.2.0`, `whitenoise 6.12.0`, `asgiref 3.12.1`, `sqlparse 0.6.0` | resolved by the hash-locked compile for Python 3.14 |
| Dev tools: `pytest 9.1.1`, `pytest-django 4.14.0`, `pytest-cov 7.1.0`, `ruff 0.17.1`, `mypy 2.4.0`, `django-stubs 6.1.2`, `djangorestframework-stubs 3.18.1`, `openapi-spec-validator 0.9.0`, `detect-secrets 1.5.0`, `jsonschema 4.26.0` | locked with hashes |
| Web: `tailwindcss/@tailwindcss/postcss 4.3.3`, `postcss 8.5.30`, `eslint-config-next 16.4.2`, `eslint-config-prettier 10.1.8`, `prettier 3.9.10`, `jsdom 30.1.3`, `@testing-library/react 16.3.3`, `@testing-library/jest-dom 7.0.1`, `@playwright/test 1.64.1`, `@axe-core/playwright 4.14.0`, `server-only 0.0.1`, `@types/node 24.19.2`, `@types/react(-dom) 19.3.0` | exact versions in `apps/web/package.json` (`save-exact`), lockfile committed |
| `pip-audit 2.9.0` in CI | exists on PyPI (latest is 2.10.1; 2.9.0 pinned deliberately and reviewed by Dependabot) |

## 6. Verification tasks from `VERSION_RECOMMENDATION.md`
| Task | Status |
|---|---|
| V-01 Django 5.2.18 + psycopg 3.3.6 + PostgreSQL 18 | **done** (§3) |
| V-02 Next.js 16.4.2 on Node 24 | **done** (§3) |
| V-03 resolve and lock the whole dependency tree | **done** (hash-locked Python, `package-lock.json`) |
| V-04 advisory scans | **done** (§4); scheduled in CI on every build |
| V-05 re-check official support pages | **not possible**: docs.djangoproject.com, djangoproject.com, devguide.python.org, postgresql.org, nextjs.org and endoflife.date were still unreachable from this environment. Support-window dates therefore remain as recorded in `VERSION_RECOMMENDATION.md` §4 (PEPs, release notes, release-schedule JSON, the 5-year rule and secondary summaries) and **must be confirmed against the official pages by a person with access** |

## 7. Operating rules going forward
Lockfiles are authoritative (`pip --require-hashes`, `npm ci`); images are pinned by digest; Dependabot is configured weekly for pip, npm, Docker and Actions; any pin change goes through the decision register. The end-of-life watch (fail the build within 90 days of end of life, `OPS-12`) is **not yet implemented**.
