# Production readiness checklist — DRAFT

Status: DRAFT, 2026-10-30. Each line says what evidence exists. "Documented" means a repository document or CI job says so and this pass **did not re-verify it**. "Verified here" means this pass ran it. Nothing is deployed and no live system was inspected.

Legend: **V** verified here · **D** documented, not re-verified · **U** unverified / needs the real environment · **X** not done, owner or external party required.

## Application

| Item | State | Evidence or gap |
|---|---|---|
| API lint, types, migrations in sync | V | ruff, mypy, `makemigrations --check` clean |
| API tests | V | 933 passed, 94.37% coverage (local, Python 3.14.6, PostgreSQL 16) |
| Web lint, types, format, tokens | V | clean (Node 22 locally; project pins Node 24) |
| Web unit tests | V | 257 passed |
| Browser (Playwright) suites, axe | U | not run here; run in CI |
| Production build of the web app | U | not run here |
| CI on this branch | U | not run; the branch has no CI result yet |
| Docs consistency | V | `tools/check_docs.py` |
| Dependency advisories | npm V (0), pip D | `pip-audit` runs in CI |
| Secret scan | D | `tools/scan-secrets.sh` in CI |

## Listing lifecycle

| Item | State | Evidence or gap |
|---|---|---|
| Expiry job scheduled, one run at a time, recorded, alerted | D, tests V | `run_worker`, `core_jobrun`, `test_expiry_job.py` |
| Deadline boundary agrees across search, sitemap, state, job | V | `test_listing_freshness.py` |
| Saved list agrees at the boundary | V (after HF-01) | same file |
| Separation of duties, audit trail | D, tests V | workflow tests pass |
| Page caching can show a stale status | V by design | pages are dynamic |

## Operations (all depend on the real environment)

| Item | State | Evidence or gap |
|---|---|---|
| Health checks, release, rollback, verify scripts | D | `infrastructure/deploy/` |
| Backups: encryption, tamper refusal, restore and re-applied deletions | D | rehearsed in CI (`docs/engineering/BACKUP_AND_RESTORE.md`) |
| Off-server backup target, key custody, measured restore time | X | B-07 |
| Alert catalogue and a real alert destination | D / X | `docs/engineering/MONITORING_AND_ALERTING.md`; no destination exists (B-07) |
| Certificate expiry, disk, CPU, RAM, container restarts on the VPS | U | needs Phase 7 inspection |
| Traefik and nginx routing, The Granite Post unaffected | U | `docs/engineering/PRODUCTION_DEPLOYMENT_PLAN.md` is a plan; nothing inspected |
| `X-Forwarded-For` overwritten at the real edge (relied on by HF-02) | U | needs inspection |

## External dependencies

| Item | State |
|---|---|
| E-mail delivery verified (Resend, DNS, test mail, webhook) | X (B-01) |
| Privacy and Terms legally reviewed; operator identity | X (B-02) |
| info@upnext.co.zw confirmed to receive mail | X (B-03) |
| Google OAuth redirect URI registered for upnext.co.zw | U |
| Search Console and Bing Webmaster verification, sitemap submission | X (see `docs/engineering/SEARCH_CONSOLE_GUIDE.md`); no indexing or Google Jobs placement is promised |
| Real content and named editors | X (B-09) |
| Manual accessibility audit | X (B-10) |
