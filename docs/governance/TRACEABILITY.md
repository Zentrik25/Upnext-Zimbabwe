# Requirements traceability matrix — DRAFT

Status: DRAFT. Required by CLAUDE.md rule 3 before implementation. Maintained as requirements, screens, API operations or tests change. Every OpenAPI operation maps to at least one requirement; every test id below appears in the catalogue (checked when this file was generated on 2026-10-17). Tests are **planned, not yet written or run**; no result is claimed.

Sources: PR-xx = `docs/product/PRD.md`; spec = specification v1.0 (reconciled in `docs/phase0/SPEC_V1_RECONCILIATION.md`); D-xx / OQ-xx = `docs/governance/DECISION_REGISTER.md`. A requirement whose column shows an OQ id cannot be finalised until that question is decided.

## 1. Requirements → screens → API → tests

| Req | Requirement | Source | Screens | API operations | Planned tests | Open |
|---|---|---|---|---|---|---|
| R-01 | Public discovery needs no account: search, filter, browse categories | PR-01; spec §6; D-03 | SC-01, SC-02 | listOpportunities, listCategories, listLocations, listSectors | E2E-01, API-01, API-02, A11Y-01 | OQ-18, OQ-24 |
| R-02 | Opportunity detail shows title, organisation, category, location, source, verification, deadline state, external action; unknown fields are labelled unknown, never invented | PR-02; spec §10; PRODUCT content safety | SC-03 | getOpportunity | API-03, UT-01, E2E-02, VIS-02 | OQ-06, OQ-22 |
| R-03 | Stable, shareable canonical URLs by immutable slug; internal ids immutable | PR-02; D-13; ADR-0006 | SC-03 | getOpportunity | DB-01, DB-02, UT-02, E2E-03 | OQ-28 |
| R-04 | Account lifecycle: register, verify email, sign in/out, reset and change password, change email | PR-03; spec §7 | SC-04, SC-05, SC-06, SC-07, SC-11 | getCsrfToken, register, verifyEmail, resendVerification, login, logout, requestPasswordReset, confirmPasswordReset, changePassword, requestEmailChange, getMe, updateMe | AUTH-01…AUTH-09, E2E-04 | OQ-03, OQ-04, OQ-17 |
| R-05 | Session management and account deletion/export request | PR-03; spec §7, §25 | SC-11 | listSessions, revokeSession, requestAccountDeletion, cancelAccountDeletion | AUTH-10, AUTH-11, IT-05, E2E-05 | OQ-09 |
| R-06 | Account status (pending, active, restricted, suspended, deactivated) enforced on the backend | spec §7 | SC-05, SC-11, SC-13 | login, getMe, changeUserStatus | AUTH-12, ADM-03 | OQ-15 |
| R-07 | Optional profile: qualification, interests, skills, locations, experience, work arrangements; user can review, edit, remove | PR-04; spec §8 | SC-08, SC-11 | getProfile, updateProfile, searchSkills | API-04, UT-03, E2E-06 | OQ-21 |
| R-08 | Rules-based For You feed with understandable reasons; no eligibility claims; missing data never disqualifies | PR-05; spec §12; D-15 | SC-09 | getForYou | UT-04, UT-05, API-05, E2E-07 | OQ-23 |
| R-09 | Save/unsave; saved list persists across sessions; shows open/expired/unavailable; unique per user and listing | PR-06; spec §13 | SC-03, SC-10 | saveOpportunity, unsaveOpportunity, listSaved | API-06, DB-03, SEC-03, E2E-08 | OQ-31 |
| R-10 | Editorial lifecycle: draft → in review → approved → published → expired/withdrawn/archived, with rejection reasons and history | PR-07; spec §15; EDITORIAL_WORKFLOW | SC-12 | createDraft, saveDraft, transitionOpportunity, getEditorialOpportunity, listEditorialOpportunities, getHistory, searchOrganisations, createOrganisation, updateOrganisation | WF-01…WF-15, E2E-09 | OQ-05, OQ-08, OQ-14 |
| R-11 | Separation of duties: nobody approves or verifies their own submission; publication needs another authorised person's approval of the exact revision (the author may then publish it); material changes invalidate approval; no Publisher role initially; permissions extensible; enforced transactionally on the backend; every transition audited; no role bypasses the workflow | D-18, D-22, D-23; ADR-0011, ADR-0015, ADR-0016 | SC-12, SC-13 | transitionOpportunity, recordVerification, grantRole, revokeRole | SOD-01…SOD-14, PERM-01…PERM-03, WF-16, SEC-05 | OQ-13, OQ-16 |
| R-12 | Source provenance required to publish; verification is separate, evidence-based, auditable; publication never implies verification | D-14; spec §15; ADR-0007 | SC-03, SC-12 | recordVerification, getEditorialOpportunity, getOpportunity | VER-01…VER-05, UT-06, VIS-03 | OQ-07, OQ-29 |
| R-13 | Search: keyword + filters + sort; deterministic cursor pagination; empty and invalid-filter states | PR-08; spec §11 | SC-02 | listOpportunities | API-01, API-07, API-08, DB-04, PERF-01 | OQ-20, OQ-24 |
| R-14 | Quality: responsive 320/390/768/1440, keyboard accessible, WCAG 2.2 AA (accessibility precedes fidelity, D-19), loading/empty/error states | PR-09; spec §32 | all public screens | — | A11Y-01…A11Y-09, E2E-10 | OQ-11 |
| R-15 | Visual fidelity to the approved reference (tokens, square corners, no shadows/gradients) | D-08; D-19; ADR-0001; ADR-0012 | SC-01…SC-11, SC-14, SC-15 | — | VIS-01…VIS-05, A11Y-08 | OQ-24 |
| R-16 | Immutable audit trail of security-relevant and editorial actions; append-only | spec §15, §33; PR-07 | SC-12, SC-13 | adminListAuditEvents, getHistory | AUD-01…AUD-04, WF-16 | OQ-09 |
| R-17 | Security controls: CSRF, rate limits, headers/CSP, uniform auth responses, XSS/URL validation | SECURITY_ARCHITECTURE | all | getCsrfToken, register, login, requestPasswordReset | SEC-01…SEC-10 | OQ-16, OQ-17 |
| R-18 | Reliable verification/reset email through the outbox (retry, dead-letter, idempotency) | D-11; ADR-0004 | SC-04, SC-06, SC-07 | register, resendVerification, requestPasswordReset, retryOutbox | MAIL-01…MAIL-07 | OQ-03, OQ-30 |
| R-19 | Hybrid data model integrity: relational constraints and versioned category JSONB validation | D-12; ADR-0005; VALIDATION_SPEC | SC-12 | createDraft, saveDraft, transitionOpportunity | VAL-01…VAL-08, DB-05 | OQ-06, OQ-21, OQ-22 |
| R-20 | Administration: staff roles, account status, taxonomies, audit visibility, outbox retry | spec §17 admin nav; D-09 | SC-13 | adminListUsers, grantRole, revokeRole, changeUserStatus, adminListAuditEvents, retryOutbox | ADM-01…ADM-05 | OQ-13, OQ-16 |
| R-21 | Deadline and expiry: derived deadline state always correct at read time; unknown deadlines never auto-expire; timezone retained | PR-02/08; QUALITY-GATES | SC-02, SC-03, SC-10 | listOpportunities, getOpportunity, listSaved | UT-07, UT-08, IT-01, JOB-01 | OQ-14, OQ-20, OQ-22 |
| R-22 | Application handoff wording is accurate; UPNEXT never claims an application was submitted | spec §14; PRODUCT | SC-03 | getOpportunity | E2E-02, VIS-02, UT-09 | OQ-05 |
| R-23 | Privacy: data minimisation, notice, retention, deletion, no PII in logs | spec §25; SECURITY | SC-11, SC-14 | requestAccountDeletion, getProfile | PRIV-01…PRIV-05 | OQ-09 |
| R-24 | Observability and health: structured logs, request ids, health/readiness, job heartbeat, alerts | spec §33; QUALITY-GATES | — | healthLive, healthReady, getApiRoot | OPS-01…OPS-04 | OQ-26 |
| R-25 | Backups and tested restoration; migration rehearsal; rollback plan | spec §34; QUALITY-GATES | — | — | OPS-05…OPS-07 | OQ-27 |
| R-26 | Performance targets (LCP, INP, CLS, API latency) measured on realistic data | spec §31; QUALITY-GATES | SC-01…SC-03 | listOpportunities, getOpportunity | PERF-01…PERF-03 | OQ-11 |
| R-27 | Isolation from The Granite Post (no shared secrets, DB, networks; no changes without approval) | D-06; CLAUDE.md | — | — | OPS-08, OPS-09 (Phase 7 checklist) | OQ-10 |
| R-28 | Unpublished content (draft, in review, approved, rejected, takedown) is never public or indexed; 404 not 403 | ACCEPTANCE; spec §6 | SC-03 | getOpportunity | API-09, SEC-04, E2E-03 | OQ-20 |
| R-29 | Indexability: server-rendered public pages, metadata, canonical URL, sitemap, robots; staff/account pages noindex | IA; spec §6 | SC-01…SC-03, SC-12, SC-13 | getOpportunity | SEO-01…SEO-04 | OQ-01, OQ-20 |
| R-30 | Deferred scope is not exposed: eligibility decisions, public organisation pages, advanced related items, uploads, alerts, employer self-service, payments | D-15; ADR-0008; PRD exclusions | SC-01…SC-03 | — | SCOPE-01, SCOPE-02 | OQ-24 |
| R-31 | Runtime versions are researched, pinned, patched and monitored for end of life | D-20; ADR-0013; VERSION_RECOMMENDATION | — | — | OPS-10…OPS-13 | OQ-28 |
| R-32 | Category-specific schemas stay drafts until approved; examples and validation recommendations exist for every launch category | D-21; ADR-0014; CATEGORY_SCHEMA_EXAMPLES | SC-12 | createDraft, saveDraft | CAT-01…CAT-08 | OQ-06, OQ-21, OQ-22, OQ-29 |

