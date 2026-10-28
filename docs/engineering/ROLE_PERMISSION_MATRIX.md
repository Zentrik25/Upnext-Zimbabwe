# Role–permission matrix — APPROVED BASELINE (D-18, D-22, D-23)

Status: approved baseline for implementation. Phase 1 implements the role/permission **registry** and pure **policy functions** (`apps/api/access/`); Phase 2 wires them into the workflow. This matrix is the single source for authorisation tests (SOD-*, SEC-05, ADM-*, PERM-*).

## 1. Roles (initial implementation)

| Role | Kind | Granted by | Notes |
|---|---|---|---|
| Anonymous | none | — | no account |
| Seeker | account | self-registration | any active, verified account; no staff row |
| Contributor | staff, additive | Administrator | creates and edits **own** drafts, submits, opens amendments |
| Editor | staff, additive | Administrator | approves or rejects submissions they did not author, records verification, **publishes approved listings**, and takes down/withdraws/expires/archives |
| Administrator | staff, additive | Administrator `[OQ-13]` | the same approval and publication authority as an Editor (same guards) plus user, role, taxonomy and settings management |
| System | non-human | — | scheduled jobs with narrowly scoped permissions |

**No Publisher role exists in the initial implementation (D-23).** The registry is built so a future role is a configuration addition (new role value + permission set + tests), not a change to the guards.

Terms: **approval authority** = **publication authority** = Editor or Administrator. A person may hold several roles. No role implies Contributor: only Contributors create and edit drafts.

## 2. Matrix

✔ allowed · — denied · ◐ conditional (condition in the note) · own = only objects the actor created/authored

### 2.1 Public and seeker capabilities
| Capability | Anon | Seeker | Staff (additional) |
|---|---|---|---|
| Browse, search, filter, read public listings | ✔ | ✔ | ✔ |
| Register, verify email, reset password, sign in/out | ✔ | ✔ | ✔ |
| Own profile, sessions, password/email change, deletion request, For You, saved | — | own | own |
| Read another user's profile or saved list | — | — | — (no role may) |

Account-status gating (OQ-15): `pending_verification` — only verify/resend/reset/logout; `restricted`/`suspended`/`deactivated` per OQ-15 (proposed: restricted = read-only, suspended and deactivated = no session).

### 2.2 Editorial capabilities
| Capability (transition) | Contributor | Editor | Administrator | Condition |
|---|---|---|---|---|
| Create draft (T01) | ✔ | — | — | requires the Contributor role |
| Edit own draft (T02), submit (T03), discard (T13), reopen (T14) | own | — | — | author only |
| Open amendment on live/closed listing (T15) | ✔ | — | — | becomes that amendment's author |
| Add/edit sources | own draft | — | — | part of the frozen version |
| **Approve (T04) / reject (T05)** | — | ◐ | ◐ | **not the author or submitter of that chain**; reason on reject |
| Return approved → rejected (T06) | — | ◐ | ◐ | not the author; reason required |
| Record verification (V01) | — | ◐ | ◐ | not the author of that version |
| **Publish (T07)** | — | ◐ | ◐ | the exact revision (content hash) must have been **approved by a different authorised person**; the publisher may be the approver, a third person, or the author themself (D-22). Never an unapproved or changed revision |
| Schedule publish (T08) | — | ◐ | ◐ | only if `[OQ-14]` approved; same guards re-checked at execution |
| Take down (T09), withdraw (T10), manual expire (T11), archive (T12) | — | ✔ | ✔ | reason required; one-person safety actions |
| Automatic expiry at deadline (T11) | — | — | — | System only |
| View drafts | own | — | ◐ | Administrator read-only for support, audited |
| View in-review/approved/rejected versions & history | own | ✔ | ✔ | |
| Create organisation | ✔ | ✔ | — | during drafting |
| Edit / merge organisation | — | ✔ | ✔ | audited; alters displayed live listings |
| Propose a new skill | ◐ | ◐ | ✔ | only if `[OQ-21]` allows; Administrator approves |

