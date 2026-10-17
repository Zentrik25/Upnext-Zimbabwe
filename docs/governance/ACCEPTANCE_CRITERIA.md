# Acceptance criteria — approved baseline (updated for D-18…D-26)

Status: approved baseline. These are the scenarios a phase must pass before its gate; they are planned, **not yet implemented or run** (no results are claimed). Each scenario names its requirement (`TRACEABILITY.md`) and planned tests. Replaces the legacy `docs/archive/legacy-docs/ACCEPTANCE.md` (kept for history). Scenarios touched by the second Phase 0 round are marked ★.

Conventions: "the API" = the contract in `docs/engineering/openapi/openapi.yaml`; "audited" = an `audit_event` and `publishing_event` row exist with actor, capacity, versions and request id.

## A. Public and seeker
| ID | Scenario | Req | Tests |
|---|---|---|---|
| AC-PUB-01 | **Given** an anonymous visitor **when** they search, filter and open a listing **then** results, an explicit empty state and the detail page appear with no login prompt | R-01, R-02 | E2E-01, API-01, A11Y-01 |
| AC-PUB-02 | **Given** a listing with unknown salary and deadline **then** both show "Not stated"; no value is invented | R-02 | UT-01, API-03 |
| AC-PUB-03 | **Given** a published listing **when** its URL is shared and opened signed-out **then** it loads at the same slug; **given** a draft/in-review/rejected/takedown slug **then** 404 | R-03, R-28 | E2E-03, API-09, SEC-04 |
| AC-PUB-04 | **Given** a listing whose application method is external **then** the action label says it leaves UPNEXT and no copy claims an application was submitted | R-22 | UT-09, SCOPE-02 |
| AC-PUB-05 | **Given** an invalid filter value **then** 400 `invalid_filter` names the parameter; the UI shows the designed invalid-filter state | R-13 | API-08 |
| AC-SAVE-01 | **Given** a signed-in user **when** they save the same listing twice **then** one saved record exists and the second call is idempotent; **given** another user's id **then** no access | R-09 | API-06, DB-03, SEC-03 |
| AC-FY-01 | **Given** an incomplete profile **then** For You still returns useful results with reasons and "not compared" notes; **given** a complete profile **then** reasons match the ranking factors; no "you qualify" wording anywhere | R-08, R-30 | UT-04, UT-05, API-05, SCOPE-02 |

## B. Accounts and email
| ID | Scenario | Req | Tests |
|---|---|---|---|
| AC-AUTH-01 | **Given** a new or existing email **when** registering **then** the response is identical (202) and a verification or "already registered" email is queued in the same transaction | R-04, R-18 | AUTH-01, MAIL-01 |
| AC-AUTH-02 | **Given** unknown email vs wrong password **then** the login response and timing bucket are indistinguishable | R-17 | AUTH-03 |
| AC-AUTH-03 | **Given** repeated failures **then** 429 with `Retry-After`; no permanent lock-out | R-17 | AUTH-04, SEC-06 |
| AC-AUTH-04 | **Given** a password reset **then** the token is single-use, all sessions are revoked on success and a notice email is queued | R-04 | AUTH-05 |
| AC-MAIL-01 | **Given** the provider is down **then** emails stay `pending/failed`, retry with back-off, dead-letter after the cap, and an alert fires; no email is lost or sent twice for the same idempotency key | R-18 | MAIL-02…MAIL-07 |