## 2. Screen register

| ID | Screen | Public path (IA; canonical paths OPEN OQ-01/OQ-20) | Spec section | Key states |
|---|---|---|---|---|
| SC-01 | Home | / | §19 Screen 1 | loaded, empty, error |
| SC-02 | Explore / search results | /opportunities (+ category filters) | §19 Screen 2 | loading, zero results, invalid filter, rate limited |
| SC-03 | Opportunity detail | /opportunities/{slug} | §19 Screen 3 | active, closing soon, expired, withdrawn, unknown deadline, unavailable source, not_verified/source_checked/issuer_verified |
| SC-04 | Register | /register | §19 Screen 4 | empty, invalid, submitting, accepted (check email), rate limited |
| SC-05 | Sign in | /login | §19 Screen 4 | incorrect credentials, email not verified, session expired, rate limited |
| SC-06 | Verify email / pending verification | /verify-email | §19 Screen 4 | pending, success, invalid/expired token, resend throttled |
| SC-07 | Forgot / reset password | /forgot-password, /reset-password | §19 Screen 4 | request accepted, token invalid, success |
| SC-08 | Profile onboarding | /account/profile (stepper) | §19 Screen 5 | incomplete, saved, validation; optional steps skippable |
| SC-09 | For You | /account/for-you | §19 Screen 6 | incomplete profile (still useful results), no matches |
| SC-10 | Saved | /account/saved | §19 Screen 7 | empty, expired item, unavailable item |
| SC-11 | Account settings | /account/settings | §19 Screen 8 | profile, email change, password, sessions, deletion request |
| SC-12 | Staff editorial (Django Admin initially; OQ-16, IA) | /staff/ (noindex) | §19 Screen 9 | draft form, provenance, review queue, approval queue, verification, history, conflict, rejection |
| SC-13 | Staff administration | /staff/ (noindex) | §17 admin nav | users, roles, status, taxonomies, audit, outbox, settings |
| SC-14 | Static pages | /about, /contact, privacy, terms | §17 | content OQ-09 |
| SC-15 | System states | — | §19, user journeys | offline, API error, 404, 429, session expiry |

