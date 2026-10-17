# Phase 2 report — opportunity catalogue and editorial CMS

Status: **implemented, awaiting review.** Phase 3 has not been started. Branch `claude/new-session-t9v0fd`. Everything below was produced by a command or CI run that actually executed; limitations and things not run are in §8.

## 1. What was built

| Area | Delivered |
|---|---|
| Data model | `catalog` (categories, locations, sectors, skills, organisations, detail-schema registry), `opportunities` (listing, immutable revisions, locations/skills/sectors, sources, verification records, review decisions, publishing events) and `audit` (append-only events); relational columns plus versioned JSONB category `detail` validated against six JSON Schema 2020-12 files |
| Provenance and verification | Sources (kind, name, URL or citation, date checked, one primary) are separate from verification records (level, method, outcome, evidence). A source check is never shown as verification with the issuer: `issuer_verified` requires method `issuer_contact`; publication and amendments never carry a level forward |
| Workflow | T01–T07, T09–T15 and V01 in `opportunities/workflow.py` (T08 scheduled publishing is absent by default P2-05) |
| Separation of duties | Pure rules in `access/policy.py` called inside the transaction after a row lock; identity-based, over the whole review chain; re-asserted by PostgreSQL triggers |
| Staff interface | Django Admin at `/staff/`: role-scoped queues and filters, search, status shown in words, draft editor, service-backed action pages, read-only history and review records, audited administrator draft viewing, throttled staff login, audited taxonomy and organisation edits |
| Public API | `listOpportunities`, `getOpportunity`, `listCategories`, `listLocations`, `listSectors`, `searchSkills` |
| Public pages | `/opportunities` (search, category tabs, filters, sort, signed-cursor pagination, empty/invalid/rate-limited/unavailable states) and `/opportunities/[slug]` (facts, sanitised description, category details, how to apply, sources and verification, expired/withdrawn banner) |
| Fixtures | `manage.py seed_taxonomies` and `seed_demo --force`: clearly fictional Zimbabwean listings (12 published, all six categories; 4 non-public), random one-time passwords for four demo staff accounts |
| Roles | `manage_staff_role grant|revoke` (audited, privileged) |

## 2. Decisions

Open questions were not invented away: P2-01…P2-10 in `DECISION_REGISTER.md` list the provisional defaults used (expired/withdrawn visibility, taxonomies, currencies USD/ZWG and end-of-day date-only deadlines, https-only URLs and citation-only sources, no scheduled publishing, Django Admin as the staff interface, draft category schemas v1, verification method rules, duplicate rules, an in-house Markdown renderer). They remain **open** owner decisions. ADR-0018 records the approach.

## 3. Database migrations (applied to PostgreSQL 18.6, fresh and over Phase 1)

`audit.0001_initial`, `audit.0002_append_only`, `catalog.0001_initial` (enables `pg_trgm`), `catalog.0002_seed_categories_and_schemas` (six categories and version-1 schema records, deterministic ids), `catalog.0003_id_immutability_triggers`, `opportunities.0001_initial`, `opportunities.0002_workflow_triggers`. `makemigrations --check` reports no changes. Triggers: legal revision state changes, frozen content, no self-review, approval/publication only of the exact revision approved by someone else, immutable slug/category/ids, append-only history, rows of frozen revisions immutable.

## 4. API

Paths, ids and response codes match `docs/engineering/openapi/openapi.yaml`; real responses are validated against the contract's component schemas in tests. One additive contract change: `TransitionRequest.checklist` accepts the optional `applicant_payment_reviewed` flag (AC-CAT-05); the editorial/administration operations stay specified but not exposed. Behaviour notes (cursor binding, `total` on the first page only, parameter errors naming the parameter): `API_CONTRACTS.md`.

## 5. Editorial workflow and permissions — evidence

| Rule | Evidence (test) |
|---|---|
| Nobody approves/rejects/verifies their own submission, even holding Editor or Administrator authority | `test_workflow.py::test_author_cannot_approve_reject_or_verify_their_own_submission`; refusals audited as security events |
| An author with publish authority may publish only after another person approved the exact revision | `test_author_with_publish_authority_publishes_after_another_persons_approval`, `test_author_cannot_publish_an_unapproved_revision` |
| Material edits invalidate approval | frozen revisions (`test_db_invariants.py`), amendments need a new review, `test_tampered_content_after_approval_blocks_publication` (hash re-check even if triggers are bypassed) |
| Database re-asserts the rules | `test_db_invariants.py` (12 tests: raw SQL and ORM attempts are refused) |
| Concurrency | `test_concurrency.py`: two editors approving, two publishers, withdraw versus expiry job, with real threads on PostgreSQL |
| Every transition audited in the same transaction | `test_every_transition_writes_history_and_audit_in_the_same_transaction`; capacity recorded (`administrator`) |
| Staff UI cannot bypass the service | `test_admin.py` (20 tests: read-only listing page, role-scoped queues, forced approval refused, frozen revisions not editable, draft viewing audited) |