### 2.3 Administration
| Capability | Administrator | Others |
|---|---|---|
| Grant / revoke staff roles (audited, `privileged`) | ✔ `[OQ-13]` | — |
| Create/deactivate staff accounts | ✔ | — |
| Restrict / suspend / deactivate a user (reason, audited) | ✔ | — |
| Manage taxonomies (category codes immutable) | ✔ | — |
| Activate a new `detail_schema` version | ✔ (via reviewed schema file, not a UI edit) | — |
| View full audit log | ✔ | Editor: history of listings they can see |
| Change settings (throttles, flags) — audited | ✔ | — |
| Impersonate a user | not provided | — |
| Retry email outbox / view job runs | ✔ | — |

## 3. Policy rules

### 3.1 Separation of duties (identity-based, per listing)
1. **Nobody approves their own submission.** The author of any version in the current chain, and its submitter, can never approve, reject, return or verify it. This holds even if they hold Editor or Administrator authority.
2. **Publication needs another person's approval of the exact revision (D-22).** An Editor or Administrator may publish only a revision that an authorised person *other than the author and submitter* approved, and only if its content hash equals the approved hash. Within that, the author may publish their own listing, the approver may publish, or a third person may.
3. **Material changes invalidate approval.** Versions are immutable once submitted; any change is a new version needing a new review. A stale hash blocks publication (`approval_stale`).
4. Guards compare **user identity**, not role names, and are evaluated **transactionally** on the backend (row lock on the listing, re-check inside the publish transaction), never in the client.
5. Editors and Administrators do not edit content; if changes are needed they reject with reasons and the author revises.
6. **Every transition is audited** (actor, capacity/role exercised, transition, versions, reason, request id) in the same database transaction; guard failures are audited as security events; the author is notified when their submission is approved, rejected or published `[PROPOSED]`.

### 3.2 Administrator constraints
1. Administrator authority is bounded by rules 1–3: an Administrator cannot approve what they authored, cannot publish an unapproved or changed revision, and cannot skip states.
2. Administrators cannot write status/state columns, version content, verification or review records directly; Django Admin shows them read-only and actions call the service.
3. Role grants/revokes (including granting oneself anything) are visible and attributable (severity `privileged`). Extra controls — second-administrator confirmation when granting the Administrator role, break-glass access, single-administrator bootstrap — are `[OQ-13]`.
4. No access to password hashes, raw tokens or session secrets; audit rows are append-only for everyone.
5. Disabling or weakening the guards is a code/config change reviewed through the decision register, never a runtime toggle.

### 3.3 Residual risk and detective control
One person controlling two accounts can satisfy the "another person" rule alone. Controls: named staff accounts with unique verified email, audited creation, optional MFA `[OQ-16]`, and a periodic report of author/approver pairs and of listings approved and published by related accounts (acceptance AC-EDIT-09) `[OQ-13]`.

### 3.4 Object-level rules
`/me/*` queries are always filtered by the authenticated user; non-public listings return 404 to unauthorised callers; staff queues exclude items the viewer authored from the *approval* queue (they may still see and publish their own approved items).

### 3.5 System actor
`system` may only expire listings past their deadline (re-checked under lock), send queued emails, purge expired tokens/sessions, and execute scheduled publication if OQ-14 is approved. It has a dedicated DB role.

## 4. Extensibility (D-23)
Permissions are **codes**; roles are **sets of codes** in one registry (`apps/api/access/registry.py`); guards (`policy.py`) ask "does the actor hold code X, and do the identity rules allow it?" — they never test role names. Adding a role later means adding an enum value, a code set and tests; no guard changes. Test PERM-02 proves this by registering a throw-away role in a test.

## 5. Enforcement points
| Layer | Mechanism |
|---|---|
| API | DRF permission class `HasPermission("code")` maps endpoint → permission code; editorial and administration routers are separate |
| Service | `publishing.policy` evaluates capability + identity guards for each transition; the only code that may change state |
| Database | triggers: `review_decision.decided_by ≠ author`, `verification_record.checked_by ≠ author`; publish requires `approved_by ≠ author chain` and matching content hash; immutability; append-only audit privileges |
| Admin UI | state fields read-only; actions call services |
| Tests | table-driven cases generated from this matrix (every role × capability × condition both allowed and denied) |

