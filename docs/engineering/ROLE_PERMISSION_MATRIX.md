# Role–permission matrix — DRAFT (revised for D-18)

Status: DRAFT. Implements D-18 / ADR-0011 (supersedes the earlier three-person rule). Open points are tagged `[OQ-n]`. This matrix is the single source for authorisation tests (SOD-*, SEC-05, ADM-*).

## 1. Roles

| Role | Kind | Granted by | Notes |
|---|---|---|---|
| Anonymous | none | — | no account |
| Seeker | account | self-registration | any active, verified account; no staff row |
| Contributor | staff, additive | Administrator | creates and edits **own** drafts, submits, opens amendments |
| Editor | staff, additive | Administrator | **approval authority and publication authority**: approves or rejects submissions they did not author, records verification, publishes approved listings, and takes down/withdraws/expires/archives |
| Administrator | staff, additive | Administrator `[OQ-13]` | **approval authority and publication authority by role** (same guards as an Editor) plus user, role, taxonomy and settings management |
| Publisher | staff, additive, **optional** `[OQ-32]` | Administrator | publication authority only: publishes approved listings and runs the lifecycle actions; cannot approve. May be dropped |
| System | non-human | — | scheduled jobs with narrowly scoped permissions |

Terms: **approval authority** = Editor or Administrator. **Publication authority** = Editor, Administrator or Publisher. A person may hold several roles; authority comes from the role, restrictions from identity (below). No role implies Contributor: only Contributors create and edit drafts.

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
| Capability (transition) | Contributor | Editor | Publisher | Administrator | Condition |
|---|---|---|---|---|---|
| Create draft (T01) | ✔ | — | — | — | requires the Contributor role |
| Edit own draft (T02), submit (T03), discard (T13), reopen (T14) | own | — | — | — | author only |
| Open amendment on live/closed listing (T15) | ✔ | — | — | — | becomes that amendment's author |
| Add/edit sources | own draft | — | — | — | part of the frozen version |
| **Approve (T04) / reject (T05)** | — | ◐ | — | ◐ | **not the author or submitter of that chain**; reason on reject |
| Return approved → rejected (T06) | — | ◐ | ◐ | ◐ | not the author; reason required |
| Record verification (V01) | — | ◐ | — | ◐ | not the author of that version |
| **Publish (T07)** | — | ◐ | ◐ | ◐ | **not the author**; the approver **may** publish the same listing (OQ-12 resolved by D-18); approval must be current (hash); an author holding publish authority may not publish their own listing `[OQ-33]` |
| Schedule publish (T08) | — | ◐ | ◐ | ◐ | only if `[OQ-14]` approved; same guards |
| Take down (T09), withdraw (T10), manual expire (T11), archive (T12) | — | ✔ | ✔ | ✔ | reason required; one-person safety actions |
| Automatic expiry at deadline (T11) | — | — | — | — | System only |
| View drafts | own | — | — | ◐ | Administrator read-only for support, audited |
| View in-review/approved/rejected versions & history | own | ✔ | ✔ | ✔ | |
| Create organisation | ✔ | ✔ | — | — | during drafting |
| Edit / merge organisation | — | ✔ | — | ✔ | audited; alters displayed live listings |
| Propose a new skill | ◐ | ◐ | — | ✔ | only if `[OQ-21]` allows; Administrator approves |

### 2.3 Administration
| Capability | Administrator | Others |
|---|---|---|
| Grant / revoke staff roles (audited, `privileged`) | ✔ `[OQ-13]` | — |
| Create/deactivate staff accounts | ✔ | — |
| Restrict / suspend / deactivate a user (reason, audited) | ✔ | — |
| Manage taxonomies (category codes immutable) | ✔ | — |
| Activate a new `detail_schema` version | ✔ (via reviewed schema file, not a UI edit) | — |
| View full audit log | ✔ | Editor/Publisher: history of listings they can see |
| Change settings (throttles, flags) — audited | ✔ | — |
| Impersonate a user | not provided | — |
| Retry email outbox / view job runs | ✔ | — |