## C. Editorial workflow and separation of duties ★ (D-18, D-22, D-23)
| ID | Scenario | Req | Tests |
|---|---|---|---|
| AC-EDIT-01 ★ | **Given** Alice (Contributor) submitted a listing **when** Alice tries to approve, reject, return or verify it (even if she also holds Editor or Administrator) **then** 403 `separation_of_duties` and the attempt is audited as a security event | R-11 | SOD-01, SOD-12 |
| AC-EDIT-02 ★ | **Given** Alice's submission **when** Bob (Editor) approves it **then** it is `approved`; Bob may then publish it **then** it is `published` with a slug — two people, no third required | R-10, R-11 | SOD-04, WF-01, WF-06, E2E-09 |
| AC-EDIT-03 ★ | **Given** Carol (Administrator, not the author) **when** she approves and publishes Alice's submission **then** it succeeds and both transitions are audited with capacity `administrator`; **given** a listing Carol authored **then** she cannot approve it | R-11 | SOD-09 |
| AC-EDIT-04 ★ | **Given** an author who holds Editor/Administrator authority **when** another authorised person has approved the **exact revision** **then** the author may publish it; **given** the revision has not been approved by another person, or its content hash differs from the approved one, **then** publication is refused (`approval_stale` / `invalid_transition`) and audited | R-11 | SOD-10, WF-04 |
| AC-EDIT-05 | **Given** an Editor **when** they try to edit content **then** refused; they can only reject with reasons and the author revises | R-10 | WF-05, SEC-05 |
| AC-EDIT-06 ★ | **Given** an approval **when** content is changed afterwards **then** it is a new version needing a new review; the old approval cannot publish the new content | R-10, R-11 | WF-04, DB-05 |
| AC-EDIT-07 | **Given** an Administrator **then** they cannot write status, content, verification or audit data directly (Django Admin fields read-only; DB triggers block) | R-11 | SOD-07, AUD-01 |
| AC-EDIT-08 ★ | **Given** any transition **then** the author is notified of approve/reject/publish (proposed) and the audit row records actor, capacity, transition, versions, reason and request id | R-16 | SOD-11, WF-10, WF-16 |
| AC-EDIT-09 ★ | **Given** audit data **then** a report lists author/approver pairs and listings approved and published by related accounts, to detect one person operating several accounts | R-11 | SOD-14 |
| AC-EDIT-10 | **Given** a publish **then** verification level is unchanged by publication and shows `not_verified` unless a different person recorded verification | R-12 | VER-01, VER-03 |
| AC-EDIT-11 | **Given** concurrent transitions **then** exactly one succeeds; the other gets 409 `state_conflict`; the publish guards are re-checked inside the winning transaction | R-10 | WF-09, WF-14 |
| AC-EDIT-12 | **Given** a takedown **then** public visibility ends immediately; it is an Editor/Administrator action | R-10 | WF-08 |
| AC-ROLE-01 ★ | **Given** the role registry **then** only Contributor, Editor and Administrator exist; no `publisher` role value, permission set, API enum value or UI exists | R-11 | PERM-01 |
| AC-ROLE-02 ★ | **Given** a new role added in a test registry **then** guards and `has_permission` honour it with no code change in the guards | R-11 | PERM-02 |
| AC-ROLE-03 ★ | **Given** every role × permission code in the matrix **then** the registry grants exactly what `ROLE_PERMISSION_MATRIX.md` states | R-11 | PERM-03, SEC-05 |

## D. Design and accessibility ★
| ID | Scenario | Req | Tests |
|---|---|---|---|
| AC-DS-01 | **Given** any built public page **then** computed radius is 0 and there are no shadows or gradients | R-15 | VIS-04 |
| AC-DS-02 ★ | **Given** built pages compared with the reference at 1440/768/390/320 **then** every computed-style difference is one of DEV-01…DEV-04 (text colours `#627185`, `#687380`, `#687485`; control border `#7693b7`) and nothing else | R-15 | A11Y-08, VIS-01, VIS-02, VIS-05 |
| AC-A11Y-01 ★ | **Given** the production token set **then** every text/background pair is ≥4.5:1 (≥3:1 for large text) | R-14 | A11Y-06 |
| AC-A11Y-02 ★ | **Given** every input, select and search group **then** the visible boundary is ≥3:1 against its surround; the focus ring is ≥3:1 and appears on every focusable element | R-14 | A11Y-07, A11Y-03 |
| AC-A11Y-03 | **Given** a keyboard-only user **then** search, save, register, onboarding and the staff transitions are completable | R-14 | A11Y-02 |
| AC-A11Y-04 ★ | **Given** dialogs, forms and results **then** dialogs have a role, name and focus trap/return; errors are associated and announced; result counts are announced; skip link, `lang` and page titles exist | R-14 | A11Y-04, A11Y-09 |
| AC-A11Y-05 | **Given** 200–400% zoom or a 320px viewport **then** no horizontal scroll and no loss of content | R-14 | A11Y-05, E2E-10 |
| AC-A11Y-06 | **Given** targets smaller than 24px **then** spacing is at least the reference spacing (SC 2.5.8 exemption) | R-14 | A11Y-07 |
| AC-A11Y-07 ★ | **Given** the save control **then** it has the accessible name "Save <title>", `aria-pressed`, and a shape change (♡/♥) as well as colour | R-14 | A11Y-04 |

