# Phase 6B — seeker profile, For You, saved opportunities and e-mail alerts: readiness plan — DRAFT

Status: DRAFT. **Preparation only (D-37).** No Phase 6B code, migration, endpoint or page exists. Implementation starts only on the owner's separate written go-ahead. Nothing here is legal advice or an approval. No deployment, DNS change, VPS access or change to The Granite Post is part of it. **No e-mail is sent: alerts stay off until delivery is verified (B-01, B-03).**

## 1. Scope

| # | Capability | Reuses | New |
|---|---|---|---|
| 1 | Optional seeker profile (D-31 shape: qualification level, experience level, work arrangements, up to 6 categories, 10 sectors, 10 locations, 30 skills, 5 fields of study; every step skippable) | accounts (sessions, CSRF, deletion), taxonomy tables | `profiles` app, `GET/PATCH/DELETE /me/profile`, `/profile` page |
| 2 | Rules-based For You (`rules-v1`, explainable, no numeric score) | `visible_versions` (only public listings), search filters, `OpportunityRow` | `GET /discovery/for-you`, `/for-you` page |
| 3 | Saved opportunities | Already built (Phase 3) | Only a link from For You and the profile; no change to the model |
| 4 | E-mail alerts (saved-search digest and "new matching listings") | Outbox, templates, worker, suppression list, `delivery_verified()` gate, Resend adapter and webhook | `alerts` tables, consent, unsubscribe, digest builder, `EmailKind.JOB_ALERT` |

Public browsing and search remain fully available without an account; nothing in 6B puts content behind registration.

## 2. Rules-v1 (approved design, D-31, unchanged)

Signals: category, location or remote, sector, skills, experience level, work arrangement. A listing appears only with **at least one positive signal**; missing data never excludes; fields that were not compared are shown as "not compared"; qualification level is **not compared**; ordering is matched signals, then closing date, then id; an empty profile falls back to the newest list. Copy never says "you qualify", "eligible" or "guaranteed" (banned-phrase test). Ranking uses only public listing fields; no inference from behaviour.

## 3. Alerts: what must be true before anything is sent

1. `delivery_verified()` is true (B-01 closed by the owner after a real, recorded Resend verification). While false the alert worker does nothing and the settings page says alerts are unavailable; tests assert zero outbox rows.
2. **Consent:** alerts are opt-in per seeker and per saved search; double opt-in by a confirmation e-mail that is a security-class message and is itself gated; consent records hold the time, wording version and channel. No pre-ticked box.
3. **Unsubscribe:** every alert has a one-click link (no sign-in) and `List-Unsubscribe` plus `List-Unsubscribe-Post` headers; unsubscribing writes the existing suppression list for the alert kind only; account deletion removes alerts and consent records.
4. **Frequency caps:** at most one digest per day and a maximum number of listings per digest; no alert when nothing new matches; digest built from public listings only.
5. Alert e-mails are a separate template and kind, never mixed with security mail; bounces and complaints from the Resend webhook suppress the address.
6. Privacy text and data inventory list the new data before collection (B-02). The lawyer decides the lawful basis and retention (profile: until deletion or edit; alert consent: while active plus a proof period).

## 4. Privacy delta (to enter the data inventory when built)

Profile tables (one row per account, arrays of taxonomy ids and enums, no free text) deleted with the account; not registered in Django Admin; no staff role can read them; audit records that a change happened, not its content; For You is computed on request, not stored; alert tables hold the saved search, frequency, consent and last-sent time only. Profile collection is not switched on until the reviewed privacy text exists.

## 5. Milestones (each a small reviewable commit set with tests)

| M | Content | Gate |
|---|---|---|
| M0 | ADR-0023 (profile, matching, alerts), threat model, traceability rows, OpenAPI draft | owner go-ahead |
| M1 | `profiles` models, migration, API, deletion hook, data-inventory test, no admin registration test | pytest, migrations, spectacular |
| M2 | `rules-v1` engine with explanations, `GET /discovery/for-you`, banned-phrase and no-exclusion tests, performance check with synthetic data | pytest, budget |
| M3 | `/profile` and `/for-you` pages, skippable steps, keyboard and axe checks at 320/390/768/1440 | Vitest, Playwright, axe |
| M4 | Alert preferences and consent, digest builder, unsubscribe endpoints, **gate test: nothing queued while `delivery_verified()` is false** | pytest |
| M5 | Fake-adapter end-to-end rehearsal only; documents, report, CI | CI green; no live send |

## 6. Blockers and open questions for the owner

- B-01/B-03 (Resend delivery verification) block any alert send; B-02 (reviewed privacy text) blocks profile collection; OQ-23 resolved by D-31; OQ-24 (alerts widget) is superseded by this scope once the go-ahead is given.
- Decide: alert frequency options (daily only, or also weekly), cap per digest, whether alerts follow saved searches or the profile, and the retention of consent proof.
- Phase 6B does not add employer features, payments, AI matching or applicant tracking.

## 7. What I checked in the existing code for reuse

Sessions and CSRF (`accounts`), `SavedOpportunity`, the public list and filter API, the outbox with `EmailKind` and versioned templates, the suppression list, the delivery gate and the Resend webhook. None needs a change to start M1.
