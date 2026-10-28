# Launch blockers and outstanding decisions — DRAFT

Status: DRAFT for owner review, written at the end of Phase 4 and updated 2026-10-28 for Phases 5, 6A, 6B, M1, M2, the D-42 rebrand and launch preparation (section A5). It lists what stops a public launch and which owner decisions are still needed, with the default the build currently uses. Nothing is deployed and none of the defaults is approved.

Sequenced by D-31 into the Phase 5 workstreams (status after the work: section A2 below) of `docs/phase5/PHASE5_REVISED_PLAN.md` (§WS7 maps each blocker to its closing work and evidence).

## A. Blockers (a launch cannot happen until each is resolved)

| # | Blocker | Why | Who | Evidence |
|---|---|---|---|---|
| B-01 | **E-mail delivery not verified** (OQ-03; Resend selected, D-34) | Confirmation and password-reset links cannot be delivered; accounts cannot be created in practice. Production sends nothing by design | Owner creates the Resend account, adds upnext.co.zw (D-42), adds the records Resend shows in DNS, sets the `UPNEXT_SMTP_*` secrets, runs `check_email_config --connect` and `--send-test`, and records the result (`docs/engineering/RESEND_INTEGRATION.md`, `EMAIL_DELIVERY_VERIFICATION.md`) | `docs/engineering/PRODUCTION_CONFIGURATION.md` §3 |
| B-02 | **Legal review of Privacy and Terms; operator identity** (OQ-09) | Both pages are drafts with bracketed gaps (operator, legal bases, rights routes, minimum age, transfers, liability, governing law). The legal framework for Zimbabwe has not been researched | Owner and a lawyer | `/privacy`, `/terms` |
| B-03 | **Contact address** (D-42: the only official address is info@upnext.co.zw) | The Contact page shows an address only when the mailbox is confirmed to receive mail; corrections and privacy requests need it | Owner confirms info@upnext.co.zw receives mail, then sets `UPNEXT_CONTACT_EMAIL` | `/contact` |
| B-04 | **Domain, TLS and cookies** (OQ-01, OQ-10) | Origin, HSTS, secure cookies, the `__Host-` prefix and proxy header trust cannot be verified without the real front. Production refuses to start without HTTPS settings | Owner; Phase 7 read-only inspection | production safeguards, P4-08 |
| B-05 | **Staff access policy** (OQ-13, OQ-16) | Who gets accounts, whether network restriction is also required, who holds the break-glass access, second administrator | Owner | `STAFF_ACCESS_RUNBOOK.md` |
| B-06 | **Owner approval of provisional defaults that shape public content** | P2-01, P2-04, P2-07 to P2-10, P3-01 to P3-08, P4-01 to P4-11 are engineering defaults | Owner | decision register |
| B-07 | **Backups, restore rehearsal, monitoring and alert routing** (OQ-11, OQ-26, OQ-27) | **Built and rehearsed, not operational.** Encrypted, tamper-refusing backups, a restore that re-applies deletions, job state and an alert catalogue exist and the backup and restore rehearsal passes in CI (section A2). Missing: an off-server storage target and key custody (no backup has ever been stored off a server), a restore measured on real infrastructure (RTO 4 hours unproven), an alert destination (alerts reach the log only, nobody is notified), error tracking and an uptime probe | Owner | `infrastructure/backup/`, `docs/engineering/BACKUP_AND_RESTORE.md`, `docs/engineering/MONITORING_AND_ALERTING.md`, CI job "Local TLS rehearsal" |
| B-08 | **Deployment path** (Phase 7) | Not started; requires read-only inspection of the shared VPS and explicit approval | Owner | roadmap |
| B-09 | **Real content and editorial staffing** | The catalogue holds only fictional demo data; no editors are assigned; category field lists are still drafts (OQ-06) | Owner | decision register |
| B-10 | **Manual accessibility audit** (OQ-11) | Automated axe checks, keyboard and reflow checks pass on every page, but there has been no screen-reader or assistive-technology test and no audit by a person | Owner, Phase 6 | `docs/phase4/PHASE4_REPORT.md` |

## A2. Status after Phase 5 (engineering work done, evidence recorded, and what still blocks)

**No blocker is closed.** Each one needs something only the owner, a lawyer, real staff or the real infrastructure can supply; the table says what now exists to receive it.