## 3. Policy rules

### 3.1 Separation of duties (identity-based, per listing)
1. **The author cannot approve, reject, return, verify or publish their own listing.** "Author" = `author_id` of any version in the current chain, or its submitter.
2. **Two different people are sufficient:** a Contributor authors; an Editor or Administrator (a different person) approves and may then publish. No third person is required.
3. Guards compare **user identity**, not role names: a person who is both Contributor and Editor/Administrator is bound by rule 1 for what they wrote.
4. Editors and Administrators do not edit content; if changes are needed they reject with reasons and the author revises. This keeps "approved" meaning "approved as written".
5. Approval binds the content hash; anything changed afterwards is a new version needing a new approval.
6. **Every transition is audited** (actor, capacity/role exercised, transition, versions, reason, request id) in the same database transaction; the author is notified when their submission is approved, rejected or published `[PROPOSED]`.

### 3.2 Administrator constraints
1. Administrator authority is bounded by rule 1: an Administrator cannot approve or publish what they authored, and cannot skip states.
2. Administrators cannot write status/state columns, version content, verification or review records directly; Django Admin shows them read-only and actions call the service.
3. Role grants/revokes (including granting oneself anything) are visible and attributable (severity `privileged`). Extra controls — second-administrator confirmation when granting the Administrator role, break-glass access, single-administrator bootstrap — are `[OQ-13]`.
4. No access to password hashes, raw tokens or session secrets; audit rows are append-only for everyone.
5. Disabling or weakening the guards is a code/config change reviewed through the decision register, never a runtime toggle.

### 3.3 Residual risk and detective control
One person controlling two accounts can satisfy the two-person rule alone. Controls: named staff accounts with unique verified email, audited creation, optional MFA `[OQ-16]`, and a periodic report of author/approver pairs and of listings approved and published by the same person (acceptance AC-EDIT-09) `[OQ-13]`.

### 3.4 Object-level rules
`/me/*` queries are always filtered by the authenticated user; non-public listings return 404 to unauthorised callers; staff queues exclude items the viewer authored (Editor, Administrator and Publisher queues).

### 3.5 System actor
`system` may only expire listings past their deadline (re-checked under lock), send queued emails, purge expired tokens/sessions, and execute scheduled publication if OQ-14 is approved. It has a dedicated DB role.

## 4. Enforcement points
| Layer | Mechanism |
|---|---|
| API | DRF permission classes map endpoint → permission code; editorial and administration routers are separate |
| Service | `publishing.policy` evaluates capability + identity guards for each transition; the only code that may change state |
| Database | triggers: `review_decision.decided_by ≠ author`, `verification_record.checked_by ≠ author`, `opportunity_version.published_by ≠ author`; immutability; append-only audit privileges |
| Admin UI | state fields read-only; actions call services |
| Tests | table-driven cases generated from this matrix (every role × capability × condition both allowed and denied) |

Permission codes: `opp.read_public, opp.draft.create, opp.draft.edit_own, opp.submit, opp.discard_own, opp.amend, opp.review.approve, opp.review.reject, opp.review.return, opp.verify.record, opp.publish, opp.schedule, opp.takedown, opp.withdraw, opp.expire, opp.archive, org.create, org.edit, taxonomy.manage, user.role.grant, user.role.revoke, user.status.change, audit.read_all, settings.manage, me.profile, me.saved, me.sessions, me.delete`. Role → code grants: Editor and Administrator hold `opp.review.*`, `opp.verify.record`, `opp.publish`, `opp.schedule`, `opp.takedown`, `opp.withdraw`, `opp.expire`, `opp.archive`; Publisher holds `opp.publish`, `opp.review.return`, `opp.schedule`, `opp.takedown`, `opp.withdraw`, `opp.expire`, `opp.archive`; Contributor holds the draft codes and `opp.amend`.
