# Implementation proposals for the launch-critical decisions — DRAFT

Status: DRAFT. **Proposals only; nothing is approved and nothing in code, schemas or published listings changes.** They build on `CATEGORY_SPECIFICATIONS.md` (findings F-1 to F-8, decisions CS-01 to CS-09) and `LAUNCH_DECISIONS_TRIAGE.md`. **No new field is defined here:** every field named already exists in the loaded v1 schemas (`catalog/schemas.py`); proposals only change whether an existing field is required, add reviewer warnings, or remove dead code.

| ID | Owner answer that unlocks it | Implementation if approved | Size / risk | Test to add |
|---|---|---|---|---|
| O-1 / CS-01 | "Approve the six v1 lists as launch lists" | Remove the "pending owner approval" marker in the six schemas' metadata and record the approval and date in the decision register. No field changes. Schemas stay version 1 | Tiny; later changes need version 2 | Existing CAT-01 updated to expect the approved marker |
| O-2 / CS-03 | "Keep the current required set" | Nothing to build | None | None |
| O-2 / CS-04 (F-6) | "Make `geographic_eligibility` required for scholarships and grants" | Create **version 2** of those two schemas where the existing `geographic_eligibility` is added to `required`; v1 stays for existing drafts; new drafts use v2; editors fix v1 drafts when next edited. Alternative (no schema change): keep optional and add a reviewer warning | Small (two schemas, one migration of schema registry rows); no data migration | Schema tests: v2 refuses a draft without it; v1 drafts still validate |
| O-3 / CS-05 | "Add warnings F-1, F-2, F-4, F-5" | Reviewer warnings in the validation layer (never blockers, never defaults): fixed-term job without duration (F-1), internship start more than 24 months out (F-2), tender site visit mandatory without a visit time and bid-security note without the flag (F-4), graduate intake year before deadline year (F-5) | Small; no schema change | One test per warning, plus "warnings never block publication" |
| O-3 / CS-06 (F-3) | "Remove the unreachable `application_fee` check" | Delete `application_fee` from the fee-key loop in `catalog/schemas.py:101`; keep `tender_fee` | Tiny; no behaviour change | Existing money tests unchanged |
| O-3 / CS-08 | "Keep USD and ZWG" | Nothing to build; record the answer; verify `ZWG` against ISO 4217 before real data | None | None |
| O-3 / CS-09 | "Confirm date-only deadlines end of day Africa/Harare" | Nothing to build (current behaviour); record | None | Existing deadline tests |
| O-4 / CS-02 + F-7 | "Approve vocabulary after practitioner check" | Align the profile's highest-qualification enum to the listing vocabulary: profile schema change + data migration mapping the four coarse values to the nearest listing value (or ask the person on next edit — **owner to choose**; guessing is not acceptable) | Medium; touches the profile and For You scoring; do only after profile collection is lawful (B-02) | Matching tests on the aligned scale; migration test |
| CS-07 | "Review after 200 live listings" | Calendar item, no work now | — | — |

## Recommended order if all are approved
1. Record O-1, O-2 and O-3 in the decision register (documentation-only commit).
2. CS-06 removal and CS-05 warnings (no schema change).
3. CS-04 as version 2 of two schemas.
4. CS-02 alignment last, and only with the profile gate (B-02) open.

## Notification and reporting items
P-NOTIF-01…04 and P-REPORT-01, 03, 04, 06, 07 can follow launch with the current safe defaults (`LAUNCH_DECISIONS_TRIAGE.md` §2–3). P-REPORT-02 (retention) and P-REPORT-05 (who reads the queue) are owner/lawyer answers; once given, retention is an environment value (`UPNEXT_RETENTION_*`) plus a documentation change, and the reader assignment is a staff-role assignment, not code.
