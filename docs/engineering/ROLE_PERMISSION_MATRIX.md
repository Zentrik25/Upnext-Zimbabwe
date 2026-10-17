# Role–permission matrix — DRAFT (final proposal for approval)

Status: DRAFT. Implements D-09. Open points are tagged `[OQ-n]` and specified in their stricter reading until decided. This matrix is the single source for authorisation tests (TRACEABILITY R-07, R-08, R-20).

## 1. Roles

| Role | Kind | Granted by | Notes |
|---|---|---|---|
| Anonymous | none | — | no account |
| Seeker | account | self-registration | any active, verified account; no staff row |
| Contributor | staff, additive | Administrator | creates and edits **own** drafts, submits, opens amendments |
| Editor | staff, additive | Administrator | reviews submissions **not authored by them**; records verification |
| Publisher | staff, additive | Administrator | publishes approved listings; withdraws, expires, archives, takes down |
| Administrator | staff, additive | Administrator `[OQ-13]` | manages users, roles, taxonomies; **no editorial transition by virtue of this role** |
| System | non-human | — | scheduled jobs (expiry; outbox worker) with narrowly scoped permissions |

A person may hold several staff roles. No role implies another. Authorisation is evaluated per request from the database (never from role data cached in a session) and per **listing** for separation-of-duties guards.

## 2. Matrix

✔ allowed · — denied · ◐ conditional (condition in the note column) · own = only objects the actor created/authored

### 2.1 Public and seeker capabilities

| Capability | Anon | Seeker | Staff roles (additional) |
|---|---|---|---|
| Browse, search, filter public listings; read public detail | ✔ | ✔ | ✔ |
| Register, verify email, reset password | ✔ | ✔ | ✔ |
| Sign in / out | ✔ | ✔ | ✔ |
| View/edit own profile; list/revoke own sessions; change password; request deletion | — | ✔ | ✔ |
| For You feed | — | ✔ | ✔ |
| Save / unsave / list own saved | — | ✔ | ✔ |
| Read another user's profile or saved list | — | — | — (no role may; see 3.2) |

Account-status gating: `pending_verification` — only verify/resend/reset/logout; `restricted`/`suspended`/`deactivated` — behaviour per OQ-15 (documents propose: restricted = read-only, suspended = no session, deactivated = no session).

### 2.2 Editorial capabilities

| Capability | Contributor | Editor | Publisher | Administrator | Condition |
|---|---|---|---|---|---|
| Create draft (T01) | ✔ | — | — | — | |
| Edit draft content (T02) | own | — | — | — | author only; Editors do not edit content (they reject with reasons) |
| Submit for review (T03) | own | — | — | — | |
| Discard own draft/rejected (T13) | own | — | — | — | |
| Reopen own rejected (T14) | own | — | — | — | |
| Open amendment on a live/closed listing (T15) | ✔ | — | — | — | becomes the amendment's author |
| Add/edit source records | own (draft) | — | — | — | provenance is part of the frozen version |
| Approve (T04) / reject (T05) | — | ◐ | — | — | not the author or submitter of that chain |
| Return approved → rejected (T06) | — | — | ◐ | — | not the author |
| Record verification (V01) | — | ◐ | — | — | not the author of that version |
| Publish (T07) | — | — | ◐ | — | not the author; not the approver `[OQ-12]` |
| Schedule publish (T08) | — | — | ◐ | — | only if `[OQ-14]` approved; same guards |
| Take down (T09), withdraw (T10), expire manually (T11), archive (T12) | — | — | ✔ | — | reason required; takedown is a deliberate single-actor safety action |
| Expire at deadline (T11, automatic) | — | — | — | — | System only |
| View drafts | own | — | — | ◐ | Administrator: read-only, for support, audited |
| View in-review/approved/rejected versions & history | own | ✔ | ✔ | ✔ read-only | |
| Create organisation | ✔ | ✔ | — | — | during drafting; duplicate suggestions shown |
| Edit / merge organisation | — | ✔ | — | ✔ | audited; edits alter live listings' display, so Editor/Admin only `[PROPOSED]` |
| Propose a new skill (taxonomy) | ◐ | ◐ | — | ✔ | only if `[OQ-21]` allows suggestions; approval by Administrator |

