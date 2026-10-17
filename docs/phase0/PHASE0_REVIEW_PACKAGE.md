# UPNEXT — Phase 0 review package

**Status: DRAFT — submitted for owner review. Nothing is approved until you say so in writing.**
Date: 2026-10-17 · Scope: documentation only. No application code, no database migrations, no VPS or infrastructure change, no Phase 1 work.

## 1. What is in the package

| Requested item | Document | Notes |
|---|---|---|
| Updated reconciliation and specifications | `docs/phase0/SPEC_V1_RECONCILIATION.md`; updated `PRD`, `DOMAIN_MODEL`, `TECHNICAL_ARCHITECTURE`, `API_CONTRACTS`, `SECURITY`, `INFORMATION_ARCHITECTURE`, `DESIGN_SYSTEM`, `SCREEN_SPECIFICATIONS`, `TEST_STRATEGY`, `ROADMAP`; `CLAUDE.md` | every finding shows its resolution or OQ id |
| Design tokens from the reference | `docs/design/DESIGN_TOKENS.md` + `docs/design/evidence/reference-computed-styles.json` | measured with Chromium at 1440/390/320; reference unchanged (SHA-256 recorded) |
| Entity relationship diagram and relationships | `docs/engineering/ERD.md` | Mermaid diagram, 30 application tables (plus Django session and cache tables), constraints, indexes, deletion rules |
| Field-level validation | `docs/engineering/VALIDATION_SPEC.md` | limits are PROPOSED engineering values; category fields are DRAFT (OQ-06) |
| OpenAPI request/response contracts | `docs/engineering/openapi/openapi.yaml` | OpenAPI 3.1; passes an OpenAPI validator: 40 paths, 46 operations, 42 schemas |
| Final role–permission matrix | `docs/engineering/ROLE_PERMISSION_MATRIX.md` | strict reading of OQ-12 specified |
| Editorial workflow state machine | `docs/engineering/EDITORIAL_WORKFLOW.md` | Mermaid diagram, 15 transitions plus a verification action, guards, invariants |
| Security and authentication architecture | `docs/engineering/SECURITY_ARCHITECTURE.md` | includes the Redis-free email outbox design and 20-item threat model |
| ADRs for the approved decisions | `docs/adr/ADR-0001…0010` + index with 12 proposed items | one ADR per decision D-08…D-17 |
| Requirements traceability matrix | `docs/governance/TRACEABILITY.md` | 30 requirements → 15 screens → 46 operations → 142 planned tests |
| Authoritative register | `docs/governance/DECISION_REGISTER.md` | D-01…D-17 confirmed; OQ-01…OQ-31 open |
| Earlier proposal (history) | `docs/phase0/PHASE0_PROPOSAL.md` | superseded in part, marked |

Repository layout now follows D-10 (`docs/`, `reference/`; `apps/` and `infrastructure/` do not exist yet). The original pack documents moved under `docs/`; the older `docs/*.md` set is in `docs/archive/legacy-docs/` as non-binding input.

## 2. How each approved decision was applied

| Decision | Applied in |
|---|---|
| D-08 reference is the design source | DESIGN_TOKENS (exact extraction); spec tokens withdrawn; my earlier 12 px/muted proposals withdrawn; accessibility conflicts left OPEN as OQ-25 |
| D-09 separation of duties | ROLE_PERMISSION_MATRIX, EDITORIAL_WORKFLOW guards, ERD triggers, OpenAPI `allowed_actions`, SOD-01…08 tests |
| D-10 monorepo | CLAUDE.md, TECHNICAL_ARCHITECTURE, ADR-0003 |
| D-11 defer Redis/Celery, reliable email | SECURITY_ARCHITECTURE §4 (interface, transactional outbox, worker, retries, dead-letter, upgrade triggers), ERD `email_outbox`, DB sessions/cache |
| D-12 hybrid model | ERD `opportunity_version` + `detail_schema`, VALIDATION_SPEC §7, ADR-0005 |
| D-13 immutable ids, stable slugs | ERD conventions/triggers, VALIDATION_SPEC §9, OpenAPI by slug, ADR-0006 |
| D-14 provenance ≠ verification | ERD `opportunity_source` vs `verification_record`, workflow V01, UI wording rule, ADR-0007 |
| D-15 deferrals | no organisation endpoints, no uploads, no eligibility, no alerts; SCOPE-01/02 tests |
| D-16 register authority | register rewritten with ids; archived duplicates; ADR-0009 |
| D-17 preserve CLAUDE.md rules | all eight rules kept, rules 9–10 added; ADR-0010 |

## 3. Verification performed (and its limits)