## 3. API operation coverage

| Operation | Method path | Tag | Requirements |
|---|---|---|---|
| `getApiRoot` | GET `/` | health | R-24 |
| `listOpportunities` | GET `/opportunities` | public | R-01, R-13, R-21, R-26 |
| `getOpportunity` | GET `/opportunities/{slug}` | public | R-02, R-03, R-12, R-21, R-22, R-26, R-28, R-29 |
| `listCategories` | GET `/categories` | public | R-01 |
| `listLocations` | GET `/locations` | public | R-01 |
| `listSectors` | GET `/sectors` | public | R-01 |
| `searchSkills` | GET `/skills` | public | R-07 |
| `getCsrfToken` | GET `/auth/csrf` | auth | R-04, R-17 |
| `register` | POST `/auth/register` | auth | R-04, R-17, R-18 |
| `verifyEmail` | POST `/auth/email/verify` | auth | R-04 |
| `resendVerification` | POST `/auth/email/resend` | auth | R-04, R-18 |
| `login` | POST `/auth/login` | auth | R-04, R-06, R-17 |
| `logout` | POST `/auth/logout` | auth | R-04 |
| `requestPasswordReset` | POST `/auth/password-reset/request` | auth | R-04, R-17, R-18 |
| `confirmPasswordReset` | POST `/auth/password-reset/confirm` | auth | R-04 |
| `changePassword` | POST `/auth/password/change` | auth | R-04 |
| `getMe` | GET `/me` | me | R-04, R-06 |
| `updateMe` | PATCH `/me` | me | R-04 |
| `requestEmailChange` | POST `/me/email-change` | me | R-04 |
| `requestAccountDeletion` | POST `/me/deletion-request` | me | R-05, R-23 |
| `cancelAccountDeletion` | DELETE `/me/deletion-request` | me | R-05 |
| `getProfile` | GET `/me/profile` | me | R-07, R-23 |
| `updateProfile` | PATCH `/me/profile` | me | R-07 |
| `listSessions` | GET `/me/sessions` | me | R-05 |
| `revokeSession` | DELETE `/me/sessions/{session_id}` | me | R-05 |
| `listSaved` | GET `/me/saved` | me | R-09, R-21 |
| `saveOpportunity` | PUT `/me/saved/{opportunity_id}` | me | R-09 |
| `unsaveOpportunity` | DELETE `/me/saved/{opportunity_id}` | me | R-09 |
| `getForYou` | GET `/discovery/for-you` | discovery | R-08 |
| `listEditorialOpportunities` | GET `/editorial/opportunities` | editorial | R-10 |
| `createDraft` | POST `/editorial/opportunities` | editorial | R-10, R-19, R-32 |
| `getEditorialOpportunity` | GET `/editorial/opportunities/{id}` | editorial | R-10, R-12 |
| `saveDraft` | PATCH `/editorial/opportunities/{id}/draft` | editorial | R-10, R-19, R-32 |
| `transitionOpportunity` | POST `/editorial/opportunities/{id}/transitions` | editorial | R-10, R-11, R-19 |
| `recordVerification` | POST `/editorial/opportunities/{id}/verification-records` | editorial | R-11, R-12 |
| `getHistory` | GET `/editorial/opportunities/{id}/history` | editorial | R-10, R-16 |
| `searchOrganisations` | GET `/editorial/organisations` | editorial | R-10 |
| `createOrganisation` | POST `/editorial/organisations` | editorial | R-10 |
| `updateOrganisation` | PATCH `/editorial/organisations/{organisation_id}` | editorial | R-10 |
| `adminListUsers` | GET `/admin/users` | administration | R-20 |
| `grantRole` | POST `/admin/users/{user_id}/roles` | administration | R-11, R-20 |
| `revokeRole` | POST `/admin/users/{user_id}/roles/{role}/revoke` | administration | R-11, R-20 |
| `changeUserStatus` | PATCH `/admin/users/{user_id}/status` | administration | R-06, R-20 |
| `adminListAuditEvents` | GET `/admin/audit-events` | administration | R-16, R-20 |
| `retryOutbox` | POST `/admin/email-outbox/{outbox_id}/retry` | administration | R-18, R-20 |
| `healthLive` | GET `/health/live` | health | R-24 |
| `healthReady` | GET `/health/ready` | health | R-24 |

