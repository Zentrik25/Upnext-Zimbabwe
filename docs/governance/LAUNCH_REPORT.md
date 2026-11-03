# UPNEXT Careers — consolidated launch report and GO/NO-GO — DRAFT

Status: DRAFT, 2026-10-28. Official configuration: brand UPNEXT Careers; origin https://upnext.co.zw (no other host, no `www`, no redirect); mailbox info@upnext.co.zw only; Stripe-inspired interface; flat black-and-white UN monogram. PR #14 is outside launch scope. **Nothing is deployed, no DNS or shared proxy is changed, no production account exists, no e-mail has been sent.** No legal approval is claimed. Every statement of a check below names where it ran.

## 1. Release candidate
Integration branch `claude/new-session-t9v0fd` at `06dfafe` (M1, M2, rebrand; six CI jobs green) plus PR #17 (launch preparation: tested backup/restore/off-server scripts, production Compose project, deployment scripts, checklists, D-43 decisions, this report). CI evidence for PR #17 is recorded in the PR.

## 2. What exists now (built and tested without a VPS)
| Area | Artifact | Tested where |
|---|---|---|
| Production stack | `infrastructure/compose/compose.production.yaml`, `nginx.production.conf.template`, optional `compose.production.edge.yaml`; project `upnext-prod`, isolated named networks/volumes, loopback-only port, no default secrets, e-mail backend `none` | 30 pytest cases (static, incl. Django production settings accept the file's environment); CI job `production-stack` boots it with throwaway values on a CI runner (release migration, least-privilege roles, host handling, headers, preflight, verify script, backup job) |
| Deployment | `infrastructure/deploy/`: `inspect-vps.sh` (read-only), `release.sh`, `rollback.sh` (both refuse without `UPNEXT_DEPLOY_CONFIRM=upnext.co.zw`), `verify.sh`, `backup-job.sh` + systemd timer/service | guards and syntax by pytest; `verify.sh` and `backup-job.sh` by the CI production-stack job against the loopback proxy. `release.sh` and `rollback.sh` have **not** been executed end to end anywhere |
| Backups | `backup.sh`, `restore.sh` (drops a partial database on failure), `measure-restore.sh` (timeout, JSON record), `offsite.sh` (verified copy, no credential leaks), backup image with rclone/rsync | script tests with stub PostgreSQL clients and real openssl; CI TLS job runs the backup/restore rehearsal; production-stack job runs the backup container. rclone/rsync paths: stub tests only |
| Monitoring | alert catalogue incl. backup freshness, `UPNEXT_ALERT_WEBHOOK_URL` | unit tests; **no real alert delivered** |
| E-mail | outbox, Resend adapter, signed webhook, delivery-verification gate | unit tests; **nothing sent, B-01 open** |
| Decisions | D-43 in the decision register; adoption of documented proposals | docs gate |
| Docs | domain/DNS/Resend/production docs corrected to upnext.co.zw and info@upnext.co.zw only | `check_docs` |

## 3. Decisions taken (D-43; conservative, documented, not legal approvals)
Category lists adopted as launch lists unchanged; required fields unchanged; `geographic_eligibility` optional with a reviewer rule; USD/ZWG only; date-only deadlines Africa/Harare; dead `application_fee` check removed; reviewer warnings, qualification-vocabulary alignment and bounds review follow launch; notification and reporting defaults kept; closed-report contact data 30 days; public-report queue read by named staff, next working day; provisional defaults adopted; typeset wordmark ships until vectors arrive; seeker alerts and change of e-mail stay off until B-01.

## 4. Remaining external blockers (cannot be completed by engineering)
| # | Blocker | Needs | Evidence that closes it |
|---|---|---|---|
| B-02 | Legal operator identity and review | operator facts I-1…I-9, a lawyer's answers L-1…L-12 | outcome recorded in the decision register; draft banners and `noindex` removed |
| B-01 | E-mail delivery | Resend account/domain, DNS records, real mailboxes, owner approval to send | `EMAIL_DELIVERY_VERIFICATION.md` items 1–9 and a recorded verification (**optional for launch day if the owner accepts e-mail off**) |
| B-03 | info@upnext.co.zw monitored | owner confirmation that the mailbox receives and is read | confirmation recorded |
| B-04/B-08 | Domain, TLS, proxy, deployment | read-only VPS/proxy inspection (`inspect-vps.sh`), `UPNEXT_EDGE_NETWORK`/`UPNEXT_EDGE_CIDR`, DNS access, final deployment authorisation | verify.sh all PASS on https://upnext.co.zw; `check_production_config` clean on the real stack |
| B-07 | Off-server backup, measured restore, alert channel | storage target/credentials, key escrow, an alert channel | one off-server backup, one `measure-restore.sh` JSON from another machine, one real alert |
| B-05 | Staff accounts | named people, second administrator | created on the real stack at onboarding; two-step enrolled |
| B-09 | Real content | editors and sourced listings (no unverified job is published) | 100 source-checked listings from 30 issuers |
| B-10 | Manual accessibility audit | testers with assistive technology | report |

## 5. Gates
| Gate | State |
|---|---|
| G10 Software (CI green on the release commit) | see PR #17 checks; GO when every job is green |
| G2 Legal (B-02) | **NO-GO** — external |
| G3 Infrastructure (B-04/B-08) | **NO-GO** — external; scripts ready |
| G4 Resilience (B-07) | **NO-GO** — external; tooling ready |
| G5 Access (B-05) | **NO-GO** — onboarding after deployment |
| G6 Content (B-09) | **NO-GO** — no real, verified content |
| G7 Accessibility (B-10) | **NO-GO** — external |
| G8 Contact (B-03) | **NO-GO** — owner confirmation |
| G9 E-mail (B-01) | **NO-GO** unless the owner accepts launching with e-mail off (accounts then cannot be confirmed) |
| G1 Final public deployment authorisation | **NOT GIVEN** |

## 6. Verdict
**Engineering: GO for a release candidate.** **Public launch: NO-GO** until the external items in section 4 are supplied and the final deployment authorisation is given. The sequence for the day: `inspect-vps.sh` → add the edge route (reviewed change to the shared proxy, additive only) and `UPNEXT_EDGE_*` values → `release.sh` → DNS apex record → `verify.sh` → `check_production_config --url https://upnext.co.zw` → backup job and first alert → staff onboarding.
