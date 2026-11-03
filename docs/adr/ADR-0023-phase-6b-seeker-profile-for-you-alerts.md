# ADR-0023 — Phase 6B jobseeker profile, For You and job alerts — DRAFT

Status: DRAFT (recorded with D-38, implemented 2026-10-18). Not approved by the owner beyond the written Phase 6B authorisation. Supersedes the readiness plan `docs/phase6b/PHASE6B_PLAN.md` where they differ; the differences are listed in section "Departures from the plan".

## Context
The owner authorised jobseeker profiles, a deterministic For You page, an improved saved-opportunities presentation inside a compact dashboard, and e-mail job alerts (D-38). Public browsing without an account must stay complete. E-mail delivery is unverified (B-01), so nothing may be sent.

## Decision
1. **Two small Django apps, no new infrastructure.** `profiles` (one private row per account plus the For You engine) and `alerts` (one alert row per account, a per-listing ledger, the digest builder). No Celery, no Redis, no third-party package, no AI service (ADR-0004 still holds).
2. **Profiles are private by construction.** Reachable only through `/me/profile` for the signed-in owner, not registered in Django Admin, no staff permission code reads them, no employer endpoint exists, and tests pin each of these. Fields hold taxonomy identifiers and enums only (no free text), so nothing in a profile can carry a stray personal detail.
3. **For You is computed on request from public listing data** (`visible_versions`), is never stored, and is explained by the same factors that ordered it (`docs/engineering/RECOMMENDATION_SPEC.md`). It uses only attributes present in the listing and never treats a missing attribute as satisfied or as a reason to exclude.
4. **Saved opportunities are untouched as a data model.** No field is added to the list; the dashboard reuses `listSaved` and links each open listing to its "How to apply" section so the handoff wording and the click counter keep working.
5. **Alerts are one row per account** (categories, locations, frequency, on/off, consent proof, a watermark) and a ledger that makes a listing go out at most once. The worker pass runs inside the existing housekeeping cycle and is **gated by `delivery_verified()`**: while it is false the pass writes nothing. Message generation is a pure function tested without a sender.
6. **One-click unsubscribe** is a signed, non-expiring token for the account and the alert kind. It switches the alert off. It does not use the address suppression list, which has no notion of message kind.
7. **Deletion:** `accounts.deletion.execute` removes the profile, the alert and its ledger. The cooling-off period pauses alerts (an account with a pending deletion request is not eligible).
8. **Dashboard** is four routes under one navigation strip (`/dashboard`, `/for-you`, `/saved`, `/profile`, `/alerts`), reusing the existing components; the header gains one link.

## Departures from the readiness plan (`PHASE6B_PLAN.md`)
- No double opt-in e-mail: the account address is already verified by a confirmation link; consent is an explicit, recorded action. (Plan §3.2; provisional P6B-07.)
- Unsubscribe does not write the suppression list (plan §3.3), for the reason in decision 6.
- Alerts follow the profile-independent choices on the alerts page, not saved searches (plan §6 asked the owner to decide).
- Qualification is compared when the listing states a minimum (plan §2 said "not compared"), because the owner listed qualifications among the matching attributes and the jobs schema holds `minimum_qualification`.

## Consequences
- Profile and alert tables are new personal data: the data inventory, retention table, privacy page and rights procedures are updated, and B-02 (reviewed privacy text) still gates collecting anything in production.
- A weekly or daily e-mail needs a running worker and verified delivery; until then the feature stores preferences only.
- The matching rules are intentionally crude and transparent. Ranking quality will need real listing data to judge.

Alternatives rejected: machine-learned or embedding-based ranking (not explainable, needs infrastructure and data); storing For You results (stale and extra personal data); alerts per saved search (more state and UI for the same value); sending alerts from the request path (violates ADR-0004); suppressing the address on unsubscribe (also blocks security mail).
