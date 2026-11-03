# Launch-critical decisions versus enhancements — DRAFT

Status: DRAFT proposal for the owner. **Nothing is decided here; proposals are not approvals.** Recommended answers are copied from the source documents. "Launch-critical" means launching without the decision would publish something unsafe, unlawful or misleading, or cannot be built safely without it. "Can follow launch" means the current behaviour is safe and documented, and the item is a refinement.

## 1. Launch-critical (owner decision needed before GO)

| ID | Decision | Why it gates launch | Recommended (proposal) |
|---|---|---|---|
| O-1 | **OQ-06 / CS-01** approve the six v1 category field lists as launch lists | Schemas are "pending owner approval"; a change after real content exists needs a new version and re-review | Approve as they are |
| O-2 | **CS-03** required fields; **CS-04** require `geographic_eligibility` for scholarships and grants | Decides what editors can publish; changing later invalidates existing drafts | Keep current set; make eligibility required for both |
| O-3 | **CS-08** allowed currencies (code only accepts `USD`, `ZWG`) and **CS-09** date-only deadlines at end of day Africa/Harare | Wrong currency/deadline on a listing misleads seekers | Keep USD/ZWG (verify `ZWG` against ISO 4217); confirm deadline rule |
| O-4 | **CS-02** qualification vocabulary (practitioner check) | Used by profile matching (For You) and listings | Approve after the practitioner check; may ship with the current list if profile collection stays off |
| O-5 | Accept the **typeset wordmark stand-in** for launch, or wait for vectors | Brand quality, not safety (`WORDMARK_VECTORISATION.md`) | Owner's call |
| O-6 | **P-REPORT-02** retention of closed public reports (provisional 30 days for contact e-mail and repeat hash; rest undecided, OQ-09) | Personal data; part of B-02 | Decide with the lawyer |
| O-7 | **B-07** off-server backup target, region, key escrow | No backup off the server = no GO | See `BACKUP_AND_RESTORE.md` §8.1 |
| O-8 | **OQ-26 / B-07** alert destination (a channel someone reads), and who is on call | An alert nobody receives is not monitoring | Any webhook-capable channel |
| O-9 | **P-REPORT-05** who reads the public-report queue and how fast | Public reports exist from day one; an unattended safety channel is a risk | Name an owner; a target (e.g. next working day) |
| O-10 | **B-05** staff access policy (who holds which role, two-step, offboarding) | Needed before any real staff account | Per `STAFF_ACCESS_RUNBOOK.md` |
| O-11 | **B-06** owner approval of the provisional defaults listed in `LAUNCH_BLOCKERS.md` §B | Defaults are engineering proposals only | Review and approve or change |
| O-12 | **B-09** real content and editorial staffing | Catalogue holds only fictional demo data | Owner action |

## 2. Notifications

| ID | Question | Launch status |
|---|---|---|
| P-NOTIF-01 take-downs/withdrawals not notified to employer | **Can follow launch.** Default (no notice) is the safe one; sensitive reasons are not e-mailed |
| P-NOTIF-02 no opt-out screen for service messages | Can follow launch; counsel to confirm (R-9) that these are service messages |
| P-NOTIF-03 seven-day reminder lead time | Can follow launch (configurable) |
| P-NOTIF-04 no back-fill of events missed while delivery is unverified | Can follow launch; recomputed reminders cover the useful case |
| Employer notifications themselves | **Conditional on B-01**; they do nothing until delivery is verified. Not a launch requirement |
| Seeker job alerts (Phase 6B) | **Stay off at launch.** Need B-01 verified, B-02 privacy text and a separate owner approval. Enhancement |
| Change of e-mail address | Off until B-01 (already approved for the MVP on that condition) |

## 3. Public reporting

| ID | Question | Launch status |
|---|---|---|
| P-REPORT-01 no e-mail acknowledgement to reporter | Can follow launch (safe default; needs B-01 anyway) |
| P-REPORT-03 rate limits 5/h per client, 30/day per listing | Can follow launch; review with traffic |
| P-REPORT-04 employer not told of a report | Can follow launch |
| P-REPORT-05 response times / no alerting on unattended reports | **Launch-critical in part** (O-9: a named reader). Time-based alerting can follow |
| P-REPORT-06 reports about one listing not auto-closed together | Can follow launch |
| P-REPORT-07 no CAPTCHA | Can follow launch; add if abuse is seen |
| P-REPORT-02 retention | **Launch-critical** (O-6) |

## 4. Categories (CS-xx)

Launch-critical: CS-01, CS-03, CS-04, CS-08, CS-09 (O-1 to O-3). CS-02 as O-4. **Can follow launch:** CS-05 (reviewer warnings; warnings only), CS-06 (remove unreachable `application_fee` check; no behaviour change), CS-07 (tighten bounds after the first 200 live listings).

## 5. Explicitly not authorised and not for launch

AI matching; native applications, CV upload, employer candidate search and payments; monitoring beyond the alert catalogue (error tracking/metrics, OQ-26 provider); 5xx-rate and latency alerts; any extra hostname or redirect; PR #14 (kept outside this release).
