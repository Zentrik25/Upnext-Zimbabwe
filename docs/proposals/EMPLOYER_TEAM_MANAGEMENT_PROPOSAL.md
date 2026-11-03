# Employer team management: proposal — DRAFT for owner review

Status: DRAFT. **A proposal is not an approval** (CLAUDE.md rule 6). Nothing here is implemented, and none of it starts until the owner approves it in writing and records the decisions in `docs/governance/DECISION_REGISTER.md`. Requested by the owner on 2026-10-28 as a design only, deferred from milestone M2.

## 1. Where things stand (verified in the code)

| Fact | Where |
|---|---|
| A person acts for an organisation only through an `EmployerMembership`: roles `owner` (may also submit company-profile changes) and `recruiter` (posts listings only) | `apps/api/employers/models.py` (`MemberRole`, `EmployerMembership`) |
| The only way to create a membership is **staff approval of a claim** (`decide_claim`): the staff reviewer verifies the organisation and grants the first membership, with separation of duties (a reviewer cannot decide their own claim, nor verify an organisation they act for) | `apps/api/employers/services.py` |
| The only way to end one is **staff revocation** (`revoke_membership`), or automatically when the account is deleted | same file |
| One active membership per user and organisation (partial unique index); a revoked membership keeps a reason and is never deleted | `membership_one_active_per_user_org`, `membership_revocation_has_reason` |
| Every request re-checks `active_membership`, so a revoked member loses access at once, even with a live session | `employers/services.py::active_membership` |
| There is **no** invitation, no member list, no self-service removal and no role change. A second colleague needs a second claim and a second staff review | no endpoint under `api/v1/employer/` touches memberships |
| Single-use e-mail tokens exist for accounts (`AuthToken`: purpose, expiry, HMAC selector, no secret stored), but each row points at an existing user, so it cannot carry an invitation to an address that has no account yet | `apps/api/accounts/models.py` |
| E-mail goes through the outbox, retries, suppression and the verified-delivery gate. **Real e-mail stays off until B-01 closes** | `apps/api/notifications/` |

## 2. Goal and non-goals

**Goal.** Let an organisation's owner bring colleagues in and take them out without a staff review for each one, without weakening the rules that keep listings honest.

**Non-goals** (each needs its own decision): applicant management or candidate search (excluded by D-38), billing or seats, single sign-on, more than two roles, moving ownership between organisations, and any change to the editorial workflow. **Every listing a recruiter submits still goes through staff review and separation of duties exactly as today (D-18, D-22, D-35).** Team management only decides who may *submit* for the organisation.

## 3. Proposed behaviour

### 3.1 Permissions

| Action | Owner | Recruiter | Staff (Editor / Administrator) |
|---|---|---|---|
| See the team (name, role, since) | yes | yes, names only | yes |
| Invite a recruiter | yes | no | no (staff use the claim route) |
| Invite an owner | no, see P-TEAM-03 | no | via a claim only |
| Cancel a pending invitation | yes | no | yes |
| Remove a recruiter | yes | no | yes (existing `revoke_membership`) |
| Remove an owner | no | no | yes, with a reason |
| Leave the organisation | yes, unless last owner | yes | n/a |
| Change a role | not in the first version | no | no |

The **last owner can never leave or be removed** by a member; only staff can end the last ownership, with a reason (the organisation is then unmanaged until a new claim is approved).

### 3.2 Invitation lifecycle

`pending → accepted | declined | cancelled | expired`. One row per invitation, never deleted (history), the final state is terminal.

1. An owner enters an e-mail address and a role (recruiter). The server checks: the caller is an active owner of a **verified** organisation; the address is not already an active member; no pending invitation exists for that address and organisation (the duplicate is refused, not silently repeated); the organisation is under the team cap (P-TEAM-02); rate limits.
2. The system creates the invitation with an expiry (proposed **7 days**) and sends an e-mail through the outbox. The e-mail names the organisation and the inviter and carries a single-use link.
3. The invitee opens the link. They must **sign in or register with the invited address and have it verified**. A signed-in person whose address differs gets a neutral refusal that does not reveal the invited address.
4. The invitee sees what they are joining and confirms. Acceptance creates the `EmployerMembership` (with `granted_by` = the inviting owner and a link to the invitation) in one transaction that locks the invitation row, so two clicks or two tabs create one membership.
5. Expired, cancelled or used links all give the same plain answer ("This invitation is no longer valid").

**Before B-01 closes** nothing can be e-mailed. The feature must say so and stay off for new addresses. A pending-invitation **inbox** for an *existing* account (shown on its dashboard, matched by verified address) can work without e-mail, so I propose building it in that order (P-TEAM-05).

### 3.3 Removal and leaving

Removal ends the membership with a reason code (`removed_by_owner`, `left`, `removed_by_staff`, `account_deleted`), sets `revoked_by`/`revoked_at`, and takes effect on the next request. Drafts the person created stay with the organisation (the organisation, not the person, owns listings); a draft the removed person had *submitted* stays in review, and the reviewer sees the author as a former member. The removed person and the owners get a notice e-mail (through the gate).

## 4. Data model (one migration, additive)

New table `employers_employerinvitation`: `id` (uuid), `organisation` (PROTECT), `email` (case-insensitive, 254), `role`, `invited_by` (PROTECT), `created_at`, `expires_at`, `state`, `decided_at`, `membership` (null, set on accept), `selector` (unique, indexed; the secret is an HMAC of the selector, id, organisation and expiry with `UPNEXT_TOKEN_KEY`, **never stored**, the same scheme as `AuthToken`).