## 6. Results (all executed)

| Check | Result |
|---|---|
| Backend `ruff`, `ruff format --check`, `mypy` (strict, 90 files) | clean |
| Backend `pytest` under `config.settings.test` on PostgreSQL 18.6 | **269 passed**, coverage **94.98 %** (gate 85 %) |
| `manage.py spectacular --validate --fail-on-warn` | clean; contract tests pass |
| Web `eslint`, `tsc`, `prettier --check`, `tokens:check`, `next build` | clean |
| Web Vitest | **45 passed** |
| Playwright, dev stack | 60 passed |
| Playwright, production-mode stack with strict console/CSP checks and seeded demo data (local) | **60 passed** (30 foundation + 30 catalogue: axe on list/empty/category/detail at 390 and 1440 px, no horizontal scroll at 320/390/768/1440, flat-design guard, keyboard flow, CSP nonce) |
| Secret scan (working tree and all commits) | clean (two reviewed false positives allow-listed by hash) |
| `actionlint` | clean |
| GitHub Actions, run 39026465093 (commit 6e726e7) | API, Web, secrets and **end-to-end (60 Playwright tests passed)** succeeded; the Documentation job failed only because this report did not exist yet. The final run for the head commit is reported in the hand-over message |

## 7. Defects found and fixed by the tests

A trigger that forbade deleting child rows also blocked editing drafts; two primary sources/locations, a source with neither address nor citation, and half-filled money/deadline pairs caused database errors (now validation errors); `ruff format` versus long literals; the staff login used the proxy's address for its limit (now the same client identification as the API throttles); Django Admin rendering needed an eager render because panels read the request; dev settings used the manifest static storage (admin pages failed without `collectstatic`).

## 8. Known limitations and deferred work

- **Owner approvals pending:** the draft category schemas (OQ-06), taxonomy contents (OQ-21), currencies and date-only semantics (OQ-22), source/URL rules (OQ-29), duplicate rules (OQ-08), verification policy (OQ-07), expired/withdrawn visibility (OQ-20), staff interface and MFA (OQ-16).
- **Design:** the listing/detail pages, verification tags, status banners and pagination link are derived from recorded tokens (DESIGN_TOKENS §4 requires approval of components absent from the reference); a design review is needed. No pixel-level visual regression.
- **Not built (by scope or dependency):** save/unsave and accounts, For You, notifications (authors are not told of approval/rejection, SOD-11), the author/approver pair report (AC-EDIT-09), scheduled publishing (T08), organisation merge, SEO extras (sitemap, structured data, robots), an exposed editorial API, MFA/network restriction for staff.
- **Staff interface:** tested through the Django test client; no browser or screen-reader pass was done on the Django Admin pages.
- **Staff login lock-out:** the per-e-mail limit can lock a named staff account for 15 minutes (no permanent lock-out), as for the public login.
- **Performance:** no load test and no query-plan inspection (DB-04, PERF-*) was run; indexes follow the ERD and are untested at volume.
- **Search:** English full-text search only; no typo tolerance; the search vector is refreshed on publication and organisation renames only.
- **Slug allocation** checks uniqueness before insert; a simultaneous collision would surface as a database error (probability negligible with random suffixes).
- **Audit privileges:** append-only is enforced by trigger for every role; revoking `TRUNCATE`/DDL for the application role is a deployment step.
- Dev-tool advisory chain (`braces`) and the unreachable official support pages (V-05) from Phase 1 are unchanged.

## 9. Recommendations for Phase 3 (not started)

1. Owner review of the provisional defaults and the draft category schemas; approve or amend them in the register.
2. Design review of the derived public components; then SEO (sitemap, structured data, noindex rules), accessibility audit with assistive technology, query-plan and load checks on realistic data.
3. A browser-level review of the Django Admin workflow with real editors; decide MFA and network restriction (OQ-16) before any real staff accounts.
4. Decide notifications for authors and the audit report of related author/approver pairs before launch.