| # | Built in Phase 5 | Still required to close it (evidence needed) |
|---|---|---|
| B-01 | Provider-neutral signed bounce/complaint feed, delivery-verification record and gate, selection scorecard for Resend and Amazon SES (`EMAIL_PROVIDER_SELECTION.md`), change of e-mail built behind the gate | Resend is selected (D-34) and its webhook receiver, SMTP checks and branded templates exist; still needed: real account, domain verification, SPF/DKIM/DMARC, test mail in Gmail, Outlook and a Zimbabwean mailbox, `record_email_verification` run by a person. **Not done: no account, no DNS record, no real message sent; blocker stays open** |
| B-02 | Data inventory with a completeness test, privacy and terms drafts v2, legal review pack, rights procedures | Lawyer's review and the owner's recorded approval; operator identity; provider names; retention decision (listing counters: provisional 12 months, D-36)s |
| B-03 | Contact page and corrections route are ready to show an address | **Superseded by D-42:** the single official address is info@upnext.co.zw (the D-33 mailbox set no longer applies and no other mailbox is to be created). The owner must confirm it is monitored, then set `UPNEXT_CONTACT_EMAIL` (and the other address variables, all to that one address) |
| B-04 | Local TLS rehearsal: production-mode API behind a throwaway certificate, preflight with 0 failures, whole browser suite passing over TLS | Real domain, real certificate, real front (Phase 7) |
| B-05 | Staff runbook from Phase 4, two-step mandatory, no IP restriction (owner decision), role-change alert | Named people, a completed drill on the real setup, second administrator decision |
| B-06 | One consolidated list of provisional defaults (register P2 to P5) | Owner approval or changes, recorded |
| B-07 | Backup scripts, encrypted and authenticated, tamper refusal, restore and re-apply-deletions rehearsal (CI), job state, alert catalogue, generic alert webhook, runbooks | Off-server storage and key custody, a restore measured on real infrastructure (RTO), an alert channel with one real test alert, error tracking and uptime probe |
| B-08 | — | Phase 7 and separate written authorisation |
| B-09 | Editorial handbook, draft-only import, content-health page and separation-of-duties audit | Three named staff, approved schemas and taxonomies, 100 source-checked listings from 30 issuers entered by real staff. **Not done: no real content exists** |
| B-10 | Automated checks; manual audit plan and mobile budgets | Testers, real devices and screen readers; a report. **Not done: no manual accessibility testing has been performed** |

