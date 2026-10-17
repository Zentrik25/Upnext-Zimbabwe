# UPNEXT — Phase 0 review package (round 2)

**Status: DRAFT — submitted for owner review. Nothing is approved until you say so in writing.**
Date: 2026-10-17 · Scope: documentation only. No application code, no migrations, no deployment, no inspection or change of production infrastructure, no Phase 1 work.

## 1. What changed in this round

| Your decision | What I did | Main documents |
|---|---|---|
| **1. Revised separation of duties (D-18)** — author cannot approve own submission; an Editor or Administrator may approve another person's submission and then publish it; two people suffice; backend-enforced; all transitions audited | Rewrote the permission matrix and state machine; added ADR-0011 (supersedes parts of ADR-0002); removed the approver ≠ publisher rule and the three-person staffing blocker; Administrators now hold approval/publication authority **by role** but remain bound by author ≠ approver/publisher and by read-only state fields; added `published_by` + trigger design; new acceptance scenarios and tests | `ROLE_PERMISSION_MATRIX`, `EDITORIAL_WORKFLOW`, `ERD`, ADR-0011, `ACCEPTANCE_CRITERIA` §C |
| **2. Accessibility precedence (D-19)** | Measured the rendered reference (47 text/background pairs, 7 UI states × 2 viewports, plus axe-core 4.10.2) and derived the **minimum** corrections. Four documented deviations; everything else preserved | `ACCESSIBILITY_DEVIATIONS`, `DESIGN_TOKENS` §1a/§5, ADR-0012, evidence JSON |
| **3. OQ-28 versions (D-20)** | Researched primary sources (registries, release schedules, PEPs, framework docs, advisory data) and produced exact pins with compatibility evidence and support windows | `VERSION_RECOMMENDATION`, `evidence/runtime-versions-2026-10-17.json`, ADR-0013 |
| **4. Category schemas stay drafts (D-21)** | Six draft JSON Schemas, twelve Zimbabwean-style fictional examples (two per category), 18 negative cases, per-field validation recommendations, applicability matrix, domain points marked **verify** | `CATEGORY_SCHEMA_EXAMPLES`, `schemas-draft/`, ADR-0014 |
| Update register, ADRs, matrix, state machine, design docs, acceptance tests, package; revalidate OpenAPI and traceability | Done — see §3 | `DECISION_REGISTER`, `adr/`, `ACCEPTANCE_CRITERIA`, `TRACEABILITY` |

## 2. Package index

| Area | Documents |
|---|---|
| Governance | `docs/governance/DECISION_REGISTER.md` (D-01…D-21; 2 resolved; OQ-01…OQ-33), `TRACEABILITY.md` (32 requirements → 15 screens → 46 operations → 166 planned tests), `ACCEPTANCE_CRITERIA.md`, `ROADMAP.md`, `docs/adr/` (ADR-0001…0014 + proposed list) |
| Product | `docs/product/` (PRD v0.2 with revised roles, vision, personas, journeys) |
| Design | `docs/design/` — `DESIGN_TOKENS`, **`ACCESSIBILITY_DEVIATIONS`**, `DESIGN_SYSTEM`, `INFORMATION_ARCHITECTURE`, `SCREEN_SPECIFICATIONS`, `evidence/` |
| Engineering | `docs/engineering/` — `ERD`, `DOMAIN_MODEL`, `VALIDATION_SPEC`, `openapi/openapi.yaml`, `ROLE_PERMISSION_MATRIX`, `EDITORIAL_WORKFLOW`, `SECURITY_ARCHITECTURE`, **`VERSION_RECOMMENDATION`**, **`CATEGORY_SCHEMA_EXAMPLES`**, `schemas-draft/`, `evidence/`, `TECHNICAL_ARCHITECTURE`, `API_CONTRACTS`, `TEST_STRATEGY`, `SECURITY` |
| History | `docs/phase0/PHASE0_PROPOSAL.md` (first proposal), `SPEC_V1_RECONCILIATION.md`, previous package versions in git |

## 3. Verification performed this round (and its limits)

