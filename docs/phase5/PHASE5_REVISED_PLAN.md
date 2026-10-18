# Revised Phase 5 plan — launch readiness and hardening before personalisation — DRAFT

Status: DRAFT for owner review. Planning only: **no implementation has started and none is authorised until this plan is reviewed.** No production deployment is authorised; nothing here touches the VPS, Traefik/Nginx or The Granite Post. Nothing is legal advice or legal approval.

Basis: owner decision D-31 (2026-10-18) on proposal commit `4c89ab0` (CI 39066617350). It takes Section 7 of `PHASE5_PROPOSAL.md` as the sequence: launch readiness first, personalisation after.

## 0. The sequence and what moved

| Phase | Content | Change |
|---|---|---|
| **5** | **Launch readiness and hardening** (this plan): e-mail provider, privacy and terms, production security validation, backup/restore/monitoring/alerting, load and accessibility verification, real content and editorial procedures, change of e-mail address (gated) | New scope (replaces "Discovery"; absorbs the old Phase 6 hardening and the provider part of 4b) |
| **6** | **Personalisation**: optional profile and rules-v1 For You, exactly as designed in `PHASE5_PROPOSAL.md` (design approved by D-31) | Renumbered from 5; implementation **not authorised** until the Phase 5 launch gate (§9) is met and the owner approves in writing |
| **7** | Deployment: read-only VPS inspection, isolated stack, rollback; only with explicit approval | Unchanged |

`PHASE5_PROPOSAL.md` keeps its text; wherever it says "Phase 5" it now means Phase 6.

## 1. Principles for this phase

1. **Trust over features.** Nothing ships that cannot be verified: every item has evidence (a command, a test, a recorded rehearsal), not an assertion.
2. **Owner decisions are explicit inputs.** Where a decision is needed the plan gives a default and a deadline-by-milestone; the build never invents a provider, a legal fact or a number and presents it as decided.
3. **No deployment.** Everything is proven locally and in CI on the production-mode stack (including a local TLS front to exercise HSTS and secure cookies). Phase 7 does the VPS work, separately approved.
4. **Preserve design and rules.** Flat design, 4px controls (D-29), existing architecture, and editorial separation of duties (nobody approves or verifies their own submission; no workflow bypass) apply to every tool added here, including any content-import tool.
5. **Mobile-first and light.** Budgets are measured on a throttled mobile profile, not only on a desktop.

## 2. Owner inputs needed (with the default if the owner does not choose)

| # | Input | Default proposed | Needed by |
|---|---|---|---|
| I-1 | E-mail provider and sender domain (OQ-03, OQ-01) | Decide via the §3.1 scorecard | M5.1 |
| I-2 | Operator identity, contact address, legal reviewer (OQ-09, B-02, B-03) | none; pages stay drafts | M5.2 |
| I-3 | Backup target off the server, RPO and RTO (OQ-27) | RPO 24 h, RTO 4 h, daily encrypted dump | M5.4 |
| I-4 | Where errors and metrics go, who is alerted, by which channel (OQ-26) | Off-server hosted error tracking with no personal data, plus an external uptime probe; alerts to a monitored e-mail and one chat channel | M5.4 |
| I-5 | Staff policy: people and roles, network restriction, second administrator, break-glass holder (OQ-13, OQ-16) | Two-step required; no IP restriction at launch; two Administrators | M5.3 |
| I-6 | Performance SLOs and accessibility audit method (OQ-11) | §6 targets | M5.5 |
| I-7 | Editorial team (≥3 named people), launch content target, category schemas and taxonomies (OQ-06, OQ-21, OQ-22, OQ-29) | §7 targets | M5.6 |
| I-8 | Approve or change P2/P3/P4 provisional defaults (B-06) | as built | before M5.7 |

## 3. Workstreams

### WS1 Transactional e-mail provider (B-01, B-03)

**Already built (Phase 4):** `EmailSender` port, adapter registry, hardened SMTP adapter tested only against a local stub, suppression list, outbox monitoring, `check_email_config`.

**3.1 Selection (owner decides; I do not choose for them).** Scorecard for 2–3 candidates, filled from the providers' own documentation and a real test, not from memory:

| Criterion | Why it matters here |
|---|---|
| Deliverability to Gmail, Outlook and Zimbabwean ISPs and corporate domains | Most users sign up with Gmail or local ISP/work addresses; a confirmation link in spam equals a lost user |
| SMTP **and** HTTP API, TLS, per-message tags | The generic SMTP adapter works on day one; an API adapter is optional |
| Bounce and complaint feed (webhook) with signed requests | Needed for the suppression list |
| Domain authentication (SPF, DKIM, DMARC), dedicated sending identity | Required for deliverability and anti-spoofing |
| Data location, sub-processors, data-processing terms | Feeds the privacy page (transfers outside Zimbabwe, B-02) |
| Price at expected volume (low) and free-tier limits | Cost control |
| Sandbox or test mode; account-suspension policy for new senders | Avoid a launch-day block |

**Build (after the choice):**
1. Configure through existing `UPNEXT_SMTP_*` secrets; add an API adapter only if the provider's SMTP is insufficient.
2. **Bounce/complaint webhook** endpoint (`POST /api/v1/hooks/email/<provider>`): signature or shared-secret verification, replay protection, throttled, no personal data in logs; permanent bounces and complaints call `notifications.suppression.suppress`. Tests with recorded sample payloads.
3. **Delivery verification record**: a command `record_email_verification` that, after `check_email_config --connect` and a real `--send-test`, stores provider name, sender-domain configuration hash, date and the operator who ran it. It also requires the SPF, DKIM and DMARC checks to be recorded as passed (manual attestation plus a DNS lookup helper).
4. Template review for plain-language, no tracking pixels, no link shorteners, correct `Reply-To`; links built from `UPNEXT_PUBLIC_BASE_URL`.
5. Test plan from a real mailbox on each of Gmail, Outlook and one local ISP: confirmation, reset, deletion notices arrive in the inbox, links work, headers pass.

**Change of e-mail address (approved for the MVP, D-31) is built here and is gated on verified delivery:** the endpoints exist, but `requestEmailChange` answers `503 email_unavailable` (and the account panel hides the form) unless the sender is not `none` **and** a current delivery-verification record matches the live sender configuration hash. Design otherwise as in the Phase 5 proposal §4 (current password, link to the new address, notice to the old one, single-use hashed token, uniform answer for taken addresses, audited, staff two-step rules unchanged). Built last (M5.7) so that it is tested against the real provider path.

**Acceptance:** verification record present and matches the live config; inbox delivery proved on three mailbox families; a deliberately bounced test address is suppressed by the webhook; change-of-e-mail disabled when the record is absent or stale and enabled when present (automated tests for both); no secret in the repository (scan clean).

### WS2 Privacy and terms completion for owner and legal review (B-02, B-03)