## 4. Test catalogue (planned)

Families: **UT** Unit; **IT** Integration; **DB** Database constraint / migration; **API** API contract; **AUTH** Authentication; **E2E** Playwright end to end; **A11Y** Accessibility; **VIS** Visual comparison to reference; **SEC** Security / authorisation; **WF** Workflow state machine; **SOD** Separation of duties; **VER** Verification & provenance; **VAL** Validation; **AUD** Audit; **MAIL** Email outbox; **ADM** Administration; **PRIV** Privacy; **OPS** Operations; **PERF** Performance; **JOB** Scheduled jobs; **SEO** SEO/indexing; **SCOPE** Scope guard.

| Test id | Intent |
|---|---|
| UT-01 | Unknown salary/deadline/requirements render as 'Not stated'; never defaulted |
| UT-02 | Slug generation: format, collision retry, reserved words; immutability after assignment |
| UT-03 | Profile validation limits and clear-on-null semantics |
| UT-04 | Scoring engine: known match / known mismatch / unknown distinguished; deterministic; versioned |
| UT-05 | Reasons text derives from the same factors as the ranking (explanation parity); no 'you qualify' wording |
| UT-06 | Verification level computation from records (supersession, outcome, author exclusion) |
| UT-07 | Deadline-state derivation incl. closing_soon window, unknown, expired; UTC comparison; Africa/Harare display |
| UT-08 | Date-only deadline end-of-day semantics (once OQ-22 decided) |
| UT-09 | Application CTA label by method; never implies submission |
| API-01 | GET /opportunities: filters, sort, empty result, anonymous access |
| API-02 | Categories/locations/sectors endpoints; inactive rows excluded |
| API-03 | GET /opportunities/{slug}: fields, unknown handling, sources, verification block |
| API-04 | Profile GET/PATCH: partial update, arrays replace, ownership |
| API-05 | For You: incomplete profile still returns results; unknowns reported; response shape |
| API-06 | Saved: idempotent PUT/DELETE, availability states, unique per user |
| API-07 | Cursor pagination stable under inserts; tampered cursor → invalid_cursor |
| API-08 | Invalid filter/param → 400 invalid_filter naming the parameter |
| API-09 | Non-public listing → 404 for anonymous and unauthorised staff |
| DB-01 | UUID primary keys immutable (update rejected) |
| DB-02 | Slug unique, immutable after first publication (trigger) |
| DB-03 | saved_opportunity unique(user, opportunity) |
| DB-04 | Query plans use intended indexes on seeded realistic data; statement timeout enforced |
| DB-05 | Version immutability trigger; one live and one pipeline version partial unique constraints |
| IT-01 | Expiry job idempotent and concurrency-safe; unknown deadline untouched |
| IT-05 | Account deletion scrubs personal data per rules (once OQ-09 decided) |
| AUTH-01 | Register returns identical 202 for new/existing email |
| AUTH-02 | Verify email: success, expired, reused, tampered token; no auto login |
| AUTH-03 | Login: generic failure for unknown email/wrong password; timing bucket check |
| AUTH-04 | Login throttling per IP/email/pair; Retry-After |
| AUTH-05 | Password reset request uniform; confirm revokes all sessions; token single use |
| AUTH-06 | Password policy: length, common-password list, similarity |
| AUTH-07 | Session cookie flags; rotation at login/password change |
| AUTH-08 | CSRF required on every mutation; Origin enforced; login CSRF |
| AUTH-09 | Change email requires re-auth; new address verified before switch; old notified |
| AUTH-10 | List/revoke sessions; cannot see/revoke another user's |
| AUTH-11 | Re-authentication window for sensitive actions |
| AUTH-12 | Status enforcement: suspended/deactivated sessions invalidated at once |
| WF-01 | Every legal transition T01–T15 succeeds for the permitted role |
| WF-02 | Every illegal (state, action) pair returns invalid_transition |
| WF-03 | Submit requires publish-grade validation, source, location, future deadline |
| WF-04 | Approval bound to content hash; stale approval rejected |
| WF-05 | Reject/return require reasons; history preserved |
| WF-06 | Publish assigns slug once; supersedes previous live version |
| WF-07 | Amendment: one open at a time; public sees live until amendment published |
| WF-08 | Takedown removes public visibility immediately; one-person action |
| WF-09 | Optimistic locking: stale row_version → state_conflict |
| WF-10 | Audit + publishing_event written in the same transaction; failure rolls back |
| WF-11 | Expiry transition by system only at deadline; manual expire by an Editor or Administrator |
| WF-12 | Discard/reopen flows |
| WF-13 | Scheduled publish (only if OQ-14 approved) |
| WF-14 | Concurrent transition attempts: exactly one wins |
| WF-16 | Every transition audit row records actor, capacity (role exercised), from/to status, version and request id; tampering attempts fail |
| WF-15 | Organisation search/create/edit: permissions (Contributor/Editor create; Editor/Administrator edit), duplicate suggestions, audit |
| SOD-01 | Author cannot approve/reject own submission |
| SOD-02 | Author cannot record verification |
| SOD-03 | Author cannot publish |
| SOD-04 | Two-person path: the approving Editor/Administrator may publish the same listing (D-18) |
| SOD-05 | Person holding several roles still blocked on own chain (identity-based) |
| SOD-06 | Administrator without editorial role has no transition |
| SOD-07 | Direct state write via Django Admin impossible; DB trigger blocks bypass |
| SOD-08 | Role grant/revoke audited as privileged; non-admin cannot grant |
| SOD-09 | Administrator approves and publishes another person's listing; denied for a listing they authored |
| SOD-10 | Author with Editor/Administrator authority may publish their own listing only when another authorised person approved the exact revision (hash match); refused otherwise (D-22) |
| SOD-11 | Author is notified when the submission is approved, rejected or published (proposed) |
| SOD-12 | Guard failures are refused with separation_of_duties and audited as security events |
| PERM-01 | Role registry contains exactly contributor, editor, administrator; no publisher role value, permission set, API enum or UI (D-23) |
| PERM-02 | A role added to a test registry is honoured by has_permission and the policy guards with no guard change (extensibility) |
| PERM-03 | Registry grants match ROLE_PERMISSION_MATRIX.md exactly for every role × permission code |
| SOD-13 | Publication guard is evaluated inside the publish transaction after a row lock (no check-then-act race) |
| SOD-14 | Report of author/approver pairs and same-person approve+publish events is generated from audit data |
| VER-01 | Publishing an unverified listing shows not_verified |
| VER-02 | Verification evidence note and method rules; supersession |
| VER-03 | New version does not inherit verification |
| VER-04 | Provenance required: ≥1 source, exactly one primary |
| VER-05 | UI never uses 'verified' for source_checked |
| VAL-01 | Boundary tests for every limit in VALIDATION_SPEC |
| VAL-02 | Text normalisation and control-character rejection |
| VAL-03 | URL fuzz corpus (schemes, userinfo, IP hosts, IDN, length) |
| VAL-04 | Markdown sanitiser XSS corpus |
| VAL-05 | Category JSON Schema fixtures per version; additional properties rejected |
| VAL-06 | Money/currency/period pairing rules |
| VAL-07 | Duplicate detection hard/soft rules (OQ-08) |
| VAL-08 | Search query injection/abuse corpus |
| SEC-01 | Security headers and CSP present on all responses |
| SEC-02 | Dependency, secret and image scans clean in CI |
| SEC-03 | Cross-account access to profile, saved, sessions denied (BOLA suite) |
| SEC-04 | Hidden objects return 404 not 403 |
| SEC-05 | Generated role×capability matrix test (allowed and denied) |
| SEC-06 | Rate-limit coverage for every throttled endpoint |
| SEC-07 | No server-side URL fetch in publishing/verification modules (architecture test) |
| SEC-08 | Open-redirect: login 'next' only same-origin allow-listed paths |
| SEC-09 | Logs contain no passwords/tokens/emails (scrub test) |
| SEC-10 | Mass-assignment: status/roles/email_verified_at not writable via public APIs |
| AUD-01 | Audit table rejects UPDATE/DELETE for the app role |
| AUD-02 | Every catalogued action produces an audit row |
| AUD-03 | Audit survives user deletion (pseudonymised actor_ref) |
| AUD-04 | Admin audit view filters and is read-only |
| MAIL-01 | Outbox row created in the same transaction as the token |
| MAIL-02 | Worker claims with SKIP LOCKED; two workers never send the same row concurrently |
| MAIL-03 | Retry back-off and attempts cap; permanent failure → dead |
| MAIL-04 | Stale 'sending' rows recovered |
| MAIL-05 | Idempotency key prevents duplicate enqueue |
| MAIL-06 | Fake/console sender contract test; provider adapter contract test (after OQ-03) |
| MAIL-07 | Heartbeat and dead-letter alerting |
| ADM-01 | User list never exposes hashes/tokens |
| ADM-02 | Role grant/revoke endpoints and audit |
| ADM-03 | Status change effects and audit |
| ADM-04 | Outbox retry permission and idempotency |
| ADM-05 | Taxonomy changes audited; category codes immutable |
| PRIV-01 | Profile fields optional; removal works |
| PRIV-02 | Deletion removes profile, saved, sessions, tokens; email tombstoned |
| PRIV-03 | No PII beyond policy in API responses |
| PRIV-04 | Privacy notice and terms pages exist and are linked (content OQ-09) |
| PRIV-05 | Retention jobs purge expired tokens/sessions/outbox payloads |
| OPS-01 | Health live/ready behave; ready fails on DB outage; no config leakage |
| OPS-02 | Structured logs include request id |
| OPS-03 | Job runs recorded and monitored |
| OPS-04 | Error tracking receives a test exception (after OQ-26) |
| OPS-05 | Backup restore rehearsal documented with evidence |
| OPS-06 | Migration rehearsal on a copy; forward-only |
| OPS-07 | Rollback procedure rehearsed |
| OPS-08 | Phase 7 pre-deploy checklist: Granite config read-only inspection recorded |
| OPS-10 | Lockfiles and container images match the approved version pins (VERSION_RECOMMENDATION); build fails on drift |
| OPS-11 | Dependency and image advisory scan: no known high/critical vulnerabilities in pinned versions, on every build and weekly |
| OPS-12 | End-of-life watch fails the build within 90 days of a pinned runtime's end of life |
| OPS-13 | Django migrations and test-suite pass on the pinned PostgreSQL major with the pinned Python and psycopg (task V-01) |
| OPS-09 | Resource limits and network isolation verified |
| PERF-01 | Search benchmark on realistic data volume (documented hardware) |
| PERF-02 | Public page Core Web Vitals on mid-range mobile profile |
| PERF-03 | Load test against agreed capacity assumptions (OQ-11) |
| JOB-01 | Expiry job runs on schedule; heartbeat; overlap protection |
| SEO-01 | Server-rendered detail page includes title, meta, canonical, structured data |
| SEO-02 | Sitemap lists only public listings |
| SEO-03 | noindex on staff, account, auth pages |
| SEO-04 | robots.txt; expired/withdrawn policy once OQ-20 decided |
| CAT-01 | Every category schema is a valid JSON Schema 2020-12 document |
| CAT-02 | Every example detail validates against its category schema |
| CAT-03 | Every example validates against the OpenAPI createDraft request body |
| CAT-04 | Negative cases are rejected by the schemas (extra property, bad enum, missing required, bad date/URL/country code) |
| CAT-05 | Common-field applicability matrix enforced by the service (e.g. employment_type only for jobs/internships/graduate programmes) |
| CAT-06 | Cross-field date ordering and conditional rules (clarification < closing ≤ bid opening; cofunding percent only when required; expected start window) |
| CAT-07 | Applicant-payment lint flags fee/deposit wording for non-tender categories and requires reviewer acknowledgement |
| CAT-08 | Currency allow-list and money pairing rules (after OQ-22) |
| SCOPE-01 | No UI/API for deferred capabilities (eligibility, org pages, uploads, alerts, employer, payments) |
| SCOPE-02 | Copy lint: no 'you qualify', 'guaranteed', 'verified' misuse |
| E2E-01 | Anonymous visitor searches, filters, sees empty state, opens a listing |
| E2E-02 | Listing → source and application destination; wording; no login prompt |
| E2E-03 | Shared slug URL works logged out; unpublished slug 404 |
| E2E-04 | Register → verify → sign in (fake sender) |
| E2E-05 | Sessions list/revoke; delete-account request |
| E2E-06 | Profile onboarding with skippable steps |
| E2E-07 | For You with incomplete and complete profile |
| E2E-08 | Save on one session, sign in on another, retrieve saved |
| E2E-09 | Contributor drafts → Editor approves (a different person) → Editor or Administrator publishes; public sees it |
| E2E-10 | Full public flows at 320/390/768/1440 without horizontal scroll |
| A11Y-01 | axe-core: no serious/critical violations on public pages |
| A11Y-02 | Keyboard-only completion of search, save, register, onboarding |
| A11Y-03 | Visible focus on every interactive element |
| A11Y-04 | Screen-reader semantics: landmarks, headings, labelled forms, error association |
| A11Y-05 | Reduced-motion and zoom/reflow at 200–400% |
| A11Y-06 | Computed contrast of every token text/background pair meets 4.5:1 (3:1 large text) using production token values |
| A11Y-07 | Control borders reach 3:1 and the focus ring reaches 3:1 on every surface; every focusable element shows the focus style |
| A11Y-08 | Computed styles of built pages equal the reference except the documented deviations DEV-01…DEV-04 |
| A11Y-09 | Manual: dialogs (role, name, focus trap/return, Escape), form errors association, live-region announcements, skip link, lang, page titles |
| VIS-01 | Home vs reference at 1440/768/390/320 |
| VIS-02 | Listing row/detail vs reference tokens |
| VIS-03 | Badges/states derived from tokens reviewed and approved |
| VIS-04 | Computed-style check: radius 0, no shadows/gradients anywhere |
| VIS-05 | Visual-regression baseline is the reference; the allow-list contains only the documented accessibility deviations |

