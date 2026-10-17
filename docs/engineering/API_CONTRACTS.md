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