Deliverables (all DRAFT, nothing claims legal approval):
1. **Data inventory** generated from the code and migrations (every personal-data field, purpose, location, retention, who can see it, processor), kept in a data-inventory document under `docs/legal/` and checked by a test that fails if a new personal-data column appears without an inventory row.
2. **Privacy notice v2**: plain language, mobile-readable; operator identity, purposes and bases (with the lawyer's input), retention table matching P4-06, processors and transfers (provider, hosting), cookies (session and CSRF only, no consent banner needed while that holds), rights and how to exercise them, deletion lifecycle (14-day cooling-off), backups and how long deleted data survives in them, security incidents, children and minimum age, changes. It includes a "not yet collected" note for the future profile and does not promise features that do not exist.
3. **Terms v2**: use of the service, listings are third-party information with a source and a verification label, no guarantee of accuracy or outcomes, no employment agency role, scam warning (applicants should never pay to apply), acceptable use, accounts, takedown and corrections, liability and governing law as bracketed items for the lawyer.
4. **Rights procedures** (runbook): access, correction, deletion, objection, and a manual data export for a person's own data (account, saved items, sessions) as a one-off staff procedure; a decision whether a self-service export is needed (OQ-09) stays with the owner.
5. **Legal review pack** for the lawyer: the questions list (applicability of Zimbabwe's data-protection and cyber legislation and any registration or licensing duty, which I have **not** researched or verified; lawful bases; retention limits; cross-border transfer rules; age; liability wording), the data inventory, the retention table and the screens.
6. Pages keep the "draft" banner and noindex until the owner records approval and the review date in the decision register; versioned text with a visible "last updated" date.

**Acceptance:** every bracketed gap is either filled by the owner or listed in the review pack; inventory test green; both pages pass axe at four widths and read well at 320 px; the drafts are marked as drafts; the owner records approval separately (this plan never marks them approved).

### WS3 Production security and configuration validation (B-04, B-05, B-06)

1. **Preflight command** `check_production_config`: the start-up refusals plus live checks (database role privileges, cookie attributes and `__Host-` prefix, HSTS, CSP and security headers on a running stack, `DEBUG` off, admin path, throttles, mail backend, secrets length and distinctness), human-readable and exit-coded; run in CI against the production-mode stack.
2. **Local TLS rehearsal:** a Compose profile with a throwaway-certificate TLS proxy in front of the stack to verify Secure/HttpOnly/SameSite cookies, HSTS, redirects and proxy-header trust for real (today these were only verified over HTTP). Local only; not a deployment.
3. **Least-privilege database roles** from `SECURITY_ARCHITECTURE.md` (`upnext_migrator`, `upnext_app`, `upnext_jobs`): implement and test or record why not; confirm `audit_event` is append-only for the application role.
4. **Dependency and image scanning** added to CI (pip-audit and npm audit already run): container image scan and SBOM; fail on high severity.
5. **Security review** of every public and account endpoint (authorisation matrix, throttles, uniform responses, error leakage, open redirects, CSRF, SSRF-free outbound calls), with a written report and a fix list; focused tests for each finding.
6. **Staff access policy and drills** (I-5): onboarding, offboarding, break-glass, lost-device recovery executed once against the local stack and recorded; second Administrator confirmation (OQ-13) implemented only if the owner decides it.
7. **Audit retention** decision and job (OQ-09), and pseudonymisation of deleted users' audit references as already built.
8. **Throttle store:** the database-backed throttle writes on every public read (known limitation); measure under load (WS5) and fix or bound it before launch.

**Acceptance:** preflight green on the production-mode stack and on the local TLS profile; zero high or critical findings open; each finding has a regression test; secret scan clean; the report lists every limitation.

### WS4 Backup, restore, monitoring and alerting (B-07)

**Backup (proposal, owner confirms I-3):**
- Nightly `pg_dump` (custom format) plus configuration inventory, encrypted with a key stored separately, written to an **off-server** target; retention 7 daily, 4 weekly, 3 monthly; failure is an alert. Point-in-time recovery (WAL archiving) is evaluated and offered only if RPO under 24 h is wanted.
- **Restore rehearsal as an automated test in CI:** dump a seeded stack, restore into a fresh container, run migrations check, compare row counts and constraint checks, start the app against it and run a smoke journey. Plus a documented manual rehearsal with the measured restore time (RTO evidence).
- The deletion lifecycle and backups: a runbook step re-applies deletions after a restore (so a restored backup does not resurrect deleted accounts); the privacy text states the backup retention.

**Monitoring and alerting (owner confirms I-4):**
- Health endpoints already exist (`/health/live`, `/health/ready`); add a `job_run` table and heartbeat for the worker, the retention job and the backup job.
- Structured JSON logs with redaction (no e-mail addresses, tokens or passwords; test asserts it), request ids, and error tracking with personal data scrubbed.
- Minimal metrics: request rate, 5xx rate, p95 latency, outbox age and dead count, database size and connections, disk, backup age, certificate expiry.
- External uptime probe on the home page and `/health/ready`.
- **Alert catalogue** with owner and channel: dead or stuck mail, worker heartbeat missing, backup failed or stale, 5xx spike, disk and database size, certificate expiry (30/7 days), repeated login failures, privileged role changes, restore performed. Each alert has a runbook entry (what it means, first action).
- Alert delivery is tested by firing each alert once in the local stack; nothing is sent to production recipients without owner-supplied targets.

**Acceptance:** an automated restore rehearsal passes in CI; a manual rehearsal is timed and recorded; every alert in the catalogue has a test that triggers it and a runbook entry; logs contain no personal data (automated scrub test); monitoring choices are recorded in the register (OQ-26, OQ-27 resolved by the owner, not by me).

### WS5 Load testing and accessibility verification (B-10)

**Load (proposal, owner confirms SLOs under I-6). Capacity of the shared VPS is unknown (OQ-10), so tests run against resource-limited containers and results are reported as relative capacity, not as a promise.**
- Tool: k6 (or a scripted equivalent if it cannot be installed here), scenarios: anonymous browse and search (80%), detail pages (10%), sign-in and saved actions (5%), sitemap and static pages (5%), plus a spike and a 60-minute soak.
- Data: the existing 24,012-listing generator, extended with realistic text for search and 50,000 accounts with saved items.
- Targets (proposed): server p95 under 300 ms for list, search and detail at 100 concurrent users on the limited containers; error rate under 0.1%; no growth in memory or connections over the soak; throttle store not the bottleneck.
- Mobile budgets: Lighthouse-style mobile run on a throttled profile (4x CPU slowdown, slow-4G) for home, list, detail and sign-in: LCP at or under 2.5 s, CLS under 0.1, total transfer for the list page under 200 KiB, script under 100 KiB gzip; budgets enforced in CI.
- Findings feed fixes (indexes, caching headers, the throttle store, count query on the list).

**Accessibility verification:**
- Automated: the existing axe suite at four widths stays a gate.
- **Manual audit script and sessions** (owner supplies testers or approves an auditor): NVDA with Firefox and Chrome, VoiceOver on iOS Safari, TalkBack on Android Chrome, keyboard only, 200% and 400% zoom, reduced motion, forced colours, on real low-end Android hardware. Journeys: find a listing, read the detail, save, register, confirm e-mail, sign in, reset password, delete account, an error state. Findings recorded with severity; high and medium fixed before launch; accessibility statement drafted for owner review.
- Verify the 4px controls and focus rings in forced-colours mode.

**Acceptance:** load report with graphs of latency, errors and resource use at each step; SLOs met or exceptions accepted in writing; mobile budgets enforced in CI; manual audit report with all high and medium issues fixed or explicitly accepted by the owner.

### WS6 Real opportunity content and editorial launch procedures (B-09)

**Prerequisites from the owner (I-7):** at least three named staff (SoD needs an author and a different approver; the Administrator is a third), approved category schemas and taxonomies, and a content target. **Proposed launch target:** at least 100 live, source-verified listings across the six categories, no category empty, at least 30 organisations or issuers as sources, with a published freshness rule (nothing listed past its stated deadline; unknown deadlines reviewed at 30 days).

Deliverables:
1. **Editorial handbook** (draft): what may be listed, source rules and acceptable sources, verification levels and methods, how to cite a source, copying and attribution rules (summaries in our own words, no wholesale copying, always a source link), **scam screening** (never list anything asking applicants to pay, unregistered recruiters, requests for ID or bank details, "too good" pay claims; checklist and an escalation path), duplicate rules, how to handle unknown deadlines and pay (shown as "not stated"), corrections and takedown with response targets.
2. **Draft-import tool** (CSV or JSON to **drafts only**): creates drafts attributed to the importing editor through the normal workflow code, validates against the category schema, reports every row, and cannot approve, verify or publish (a test asserts the tool never reaches a transition other than `create_draft`). Sources and URLs are validated as today. This saves typing without touching separation of duties.
3. **Content health dashboard** in `/staff/` (counts by status, soon-to-expire, stale unknown-deadline items, unverified items, queue age), read-only.
4. **Launch rehearsal on staging data:** purge demo data safely (`seed_demo` removal command, refuses in production), load a real corpus through the workflow with the real roles, publish, and check public pages, sitemap and structured data.
5. **Daily and weekly routines** (runbook): queue review, expiry sweep, corrections inbox, takedown handling, weekly content-health review, monthly source re-verification sample.
6. **Corrections and takedown intake** wired to the contact address (B-03) with an audit trail.

**Acceptance:** the launch target is met with data entered through the real workflow; an audit of a random 20-listing sample finds no listing without a source and no self-approved or self-verified revision (a database check proves SoD held for all); handbook reviewed by the owner; takedown rehearsed end to end in minutes; demo data absent from the launch database.

### WS7 Remaining launch blockers and acceptance (all of B-01…B-10)

| Blocker | Closed by | Evidence | Owner action |
|---|---|---|---|
| B-01 e-mail provider | WS1 | verification record, three-mailbox test, webhook test | choose provider, domain DNS |
| B-02 legal review | WS2 | review pack delivered; owner records lawyer sign-off | engage a lawyer, provide operator identity |
| B-03 contact address | WS2, WS6 | `UPNEXT_CONTACT_EMAIL` set; intake rehearsal | provide the address |
| B-04 domain, TLS, cookies | WS3 (local TLS), Phase 7 (real) | preflight on TLS profile; real domain checked in Phase 7 | decide domain |
| B-05 staff access policy | WS3 | drill record | decide policy and people |
| B-06 provisional defaults | owner review of one consolidated table | register entries | approve or change |
| B-07 backups and monitoring | WS4 | CI restore test, timed manual rehearsal, alert tests | decide target, channels, RPO/RTO |
| B-08 deployment path | Phase 7 | not in this phase | later written approval |
| B-09 real content | WS6 | corpus, SoD audit | staff, schemas, taxonomies |
| B-10 manual accessibility audit | WS5 | audit report | testers or auditor |

## 4. Milestones

| M | Content | Gate to finish |
|---|---|---|
| **M5.0** | Decisions and documents: D-31 recorded (done), consolidated provisional-defaults table, scorecards, traceability rows and planned test ids for WS1–WS7, ADR-0021, runbook skeletons | docs check, traceability generator, owner approves this plan |
| **M5.1** | E-mail provider: adapter configuration, bounce webhook, verification record, mailbox tests | WS1 acceptance (except change of e-mail) |
| **M5.2** | Privacy and terms v2, data inventory and its test, rights runbook, legal review pack | WS2 acceptance |
| **M5.3** | Security validation: preflight, local TLS profile, DB roles, scans, endpoint review, staff drills | WS3 acceptance |
| **M5.4** | Backups, restore test in CI, monitoring, alert catalogue and tests | WS4 acceptance |
| **M5.5** | Load tests and budgets, accessibility manual audit and fixes | WS5 acceptance |
| **M5.6** | Content: handbook, draft-import tool, health dashboard, launch rehearsal, real corpus | WS6 acceptance |
| **M5.7** | Change of e-mail address behind the delivery-verification gate; close-out report; launch gate review | §9 |

M5.1 to M5.4 can overlap; M5.7 needs M5.1. Items that wait on the owner (I-1 to I-8) are the critical path, not the code.

## 5. Automated tests added (summary)

Webhook signature and replay tests, suppression-on-bounce, verification-record gate on and off, change-of-e-mail token and uniform-answer tests; data-inventory completeness test; preflight in CI on the production-mode stack and TLS profile; DB-role privilege tests; restore rehearsal in CI; log-scrub test; alert-trigger tests; load and Lighthouse-budget jobs (nightly or on demand, not on every push); import-tool "drafts only" test; SoD database audit query as a test; content-health view tests; axe and the 4px-control guards stay green. Existing gates (ruff, mypy, migrations, OpenAPI, pytest with the 85% floor, web lint, types, format, tokens, unit tests, build, production-mode Playwright with strict console, traceability, secret scan) remain.

## 6. Security and privacy implications of this phase

Adds a public webhook (signed, throttled, no personal data stored beyond the keyed hash already used), an off-server backup copy of personal data (encrypted, retention defined and disclosed), error tracking and uptime probes (scrubbed, owner-approved processors listed in the privacy notice), and a bulk-import tool (drafts only, same validation, same audit). Real content means real organisations' names and contact details are stored: only business-contact data published by the source, never private individuals' data; takedown on request.

## 7. Deferred (unchanged from the proposal, plus)

Profile and For You (Phase 6, design approved); alerts and saved-search e-mails; numeric or AI matching; CV uploads; employer features; payments; public organisation pages; Shona/Ndebele; analytics and the outbound-click KPI (OQ-19); self-service data export unless the owner requires it; WebAuthn; Redis/Celery (ADR-0004; thresholds OQ-30 reviewed against the load results); mobile app.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Owner inputs arrive late | Milestones are ordered so that code work proceeds on defaults; each input has a default and a clear owner |
| New-sender reputation and spam-foldering | Warm-up plan, strict SPF/DKIM/DMARC, plain-text-first templates, small volume at start |
| Shared VPS capacity unknown (OQ-10) | Report relative capacity; Phase 7 inspects read-only before any claim |
| Thin content at launch | Content target is a gate; no launch with an empty catalogue |
| Legal review slower than engineering | Pages stay drafts; launch gate requires recorded review |
| Scam listings damage trust | Handbook screening rules, SoD, takedown rehearsal, "not verified" label |

## 9. Launch gate (what "ready to deploy" means; deployment itself still needs separate written approval)

All of: B-01 to B-07, B-09 and B-10 closed with evidence; B-06 approved in the register; preflight green; restore rehearsal passing and timed; load and accessibility reports with no unaccepted high findings; content target met through the real workflow; change of e-mail passing its gated tests; CI green on the final commit; the Phase 5 report records every limitation. B-04's real-domain part and B-08 are checked in Phase 7. Personalisation (Phase 6) starts only after this gate and written approval.

## 10. Decisions requested

1. Approve the sequence and this plan, or amend it.
2. Provide or confirm the owner inputs I-1 to I-8, in particular the e-mail provider shortlist and who the lawyer is.
3. Confirm the proposed launch content target (§WS6) and the three-person editorial minimum.
4. Confirm RPO 24 h / RTO 4 h and the alert channels as the defaults for the plan.

No implementation starts until this plan is reviewed and approved in writing.
