# UPNEXT

Zimbabwe-first opportunity discovery: jobs, internships, graduate programmes, scholarships, tenders and grants.

**Status: Phase 1 (application foundation) — implemented and awaiting review.** The Phase 0 documentation package is the approved baseline; see `docs/governance/DECISION_REGISTER.md` (source of truth for decisions) and `docs/phase1/PHASE1_REPORT.md` (what was built and verified). Nothing is deployed, and nothing touches The Granite Post or the existing Traefik/Nginx.

## Repository layout
| Path | Contents |
|---|---|
| `apps/web` | Next.js 16 + TypeScript + Tailwind CSS 4 (design tokens, UI primitives, tests) |
| `apps/api` | Django 5.2 + Django REST Framework modular monolith on PostgreSQL 18 |
| `infrastructure/compose` | local Docker Compose stack (dev and production-mode override) |
| `docs/` | product, design, engineering documentation, ADRs, governance, Phase reports |
| `reference/approved-flat.html` | the approved visual reference — never edited |
| `tools/` | documentation-consistency check, traceability generator, secret scan |
| `.github/` | CI workflow and Dependabot configuration |

## Quick start
See **`docs/engineering/LOCAL_DEVELOPMENT.md`**. In short: copy `infrastructure/compose/.env.example` to `.env`, fill in random secrets, run `docker compose up --build -d` in `infrastructure/compose`, open http://localhost:8080/.

## Pinned versions
Python 3.14.8 · Django 5.2.18 LTS · DRF 3.18.3 · psycopg 3.3.6 · PostgreSQL 18.6 · Node.js 24.22.0 · Next.js 16.4.2 · React 19.3.1 — verified in `docs/engineering/PHASE1_VERSION_VERIFICATION.md`.

## Ground rules (see `CLAUDE.md`)
Documents are the source of truth; open decisions are never defaulted; the flat design and approved tokens are preserved (accessibility corrections are limited to the documented deviations); editorial separation of duties is enforced on the backend; no secrets in Git; no deployment without explicit approval.
