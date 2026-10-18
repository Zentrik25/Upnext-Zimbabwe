# API contracts — DRAFT
The machine-readable contract is `docs/engineering/openapi/openapi.yaml` (OpenAPI 3.1; validated with an OpenAPI validator when produced). This file records conventions and what is intentionally not final.

## Conventions
- Base `/api/v1`; JSON only; no trailing slashes; same-origin cookie sessions with CSRF header on mutations.
- Public detail by **slug**; immutable uuid `id` elsewhere.
- Lists: `{data, page{limit, has_more, next_cursor, total?}}`; single resources are plain objects.
- Errors: `{error:{code, message, request_id, fields?}}` with stable codes (VALIDATION_SPEC §11, EDITORIAL_WORKFLOW §6).
- Cursor pagination (signed, tied to sort and filters); limit 1–50, default 20.
- Idempotent save (`PUT`) and unsave (`DELETE`); transitions carry `expected_row_version`.
- Rate limits return 429 with `Retry-After` (values in SECURITY_ARCHITECTURE §8, PROPOSED).
- Versioning: `/api/v1` is additive within a version; breaking changes require a new version and a retirement policy (not yet written).

## Groups
public (opportunities, taxonomies, skills), auth, me (account, profile, sessions, saved), discovery (For You), editorial and administration (staff; **reserved** — exposure depends on the staff-UI decision, OQ-16), health.

## Not final (OPEN)
Category `detail` fields (OQ-06); expired/withdrawn visibility in lists (OQ-20); organisation filter without organisation pages (OQ-24); For You score display and incomplete-profile behaviour (OQ-23); deadline date-only semantics and currencies (OQ-22); deletion cooling-off (OQ-09); account-status semantics (OQ-15); saved-item rules (OQ-31); application methods beyond external URL (OQ-05).

## Contract governance
The generated schema from the API must equal this file (contract test API-*); changes to the contract and to `TRACEABILITY.md` are made in the same change.

## Implementation status (Phase 1)
Implemented and checked against this contract by `apps/api/tests/test_openapi.py`: `getApiRoot`, `getCsrfToken`, `login`, `logout`, `getMe`. Everything else in `openapi.yaml` is specified but not implemented. The `StaffRole` enum has no `publisher` (D-23).

## Implementation status (Phase 2)
Implemented and checked against this contract by `apps/api/tests/test_openapi.py` and `test_public_api.py` (real responses are validated against the contract schemas): `listOpportunities`, `getOpportunity`, `listCategories`, `listLocations`, `listSectors`, `searchSkills`. Behaviour recorded as provisional defaults: expired listings only with `include_expired=true` or `deadline_state=expired`, withdrawn and archived never listed, `expired`/`withdrawn` readable by slug, archived 404 (P2-01); list `total` is returned on the first page only (later pages return `null`, which the contract allows); `organisation_id` filter is implemented (OQ-24 still open); unknown or repeated parameters are `400 invalid_filter` naming the parameter; cursors are signed, expire after 24 hours and are bound to the sort and filters (`invalid_cursor`).
Contract change made in Phase 2 (additive, reserved editorial API): `TransitionRequest.checklist` accepts the optional `applicant_payment_reviewed` flag. The editorial and administration operations remain **specified but not exposed**: the staff interface is the Django Admin (P2-06).

## Implementation status (Phase 3)
Implemented and checked against this contract by `apps/api/tests/test_openapi.py`, `test_accounts_api.py` and `test_saved.py`: `register`, `verifyEmail`, `resendVerification`, `requestPasswordReset`, `confirmPasswordReset`, `changePassword`, `updateMe`, `listSessions`, `revokeSession`, `requestAccountDeletion`, `cancelAccountDeletion`, `listSaved`, `saveOpportunity`, `unsaveOpportunity`, `requestEmailChange` (Phase 5, D-31: answers `503 email_unavailable` until delivery is verified; the new address is confirmed through `verifyEmail`; `409 staff_account` for staff; `User.email_change_available` tells the web app whether to show it) (with `login`, `logout`, `getMe` from Phase 1). Not implemented: `getProfile`, `updateProfile`, `getForYou`, the editorial and administration groups.
Behaviour recorded as provisional defaults (P3-01…P3-08): login before e-mail confirmation is `403 email_not_verified`; a wrong password on a re-authentication returns `403 reauth_required` and counts against the sign-in limiter; saving a closed or withdrawn listing is `409 listing_not_saveable`, the 200-item cap is `409 saved_limit_reached`, a non-public listing is `404`; deletion is requested and recorded only (`scheduled_for` is always `null`).
Additive contract changes made in Phase 3: `GET /me/saved` accepts `ids` (up to 50 identifiers; returns saved states without content, used to mark save buttons) and may answer `400`; the `User` schema gains `deletion_requested_at` (nullable).

## Implementation status (Phase 6B)
Implemented and contract-tested against `openapi/openapi.yaml`: `getProfile`, `updateProfile`, `deleteProfile`, `resetProfilePreferences` (`/me/profile`, `/me/profile/reset-preferences`), `getForYou` (`/discovery/for-you`), `getJobAlert`, `updateJobAlert` (`/me/alerts`) and `unsubscribeJobAlert` (`/alerts/unsubscribe`, public, no CSRF: the signed token is the credential). The draft Phase 0 `Profile`, `ProfileUpdate` and `ForYouItem` schemas were **replaced** (not extended): no `country` or `fields_of_study`, `highest_qualification` uses the jobs-schema vocabulary, `work_arrangements` and `employment_types` added, taxonomy values returned with names, `match.notes` added, `score` removed (rules-v1 shows no number), `meta.mode` and `meta.fields_filled` replace `profile_complete`. The saved-opportunities operations are unchanged. Provisional choices: P6B-01 to P6B-12 in the decision register.