| Check | Result |
|---|---|
| OpenAPI 3.1 validity (openapi-spec-validator) | passes; found and fixed one real defect (path parameter name mismatch on saved items) |
| Every OpenAPI operation mapped to a requirement; every planned test id exists in the catalogue | generated and checked by script — no gaps |
| Every `OQ-nn` / `D-nn` reference resolves to the register; every `x-open` tag valid | checked by script — no dangling ids |
| Workflow transitions T03–T15 present in the OpenAPI action enum | checked |
| Referenced repository paths exist | checked; three stale paths corrected |
| Reference design tokens | measured from computed styles in Chromium (1440/390/320); no horizontal overflow at 390/320 |
| Reference file unchanged | SHA-256 `77883daef17704f358e42a27a9b4197ac0c83aad9143e5335b071ca23977cce8` |

**Not verified / not done:** no code exists, so no test has been written or run; the SQL/constraint designs were reviewed by reading, not executed; no VPS, Traefik, Nginx or capacity inspection (not possible from here); no legal research on Zimbabwean data protection; no pixel-level visual comparison (no production UI exists); the token extraction covers the states reachable in the prototype only (listed gaps in DESIGN_TOKENS §4).

## 4. Remaining blockers

### 4.1 Before Phase 1 can start
1. Your written approval of this package (or corrections).
2. **OQ-28** version pins (Python, Django, DRF, Node, Next.js, PostgreSQL) — to be chosen from currently maintained releases at the start of Phase 1; includes the UUID version choice.
3. Confirmation that the repository location/name is final.

### 4.2 Before Phase 2 (opportunity domain and staff workflow)
OQ-05 application handoff · OQ-06 category fields · OQ-07 verification policy · OQ-08 duplicate rules · OQ-12 approver-may-publish · OQ-13 administrator controls · OQ-14 scheduled publishing · OQ-16 staff MFA/network/staff-UI choice · OQ-21 taxonomies · OQ-22 date-only deadlines and currencies · OQ-29 source rules (URL-less sources, https-only).
**Staffing blocker (not a code issue):** under the strict reading, every listing needs three different people (author, approver, publisher). If the launch team is smaller, either hire/assign roles or approve a documented relaxation (OQ-12).

### 4.3 Before Phase 3 (public site)
OQ-01 domain and hostnames · OQ-18 languages · OQ-19 analytics/consent · OQ-20 expired/withdrawn URL and indexing policy · OQ-24 reference features out of scope (employer link, alerts, organisation filter) · OQ-25 fidelity vs accessibility.

### 4.4 Before Phase 4 (accounts)
OQ-03 email provider and sender domain · OQ-04 verified-email-before-session rule · OQ-09 privacy, retention, deletion, legal review · OQ-15 account-status semantics · OQ-17 numeric security parameters · OQ-30 outbox→Celery thresholds.

### 4.5 Later
Phase 5: OQ-23 (match display/weights/incomplete profiles), OQ-31 (saved rules). Phase 6: OQ-11 (SLOs/KPIs/accessibility process), OQ-26 (error-tracking hosting), OQ-27 (RPO/RTO). Phase 7: OQ-01, OQ-10 (read-only inspection of the live Traefik→Nginx topology and VPS capacity before any deployment work). OQ-02 (employer submissions) is deferred to Release 3.

## 5. Where I would most like your challenge

1. **Strict approver ≠ publisher** (OQ-12) — safest, but staffing-heavy.
2. **Slugs frozen after first publication** — maximal URL stability; typos cannot be fixed without a new listing (ADR-0006).
3. **Database-backed sessions, throttle counters and email outbox** — avoids Redis but adds write load on the one PostgreSQL instance; to be measured (OQ-30).
4. **HMAC-derived email tokens** — no secrets stored, but rotating the key invalidates outstanding links.
5. **Trigger-enforced immutability and separation of duties** — strong guarantee, more migration discipline.
6. **Accessibility vs fidelity** (OQ-25) — the preserved reference has 10–11 px text and a 4.4:1 contrast pair; I changed nothing and need your ruling.
7. **Capacity numbers** in the first proposal remain assumptions (≤5,000 listings, ≤500 concurrent users); nothing has been measured.
8. **Candidate category schemas** (VALIDATION_SPEC §7) are my drafts, not approved facts.

## 6. Approval checklist (for you)

| # | Document set | Approve / changes |
|---|---|---|
| 1 | Decision register and ADR-0001…0010 | ☐ |
| 2 | Design tokens (and rulings on OQ-24, OQ-25) | ☐ |
| 3 | ERD and domain model | ☐ |
| 4 | Validation specification (limits) | ☐ |
| 5 | OpenAPI contract | ☐ |
| 6 | Role–permission matrix and editorial workflow (and OQ-12, OQ-13) | ☐ |
| 7 | Security and authentication architecture (and OQ-16, OQ-17) | ☐ |
| 8 | Traceability matrix and test catalogue | ☐ |
| 9 | Updated product/design/engineering documents and CLAUDE.md | ☐ |

**Stopping here.** Phase 1 will not begin without your explicit approval of the package and a decision on OQ-28.