| Check | Result |
|---|---|
| OpenAPI 3.1 revalidated with openapi-spec-validator | **passes** — 40 paths, 46 operations, unique operation ids, 42 schemas |
| Requests checked as JSON Schema 2020-12 documents (examples → `createDraft` body) | passes; found and fixed **two real contract defects**: (1) `DraftContent` forbade extra properties so a `createDraft` body containing `category` could never validate — now `unevaluatedProperties: false` on the request bodies; (2) URL fields accepted any scheme such as `javascript:` — request schemas now require `^https?://` (https-only remains OQ-29). Unknown fields, missing `category`, over-long titles, `javascript:` and `data:` URLs are now rejected (tested) |
| Category schemas | 6 valid 2020-12 schemas; 12 examples validate against schema and contract; 18 negative cases all rejected |
| Traceability revalidated | every OpenAPI operation maps to ≥1 requirement; every test id used in the matrix and in the acceptance criteria exists in the catalogue (166 tests, 84 referenced from acceptance); script-checked |
| Id and path integrity | every `D-nn`/`OQ-nn` reference resolves to the register, every `x-open` tag is valid, every `docs/…` path exists, Mermaid/code fences balanced |
| Consistency of the four deviation values | identical across `ACCESSIBILITY_DEVIATIONS`, `DESIGN_TOKENS` and `ACCEPTANCE_CRITERIA` |
| Accessibility audit | rendered reference measured in Chromium; 47 distinct text pairs, 5 failing + 1 graphical-glyph case judged conforming; text-input borders 1.31–1.50:1 (fail SC 1.4.11) |
| Version research | PyPI/npm/nodejs.org/GitHub-hosted docs and release notes; PyPI per-release vulnerability field and npm bulk advisory API returned no advisories for the pins |
| Reference file | unchanged (SHA-256 `77883dae…cce`) |

**Corrections to my own earlier statements:** (a) I previously reported `#687481` on `#f8f9fa` as 4.4:1; it is 4.52:1 (passes) — the real failing pair is on the notice strip `#f7f8f9` at 4.48:1; (b) a contingency colour I first proposed for the heart glyph (`#6e7d94`) computed to 4.18:1, not 4.5+; the log now gives `#64748c` (4.75:1); (c) earlier counts of "33 tables"/"143 tests" were wrong and were already corrected to 30/142; they are 30 tables and 166 tests now.

**Limits — not done / not verified:** no code exists, so no test has been written or run; automated accessibility checks cover roughly a third of WCAG issues, manual keyboard/screen-reader review is still required; the official Django download page, Python devguide, PostgreSQL versioning page, Next.js support-policy page and endoflife.date were **unreachable from this environment**, so the Django April 2028 support date, the Next.js maintenance windows and PostgreSQL end-of-life dates rest on release notes, PEPs, the project's published 5-year rule or secondary summaries and must be re-checked (task V-05); Django 5.2 documents PostgreSQL "14 and higher" but names no PostgreSQL 18, so the pairing is by stated policy, not tested evidence (task V-01); no VPS, Traefik, Nginx or capacity inspection; no legal research; the Zimbabwean domain facts in the category document are tagged **verify**; SQL/trigger designs reviewed by reading only.

## 4. Decisions in front of you (summary)

### 4.1 Runtime pins (OQ-28) — recommendation
| Component | Pin | Why in one line |
|---|---|---|
| Python | **3.14.8** | mainstream release supported by Django 5.2/6.x and DRF; security to Oct 2030; 3.13 now security-only, 3.15.0 is a day old and not yet in Django's classifiers |
| Django | **5.2.18 LTS** | longest guaranteed support (≥3 years from April 2025); 6.1 has mainstream support only to April 2027 |
| Django REST Framework | **3.18.3** | explicitly supports Django 5.2/6.0/6.1, Python 3.10+ |
| psycopg | **3.3.6** | meets Django 5.2's driver requirement; Python 3.14 classifier |
| PostgreSQL | **18.6** | newest GA major (19 not released); support to ≈ Nov 2030; PG 14 reaches end of life Nov 2026 |
| Node.js | **24.22.0** (LTS) — or **26 LTS** if Phase 1 starts after 2026-10-28 | decision rule in the document; 22 rejected as too short |
| Next.js / React | **16.4.2 / 19.3.1** | Active LTS line; `engines >=20.9.0`; Next 15 maintenance ends ≈ Oct 2026 |
Approve, amend (Django 6.1? Node 26? PostgreSQL 17?) or reject. No pin is applied anywhere.

### 4.2 Accessibility deviations (D-19) — confirm
| ID | Change | Visible? |
|---|---|---|
| DEV-01 | metadata/tag text `#66768a` → `#627185` | no |
| DEV-02 | muted text `#687481` → `#687380` | no |
| DEV-03 | organisation name `#697586` → `#687485` | no |
| DEV-04 | input/select/search-group borders `#d9e1eb`/`#dce2e8`/`#cbd4de` → `#7693b7` (3.17:1) | **yes** — outlines become mid-tone blue-grey |
Preserved unchanged: Arial, blue accent, square corners, compact layout, text sizes (no AA minimum), target sizes (conform via the spacing exemption), heart glyph (conforms as a graphical object; fallback DEV-05 if you disagree).