## 5. Rules for maintaining this file

1. A new requirement, screen, endpoint or test is added here in the same change that introduces it.
2. A requirement gains a test id before its implementation starts; a failing or missing test blocks the phase gate.
3. OQ ids are removed from a row only when the decision register records the decision.
4. Whether a test exists and has been executed is recorded in §6; full results (commands and outputs) are recorded in phase reports and are never invented.
5. This file is generated: edit `tools/traceability/generate.py` and run `python tools/traceability/generate.py`.

## 6. Implementation status (Phase 1)

Only the tests listed here exist. Everything else in §4 is still planned. "executed" means the test was run in this repository's development environment on 2026-10-17 and passed (commands and outputs are in `docs/phase1/PHASE1_REPORT.md`); it is not a CI claim.

| Test id | Implemented by | Status |
|---|---|---|
| PERM-01 | `apps/api/tests/test_access_registry.py::test_perm_01_initial_roles_are_exactly_three_and_no_publisher` | executed |
| PERM-02 | `apps/api/tests/test_access_registry.py::test_perm_02_future_role_needs_only_a_registry_entry` | executed |
| PERM-03 | `apps/api/tests/test_access_registry.py::test_perm_03_registry_matches_the_permission_matrix_document` | executed |
| SOD-01 | `apps/api/tests/test_access_policy.py::test_sod_01_author_cannot_approve_reject_return_or_verify_even_with_authority` | executed (pure policy; workflow wiring is Phase 2) |
| SOD-02 | `apps/api/tests/test_access_policy.py::test_sod_02_another_editor_or_administrator_can_approve` | executed (pure policy) |
| SOD-04 | `apps/api/tests/test_access_policy.py::test_sod_04_the_approver_may_publish_the_exact_revision` | executed (pure policy) |
| SOD-09 | `apps/api/tests/test_access_policy.py::test_sod_09_administrator_can_publish_someone_elses_approved_listing` | executed (pure policy) |
| SOD-10 | `apps/api/tests/test_access_policy.py::test_sod_10_author_may_publish_only_after_another_person_approved_the_exact_revision` | executed (pure policy) |
| WF-04 | `apps/api/tests/test_access_policy.py::test_material_change_after_approval_invalidates_it` | executed (pure policy; row-level enforcement is Phase 2) |
| DB-01 | `apps/api/tests/test_models.py::test_db_01_primary_keys_are_immutable` | executed on PostgreSQL 18.6 |
| AUTH-03 | `apps/api/tests/test_auth_api.py::test_unknown_email_and_wrong_password_are_indistinguishable` | executed |
| AUTH-04 | `apps/api/tests/test_auth_api.py::test_per_email_failure_limit_returns_429_with_retry_after; ::test_ip_throttle_applies` | executed |
| AUTH-07 | `apps/api/tests/test_auth_api.py::test_session_and_csrf_cookie_settings; ::test_login_success_sets_http_only_session_and_returns_user` | executed |
| AUTH-08 | `apps/api/tests/test_auth_api.py::test_login_requires_csrf_even_for_anonymous_requests` | executed |
| AUTH-12 | `apps/api/tests/test_auth_api.py::test_non_active_accounts_cannot_start_a_session` | executed |
| SEC-01 | `apps/api/tests/test_platform.py::test_security_headers_on_api_responses; apps/web/tests/e2e/foundation.spec.ts (security headers)` | executed |
| SEC-09 | `apps/api/tests/test_platform.py::test_sec_09_logs_are_json_with_request_id_and_no_credentials` | executed |
| OPS-01 | `apps/api/tests/test_platform.py (health tests); apps/web/tests/e2e/foundation.spec.ts (API through proxy)` | executed |
| OPS-02 | `apps/api/tests/test_platform.py::test_request_id_is_generated_and_echoed` | executed |
| A11Y-01 | `apps/web/tests/e2e/foundation.spec.ts (axe on / and /design-system at 390 and 1440)` | executed (public foundation pages only) |
| A11Y-03 | `apps/web/tests/e2e/foundation.spec.ts::the skip link is the first tab stop and focus is visible` | executed (foundation pages) |
| A11Y-05 | `apps/web/tests/e2e/foundation.spec.ts (no horizontal scroll at 320/390/768/1440)` | executed (foundation pages) |
| A11Y-06 | `apps/web/tests/unit/tokens.test.ts::production text pairs meet WCAG 2.2 AA` | executed |
| A11Y-07 | `apps/web/tests/unit/tokens.test.ts::non-text pairs meet 3:1` | executed |
| A11Y-08 | `apps/web/tests/e2e/foundation.spec.ts (reference parity of the primitives)` | executed |
| VIS-02 | `apps/web/tests/e2e/foundation.spec.ts (reference parity: listing row, tags, tabs)` | executed (computed-style parity, not pixel diff) |
| VIS-04 | `apps/web/tests/e2e/foundation.spec.ts (nothing rounded/shadowed/gradient); apps/web/tests/unit/design-guard.test.ts` | executed |
| VIS-05 | `apps/web/tests/unit/tokens.test.ts::the only production deviations are DEV-01…DEV-04` | executed |
| E2E-10 | `apps/web/tests/e2e/foundation.spec.ts (no horizontal scroll)` | executed (foundation pages only) |
| CAT-01 | `tools/check_docs.py (category schemas are valid JSON Schema 2020-12)` | executed |
| CAT-02 | `tools/check_docs.py (examples validate against schemas)` | executed |
| CAT-03 | `tools/check_docs.py (examples validate against the OpenAPI createDraft body)` | executed |
| CAT-04 | `tools/check_docs.py (negative cases are rejected)` | executed |
| OPS-10 | `apps/api/Dockerfile (pip --require-hashes) and apps/web/Dockerfile (npm ci); .github/workflows/ci.yml` | authored; the GitHub Actions run has not been executed in this environment |
| OPS-11 | `npm audit --omit=dev (executed locally: 0 advisories); .github/workflows/ci.yml` | partly executed; pip advisory scan authored for CI |
| OPS-13 | `docker compose run api pytest on PostgreSQL 18.6 + Python 3.14.8 + Django 5.2.18 + psycopg 3.3.6` | executed (task V-01) |