Permission codes: `opp.read_public, opp.draft.create, opp.draft.edit_own, opp.submit, opp.discard_own, opp.amend, opp.review.approve, opp.review.reject, opp.review.return, opp.verify.record, opp.publish, opp.schedule, opp.takedown, opp.withdraw, opp.expire, opp.archive, org.create, org.edit, employer.review, employer.verification.revoke, opp.withdraw_own, taxonomy.manage, user.role.grant, user.role.revoke, user.status.change, audit.read_all, report.read, report.triage, report.resolve, report.resolve_escalated, settings.manage, me.profile, me.saved, me.sessions, me.delete`.
Role → code grants: **Contributor** — `opp.draft.create, opp.draft.edit_own, opp.submit, opp.discard_own, opp.amend, org.create`. **Editor** — `opp.review.approve, opp.review.reject, opp.review.return, opp.verify.record, opp.publish, opp.schedule, opp.takedown, opp.withdraw, opp.expire, opp.archive, org.create, org.edit, employer.review, report.read, report.triage, report.resolve`. **Administrator** — all Editor codes plus `taxonomy.manage, user.role.grant, user.role.revoke, user.status.change, audit.read_all, settings.manage, employer.verification.revoke, report.resolve_escalated`. Seekers hold `me.*`; everyone holds `opp.read_public`.

## Phase 6A addendum: verified employer members (D-35)

A member of a **verified** organisation is not a staff role (there is no assignment row, no admin access, `User.is_staff` is unchanged). Through the publishing service such a member holds only `opp.draft.create, opp.draft.edit_own, opp.submit, opp.discard_own, opp.amend, opp.withdraw_own` (constant `EMPLOYER_AUTHOR_PERMISSIONS`), and only for listings bound to their own organisation in the categories jobs, internships and graduate programmes. `opp.withdraw_own` lets them close (withdraw) their own organisation's published listing, a one-person safety action like T10 that removes content and never adds it. They never hold a review, verification, publication, takedown or staff withdrawal (`opp.withdraw`) code. `employer.review` (Editors, Administrators) decides organisation claims and company-profile revisions; `employer.verification.revoke` (Administrators) withdraws an organisation's verification.

## Phase 6B addendum: seeker profile, For You and alerts (D-38)

No new permission code and no new role. The seeker features sit behind the existing account-level codes held by every authenticated, active account: `me.profile` (profile, For You, alert settings) and `me.saved` (saved opportunities). Access rules:

| Capability | Anonymous | Seeker (own account) | Another seeker | Employer member | Contributor / Editor | Administrator |
|---|---|---|---|---|---|---|
| Browse and search listings | yes | yes | yes | yes | yes | yes |
| Read, change, reset, delete **own** profile | no | yes | no | own only | own only | own only |
| Read anyone else's profile | no | no | no | **no** | **no** | **no** (no code, no route, not in Django Admin) |
| Read the For You page | no | own | own | own | own | own |
| Read, change **own** job alert | no | yes | no | own only | own only | own only |
| Unsubscribe from an alert | with the signed link in the message | yes | no | no | no | no |

Enforcement: every `/me/*` and `/discovery/for-you` view works on `request.user` only and no route carries an identifier that selects an account (`tests/test_profiles.py::test_no_url_exposes_a_seeker_profile_by_id`); `profiles` and `alerts` models are not registered in Django Admin (tested); the unsubscribe operation is on the reviewed public list in `tests/test_endpoint_review.py`.

## M2 addendum: report moderation (public reports about listings)

A report is a message to staff, written by anyone without an account. **It never changes a listing by itself**; a person acts on the listing through the publishing service, with the permissions in the tables above.

| Capability | Contributor | Editor | Administrator |
|---|---|---|---|
| See reports and their history (`report.read`) | no | yes | yes |
| Start an investigation, add notes, escalate (`report.triage`) | no | yes | yes |
| Resolve or dismiss a report that is not escalated (`report.resolve`) | no | yes | yes |
| Resolve or dismiss an **escalated** report; reopen a closed one (`report.resolve_escalated`) | no | no | yes |
| Withdraw, mark as expired or take down the reported listing | per the listing tables (`opp.withdraw`, `opp.expire`, `opp.takedown`) | yes | yes |

Separation of duties for reports: a person who **authored or submitted** any revision of the reported listing, or created it, cannot resolve or dismiss a report about it, nor take an action on the listing *through the report*; they can still add notes and escalate. Every step is recorded twice: in the report's append-only history and in the audit log. Taking a listing action from a report calls the same publishing-service transition as the listing screens, so the listing's own rules and audit apply unchanged.
