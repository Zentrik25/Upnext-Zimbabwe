# ADR-0003: Monorepo structure

- **Status:** ACCEPTED (owner approval recorded as D-10 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-10

## Context
The pack and specification proposed different layouts (`apps/web`+`apps/api`+`infra/` vs `frontend/`+`backend/`+`infrastructure/`) and docs trees.

## Decision
```
upnext/
├── apps/
│   ├── web/            Next.js + TypeScript + Tailwind
│   └── api/            Django + DRF modular monolith
├── docs/               product/ design/ engineering/ governance/ adr/ phase0/ archive/
├── reference/          approved-flat.html (never edited)
├── infrastructure/     Compose files, env examples, deployment notes (no Granite changes)
├── packages/           optional shared code (e.g. generated API types), only if needed
├── CLAUDE.md  README.md
```
Application directories do not exist until Phase 1 is approved. The single decision register is `docs/governance/DECISION_REGISTER.md`. Legacy pack documents are kept under `docs/archive/legacy-docs/` as reference only.

## Consequences
- CI, Docker contexts and path filters are organised per app. A shared `packages/` directory is created only when two apps need the same artefact.
- Generated OpenAPI types for the web app are built from `docs/engineering/openapi/openapi.yaml` (source of the contract) and the API's generated schema must match it (contract test).

## Alternatives considered
Separate repositories for web and API (rejected: single owner, single release train); spec's `frontend/ backend/` names (rejected by D-10).