Constraints: one `pending` invitation per `(organisation, lower(email))` (partial unique index); `expires_at > created_at`; a terminal state needs `decided_at`; `membership` only when `state = accepted`; the e-mail is stored lower-cased and **removed 30 days after a terminal state** by the existing retention job (personal data minimisation). Add `revoked_reason` choices to `EmployerMembership` without changing existing rows (a nullable reason code beside the free-text reason).

No change to listings, the editorial workflow, or any published data.

## 5. API (all authenticated, CSRF-protected, under `/api/v1/employer/`)

| Method and path | Who | Notes |
|---|---|---|
| `GET organisations/{id}/team` | member | members plus (owners only) pending invitations |
| `POST organisations/{id}/invitations` | owner | body: `email`, `role`; 202 with a uniform body whether or not the address already has an account |
| `DELETE invitations/{id}` | owner or staff | cancels a pending invitation |
| `POST invitations/accept` | invitee | body: token; idempotent for the same person |
| `POST invitations/decline` | invitee | same token |
| `GET me/invitations` | any signed-in user | pending invitations for the caller's **verified** address (the inbox, P-TEAM-05) |
| `DELETE organisations/{id}/members/{membershipId}` | owner (recruiters only) | body: `reason_code` |
| `POST organisations/{id}/leave` | member | refused for the last owner |

Errors follow the existing contract (`conflict`, `invalid_transition`, `not_found` for anything the caller may not see, never 403 for existence leaks). Each endpoint gets an OpenAPI entry and a row in `TRACEABILITY.md`.

## 6. Security and abuse controls

- **Owner account takeover is the main risk**: a stolen owner session could add an attacker as a recruiter. Controls: owners only; a team cap; a fresh password confirmation (or step-up) to invite, as for changing the e-mail address; every invitation, acceptance, removal and leave is an **audit event** (severity `security`) and **e-mails every owner** (through the gate); staff can still revoke anything; recruiters can never invite.
- **Enumeration and spam**: uniform response to an invitation request; per-owner and per-organisation daily caps; throttles in the existing `me_write`/`email_request_ip` style; the invitee address is never echoed back to a different person.
- **Token hygiene**: single use, 7-day expiry, HMAC with a selector, constant-time comparison, invalidated on cancel and when the invitation is superseded; the token is never logged (the log redaction tests already cover the e-mail and token patterns and would be extended).
- **Separation of duties is unchanged**: staff review of listings, claim review and organisation verification are not bypassed. A recruiter added this way holds exactly the recruiter powers today (draft, edit, submit and close their organisation's listings; no profile changes, no review rights, no staff access).
- **Concurrency**: invitation row locked on accept and on cancel; membership creation guarded by the existing unique index; two owners removing the same person at once give one removal and one `not_found`.
- **Deleted accounts**: the existing deletion path already ends memberships; it must also cancel invitations the person sent and delete pending invitations held for their address.
- **Privacy**: the team list shows display names and roles only to members; the invitee address is visible only to owners while pending. The privacy text and `DATA_INVENTORY.md` need a line (B-02 review).

## 7. Screens (the design system and tokens in force when it is built)

`/employer/organisations/{id}/team` (owner and recruiter views), an "Invite a colleague" form, a pending-invitation list with cancel, a remove-member confirmation (plain dialog pattern already used for deleting a profile), an invitation acceptance page, and an "Invitations for you" panel on the account dashboard. Loading and error states use the shared components from the M2 loading work.

## 8. Test plan (to be written with the feature)

Backend: invite, duplicate, existing member, cap, rate limit, wrong role, recruiter refused, staff cancel; accept once, accept twice, accept with the wrong address, expired, cancelled; last-owner protection; concurrent accept, concurrent removal; deleted inviter and deleted invitee; audit and outbox rows; retention of old invitations; no token or address in logs. Frontend: forms, errors, empty states, keyboard use, axe at 320 and 1440, dark theme. End-to-end: invite → accept → post → remove → access denied, and the pre-B-01 inbox route.

## 9. Delivery in three steps (each reviewable)

1. **Model, services, audit, tests** (no endpoints). 2. **Endpoints, OpenAPI, traceability, the in-app inbox and team page.** 3. **E-mail notices through the outbox**, switched on only when B-01 is closed with evidence.

Complexity: **Large** (about 3 reviewable pull requests). It reuses the outbox, audit, retention, throttling and token patterns; it adds no dependency and no new service.

## 10. Decisions the owner needs to make

| ID | Question | Proposed default |
|---|---|---|
| P-TEAM-01 | Is self-service team management wanted for launch, or is the claim route enough for now? | build after launch blockers, not before |
| P-TEAM-02 | Team size cap | 10 active members per organisation |
| P-TEAM-03 | May an owner invite another **owner**? | no: a second owner comes through a staff-reviewed claim (keeps verification evidence) |
| P-TEAM-04 | Invitation lifetime | 7 days, one resend per invitation |
| P-TEAM-05 | Build the pending-invitation inbox (works without e-mail) first, e-mail later? | yes |
| P-TEAM-06 | Must an owner confirm their password to invite? | yes |
| P-TEAM-07 | Retention of invitation e-mail addresses after a terminal state | 30 days |
| P-TEAM-08 | May a recruiter leave on their own? | yes, immediately |

Out of scope and unchanged: role changes, ownership transfer, billing, and anything that touches listing review.