### 2.3 Administration

| Capability | Administrator | Others |
|---|---|---|
| Grant / revoke staff roles | ✔ (audited, `privileged`) `[OQ-13]` | — |
| Create/deactivate staff accounts | ✔ | — |
| Restrict / suspend / deactivate a user account | ✔ (reason required, audited) | — |
| Manage taxonomies (categories codes immutable, locations, sectors, skills, fields of study) | ✔ | — |
| Activate a new `detail_schema` version | ✔ (code-reviewed JSON Schema, not a UI edit) | — |
| View audit log | ✔ full | Editor/Publisher: history of listings they can see only |
| Change system settings (throttles, feature flags) | ✔ (audited) | — |
| Impersonate a user | not provided | — |
| Run/retry email outbox, view job runs | ✔ read; retry ✔ | — |

## 3. Policy rules

### 3.1 Separation of duties (identity-based, per listing)
1. **Author ≠ approver/rejecter/returner/verifier/publisher.** "Author" = `author_id` of any version in the current chain, or the submitter.
2. **Approver ≠ publisher** (stricter reading, `[OQ-12]`).
3. Guards compare **user identity**, not role names. A person holding Contributor + Editor cannot approve what they wrote.
4. **Staff shortage:** under rule 2 each listing needs three distinct people (author, approver, publisher). A smaller team cannot publish; this is a staffing blocker to resolve before launch (REVIEW_PACKAGE §Blockers), not something code may work around.

### 3.2 Administrator constraints (no silent bypass)
1. No editorial permission derives from `administrator`. Role grants are the only route to editorial ability and are visible in the audit log with severity `privileged`.
2. Administrators cannot edit status/state columns, version content, verification or review records (Django Admin shows them read-only; the service rejects).
3. An administrator granting a role to themselves must be visible and attributable; second-admin confirmation, break-glass access and single-admin bootstrap are `[OQ-13]`. Until decided, the specification requires only: every grant/revoke is audited and cannot be performed by a non-administrator.
4. Administrators have no access to password hashes, raw tokens, or session secrets; no API returns them.
5. Audit rows cannot be edited or deleted by any role, including administrators.
6. Disabling or weakening the separation-of-duties guard is a code/config change reviewed through the decision register, never a runtime toggle.

### 3.3 Object-level rules
- `/me/*` queries are always filtered by the authenticated user; there is no endpoint parameter that selects another user.
- Non-public listings return 404 (not 403) to unauthorised callers to avoid existence leaks.
- Staff queues exclude items the viewer authored (Editor queue) or authored/approved (Publisher queue).

### 3.4 System actor
`system` may only: expire listings past their deadline (T11, with re-check under lock); send queued emails; purge expired tokens/sessions; execute scheduled publication if OQ-14 is approved. It has a dedicated DB role with least privilege and cannot call any other transition.

## 4. Enforcement points

| Layer | Mechanism |
|---|---|
| API | DRF permission classes map endpoint → permission code (below); anonymous/seeker endpoints never share a router with editorial ones |
| Service | `publishing.policy` evaluates role + SoD for each transition; the only code that may change state |
| Database | triggers for SoD on `review_decision`/`verification_record`, immutability, append-only audit privileges |
| Admin UI | status fields read-only; actions call services; model-level permissions mapped from this matrix |
| Tests | table-driven test generated from this matrix: every (role × capability × condition) is asserted both allowed and denied |

Permission codes (stable identifiers for tests and audit): `opp.read_public, opp.draft.create, opp.draft.edit_own, opp.submit, opp.discard_own, opp.amend, opp.review.approve, opp.review.reject, opp.review.return, opp.verify.record, opp.publish, opp.schedule, opp.takedown, opp.withdraw, opp.expire, opp.archive, org.create, org.edit, taxonomy.manage, user.role.grant, user.role.revoke, user.status.change, audit.read_all, settings.manage, me.profile, me.saved, me.sessions, me.delete`.