## E. Runtime versions and operations ★
| ID | Scenario | Req | Tests |
|---|---|---|---|
| AC-VER-01 ★ | **Given** the approved pins **then** lockfiles and image digests match them and CI fails on drift | R-31 | OPS-10 |
| AC-VER-02 ★ | **Given** the pinned set **then** no known high/critical advisory exists on build day and weekly | R-31 | OPS-11 |
| AC-VER-03 ★ | **Given** a pinned runtime within 90 days of end of life **then** the build fails | R-31 | OPS-12 |
| AC-VER-04 ★ | **Given** Django 5.2 + psycopg 3.3 + the pinned PostgreSQL major **then** all migrations and the test suite pass (Phase 1 task V-01) | R-31 | OPS-13 |
| AC-OPS-01 | **Given** the health endpoints **then** live reports process state and ready fails when the database is unreachable, without leaking configuration | R-24 | OPS-01 |
| AC-OPS-02 | **Given** a backup **then** a restore rehearsal reproduces the database and is documented with evidence before launch | R-25 | OPS-05…OPS-07 |
| AC-OPS-03 | **Given** the shared VPS **then** a read-only inspection of Traefik→Nginx, capacity and the Granite Post is recorded before any deployment work, with no change to Granite | R-27 | OPS-08, OPS-09 |

## F. Category schemas ★ (all conditional on the owner approving the field lists, OQ-06)
| ID | Scenario | Req | Tests |
|---|---|---|---|
| AC-CAT-01 ★ | **Given** each draft schema **then** it is valid JSON Schema 2020-12 | R-32 | CAT-01 |
| AC-CAT-02 ★ | **Given** the twelve examples **then** each validates against its category schema and the `createDraft` request body | R-32 | CAT-02, CAT-03 |
| AC-CAT-03 ★ | **Given** the negative cases (extra property, bad enum, missing required, bad date/URL/country code, fee without currency) **then** all are rejected | R-32 | CAT-04 |
| AC-CAT-04 ★ | **Given** a tender with clarification, site-visit, closing and opening times **then** the order is validated; **given** `cofunding_percent` without `cofunding_required` **then** it is rejected | R-32 | CAT-06 |
| AC-CAT-05 ★ | **Given** a non-tender listing mentioning applicant fees **then** the reviewer must acknowledge or reject; tender document fees are not flagged | R-32 | CAT-07 |
| AC-CAT-06 ★ | **Given** a field that is not applicable to a category (e.g. salary on a scholarship) **then** the service rejects it | R-32 | CAT-05 |
| AC-CAT-07 ★ | **Given** a money amount **then** the currency is on the approved allow-list and pairs with a period; amounts are never converted or defaulted | R-32 | CAT-08 |

## G. Gate rule
A phase passes only when its scenarios pass in CI or are demonstrated with recorded commands and outputs, no critical/high security defects remain, accessibility evidence is attached, and the owner approves in writing. Failures are recorded, never summarised away.