## A3. Phase 6B additions (D-38)
Phase 6B is implemented and **merged** into the integration branch (PR #9, merge commit `0cfae74`, 2026-10-18 23:29 UTC, owner-approved per the commit message); nothing is deployed.

No blocker is closed. B-01 additionally gates **job alerts** (nothing is sent while delivery is unverified) and B-02 additionally gates **collecting seeker profiles and alert consent in production** (privacy text, lawful basis, retention P6B-11, the consent wording `alerts-consent-v1`). B-09 still applies: For You quality cannot be judged on fictional demo listings. See `docs/phase6b/PHASE6B_REPORT.md`.

## A4. Defects found by the repository audit and fixed in M1 (2026-10-28)
No blocker is closed by this. (1) **A-01:** the unavailable states of `/profile` and `/alerts` rendered an `h3` directly under the page `h1`, and the listing page's unavailable state had no `h1`. At 320 px axe reported `heading-order` on `/profile`, which failed the jobseeker browser journey and turned the end-to-end CI job red on the Phase 6B merge commit (run 39176711994; the employer and editorial journeys were skipped in that run). Why the profile service call failed in that run was not established; the markup is now valid whether or not it fails. (2) **A-02:** the listing expiry job (`workflow.expire_due`, traceability JOB-01) was specified and tested but never scheduled, so a published listing never became `expired` in a running system; the worker now runs it every housekeeping cycle, one run at a time, and records it as the `expiry` job.

## A5. Launch preparation (2026-10-28, release candidate 06dfafe) and GO/NO-GO gates

Release candidate `06dfafe3dfc7287cd661074066e965ea14adf846` is accepted by the owner for launch preparation (six CI jobs green). **No blocker is closed by this work; nothing is deployed, no DNS or shared proxy is changed, no e-mail is sent.** PR #14 is outside this release.

| # | Prepared in launch preparation | Still external / not done |
|---|---|---|
| B-01 | `EMAIL_PROVIDER_LAUNCH_CHECKLIST.md`; Resend, DNS and verification docs re-pointed to upnext.co.zw and info@upnext.co.zw only | Resend account and domain, DNS records, real test mail, webhook, recorded verification, approval to enable sending. Can be deferred: the site can launch with e-mail off |
| B-02 | `docs/legal/OPERATOR_IDENTITY_AND_REVIEW_CHECKLIST.md` (facts I-1 to I-9, review items R-1 to R-12). No legal fact invented; review **not** done | Operator identity, lawyer's answers, recorded outcome, then removal of draft banners and enabling of profile collection |
| B-03 | Superseded by D-42 (single address) | Owner confirms info@upnext.co.zw receives mail |
| B-04 / B-08 | `PRODUCTION_DEPLOYMENT_PLAN.md`: DNS (apex only, no www, no redirect), proxy, TLS, verification, rollback | Read-only VPS and proxy inspection (OQ-10), DNS access, Phase 7 written approval |
| B-05 | unchanged | Named staff, second administrator decision |
| B-06 | `LAUNCH_DECISIONS_TRIAGE.md` separates 12 launch-critical decisions (O-1 to O-12) from enhancements | Owner decisions |
| B-07 | `infrastructure/backup/offsite.sh` (copy with read-back verification, tested), `measure-restore.sh` (JSON timing record), `BACKUP_AND_RESTORE.md` §8, alert catalogue already complete | Off-server target and credentials, key escrow, a real off-server backup, a measured restore on real infrastructure, an alert channel with one real test alert |
| B-09 | — | Real content, three named staff, approved categories (OQ-06) |
| B-10 | — | Manual accessibility audit |
| Brand | `docs/design/WORDMARK_VECTORISATION.md` | Vector wordmark from the designer, or owner acceptance of the typeset stand-in (O-5) |

### GO / NO-GO gates (a launch is GO only when every NO-GO line below is cleared)

| Gate | Cleared when | State |
|---|---|---|
| G1 Owner approval | Written Phase 7 approval and approval of provisional defaults (B-06, B-08) | NO-GO |
| G2 Legal | B-02 recorded (privacy/terms reviewed, operator identity published) | NO-GO |
| G3 Infrastructure | B-04: inspection done, DNS, TLS, proxy, V-1 to V-12 pass | NO-GO |
| G4 Resilience | B-07: off-server backup, measured restore, real alert received | NO-GO |
| G5 Access | B-05: named staff, two-step, drill | NO-GO |
| G6 Content | B-09: real approved categories and listings by real editors; a named public-report reader (O-9) | NO-GO |
| G7 Accessibility | B-10 manual audit report | NO-GO |
| G8 Contact | B-03: info@upnext.co.zw confirmed monitored | NO-GO |
| G9 E-mail | B-01 verified **or** the owner accepts launching with e-mail off (accounts cannot then be confirmed in practice; recorded decision needed) | NO-GO |
| G10 Software | Six CI jobs green on the release commit; `check_production_config` clean on the real stack | GO on the candidate (CI); production check not yet possible |

## B. Owner decisions still needed

| Decision | Current default | Recommendation |
|---|---|---|
| Staff two-step policy, network restriction, second administrator (OQ-13, OQ-16) | two-step required; no network restriction | approve two-step; decide network restriction with Phase 7 |
| Numeric limits: sessions, throttles, retention (OQ-17, P3-03, P4-06) | proposed values | approve or change; set the audit-event retention period |
| Deletion cooling-off length, completion e-mail, export of personal data (OQ-09, P4-05) | 14 days; no export | decide the period; decide whether an export is needed at launch |
| Expired and withdrawn listings: keep readable and unindexed? API opt-ins `include_expired` and `deadline_state=expired` (OQ-20, P2-01, P4-03) | readable, unindexed, opt-ins still exist | remove the opt-ins if "never in active lists" must hold for API users too |
| Category pages with their own addresses (OQ-20, P4-02) | category tabs are unindexed filters | decide once there is enough content to justify them |
| Analytics and the outbound-click KPI (OQ-19, P4-04) | Phase 6A (D-35) added anonymous per-listing counts of views and apply clicks for employers; no analytics service | decide how to measure outbound clicks without tracking people, or accept not measuring |
| Languages (OQ-18, P4-01) | English only | confirm; add Shona or Ndebele later only with owner-supplied translations |
| "For employers" link, alerts, other reference features (OQ-24) | the employer portal and its link were built in Phase 6A, alerts in Phase 6B (gated by B-01); other reference features not built | confirm exclusion of the rest for launch |
| Verification policy, duplicate rules, category schemas, taxonomies, currencies (OQ-06 to OQ-08, OQ-21, OQ-22, OQ-29) | Phase 2 defaults | approve or change before real content is entered |
| Profile, For You, match display (OQ-23) | built in Phase 6B and merged; profile collection in production waits for reviewed privacy text (B-02) | review the For You display on real content (B-09) before launch |
| Change of e-mail address | built behind the verified-delivery gate (D-31, Phase 5); unavailable until B-01 closes | confirm it is wanted |

## C. Known limitations that are not blockers
Timing of unknown-address answers is comparable, not identical; the staff site CSP still allows inline styles (Django Admin); staff pages on a phone need horizontal scrolling for wide tables; the outbox claim has no two-process concurrency test; the database-backed throttle store writes on every public read (Redis is deferred, ADR-0004); sessions created before Phase 3 are not tracked (development only); the list `total` is a count of all live listings per request (about 22 ms at 24,000 listings).