### 4.3 Category drafts (OQ-06) — review
Required fields proposed: internships `placement_type`; scholarships `study_level`; tenders `procuring_entity` + `procurement_reference`; grants `funder` + `applicant_types`; jobs and graduate programmes none. Fields tagged **verify** need a domain reviewer.

## 5. Remaining blockers

### 5.1 Before Phase 1 can start
1. Your written approval of this package.
2. **Approval of the runtime pins (OQ-28)**, including the Node 24-vs-26 choice.
3. (Not blocking, scheduled in Phase 1) V-01 PostgreSQL 18 compatibility run and V-05 re-check of official support pages.
*The staffing blocker from round 1 (three people per listing) no longer exists: two people suffice (D-18).*

### 5.2 Before Phase 2 (opportunity domain)
OQ-05 application handoff · **OQ-06 approve the category field lists** · OQ-07 verification evidence policy · OQ-08 duplicate rules · OQ-13 administrator controls (narrowed: second-administrator confirmation, break-glass, single-administrator bootstrap, detective control for one person using two accounts) · OQ-14 scheduled publishing · OQ-16 staff MFA/network/staff-UI · OQ-21 taxonomies and qualification vocabulary · OQ-22 date-only deadlines and currency allow-list · OQ-29 citation-only sources and https-only · **OQ-32** keep the optional Publisher role? · **OQ-33** may an author with approval/publish authority publish their own listing after another person approved it? (specified: no).

### 5.3 Before Phase 3 (public site)
OQ-01 domain/hostnames · OQ-18 languages · OQ-19 analytics/consent · OQ-20 expired/withdrawn URL policy · OQ-24 reference features out of scope · your confirmation of DEV-01…DEV-04.

### 5.4 Before Phase 4 (accounts)
OQ-03 email provider · OQ-04 verified email before session · OQ-09 privacy/retention/deletion and legal review · OQ-15 account-state semantics · OQ-17 numeric security parameters · OQ-30 outbox→Celery thresholds.

### 5.5 Later
Phase 5: OQ-23, OQ-31 · Phase 6: OQ-11, OQ-26, OQ-27 · Phase 7: OQ-01, OQ-10 (read-only inspection of the live Traefik→Nginx topology and VPS capacity) · OQ-02 deferred to Release 3.

## 6. Where I would most like your challenge
1. **Administrators now hold approval and publication authority by role.** It matches your decision, but combined with the two-person minimum it means one person with two accounts can satisfy the rule alone. I added audited account creation, an author/approver-pair report, notification of authors and optional MFA — please judge whether that is enough (OQ-13, OQ-16).
2. **OQ-33 interpretation:** I deny an author publishing their own listing even after another person approved it. Your wording restricts only approval; confirm or relax.
3. **DEV-04** is the one visible change; the alternative is accepting that form-control boundaries fail SC 1.4.11.
4. **Django 5.2 LTS rather than the newest 6.1**, and **PostgreSQL 18** without explicit Django evidence yet.
5. **Node 24 now vs Node 26 in eleven days** — the rule is stated, the call is yours.
6. The category fields are my proposals; several domain facts (currency code ZWG, qualification vocabulary, procurement documents, organisation-type terms) need someone who works with them.
7. Contract defaults I chose without decisions: `http` and `https` both pass the contract (the service is stricter), request bodies reject unknown fields.

## 7. Approval checklist (for you)

| # | Item | Approve / changes |
|---|---|---|
| 1 | Decision register D-18…D-21, ADR-0011…0014 | ☐ |
| 2 | Role–permission matrix, editorial workflow, acceptance scenarios (and OQ-32, OQ-33) | ☐ |
| 3 | Accessibility deviations DEV-01…DEV-04 and heart-glyph classification | ☐ |
| 4 | Runtime version pins (OQ-28) | ☐ |
| 5 | Category schema drafts, examples and validation recommendations (OQ-06) | ☐ |
| 6 | Revised OpenAPI contract (URL scheme guard, request-body strictness) | ☐ |
| 7 | Traceability matrix and test catalogue (166 tests) | ☐ |
| 8 | All other round-1 documents as updated | ☐ |

**Stopping here.** Phase 1 will not begin without your explicit approval of the package and of the OQ-28 pins.
