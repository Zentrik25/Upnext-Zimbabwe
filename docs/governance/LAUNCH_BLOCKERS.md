# Launch blockers and outstanding decisions — DRAFT

Status: DRAFT for owner review, written at the end of Phase 4. It lists what stops a public launch and which owner decisions are still needed, with the default the build currently uses. Nothing is deployed and none of the defaults is approved.

## A. Blockers (a launch cannot happen until each is resolved)

| # | Blocker | Why | Who | Evidence |
|---|---|---|---|---|
| B-01 | **No e-mail provider** (OQ-03) | Confirmation and password-reset links cannot be delivered; accounts cannot be created in practice. Production sends nothing by design | Owner chooses; then configure SPF/DKIM/DMARC, set the `UPNEXT_SMTP_*` secrets and run `check_email_config --connect` and `--send-test` | `docs/engineering/PRODUCTION_CONFIGURATION.md` §3 |
| B-02 | **Legal review of Privacy and Terms; operator identity** (OQ-09) | Both pages are drafts with bracketed gaps (operator, legal bases, rights routes, minimum age, transfers, liability, governing law). The legal framework for Zimbabwe has not been researched | Owner and a lawyer | `/privacy`, `/terms` |
| B-03 | **Contact address** | The Contact page says details are not published; corrections and privacy requests have nowhere to go | Owner sets `UPNEXT_CONTACT_EMAIL` | `/contact` |
| B-04 | **Domain, TLS and cookies** (OQ-01, OQ-10) | Origin, HSTS, secure cookies, the `__Host-` prefix and proxy header trust cannot be verified without the real front. Production refuses to start without HTTPS settings | Owner; Phase 7 read-only inspection | production safeguards, P4-08 |
| B-05 | **Staff access policy** (OQ-13, OQ-16) | Who gets accounts, whether network restriction is also required, who holds the break-glass access, second administrator | Owner | `STAFF_ACCESS_RUNBOOK.md` |
| B-06 | **Owner approval of provisional defaults that shape public content** | P2-01, P2-04, P2-07 to P2-10, P3-01 to P3-08, P4-01 to P4-11 are engineering defaults | Owner | decision register |
| B-07 | **Backups, restore rehearsal, monitoring and alert routing** (OQ-11, OQ-26, OQ-27) | Not built (Phase 6). Dead-mail and stuck-mail alerts exist as commands and logs but nobody is notified | Owner and Phase 6 | `outbox_status`, `outbox.alert` log |
| B-08 | **Deployment path** (Phase 7) | Not started; requires read-only inspection of the shared VPS and explicit approval | Owner | roadmap |
| B-09 | **Real content and editorial staffing** | The catalogue holds only fictional demo data; no editors are assigned; category field lists are still drafts (OQ-06) | Owner | decision register |
| B-10 | **Manual accessibility audit** (OQ-11) | Automated axe checks, keyboard and reflow checks pass on every page, but there has been no screen-reader or assistive-technology test and no audit by a person | Owner, Phase 6 | `docs/phase4/PHASE4_REPORT.md` |

## B. Owner decisions still needed

| Decision | Current default | Recommendation |
|---|---|---|
| Staff two-step policy, network restriction, second administrator (OQ-13, OQ-16) | two-step required; no network restriction | approve two-step; decide network restriction with Phase 7 |
| Numeric limits: sessions, throttles, retention (OQ-17, P3-03, P4-06) | proposed values | approve or change; set the audit-event retention period |
| Deletion cooling-off length, completion e-mail, export of personal data (OQ-09, P4-05) | 14 days; no export | decide the period; decide whether an export is needed at launch |
| Expired and withdrawn listings: keep readable and unindexed? API opt-ins `include_expired` and `deadline_state=expired` (OQ-20, P2-01, P4-03) | readable, unindexed, opt-ins still exist | remove the opt-ins if "never in active lists" must hold for API users too |
| Category pages with their own addresses (OQ-20, P4-02) | category tabs are unindexed filters | decide once there is enough content to justify them |
| Analytics and the outbound-click KPI (OQ-19, P4-04) | none | decide how to measure outbound clicks without tracking people, or accept not measuring |
| Languages (OQ-18, P4-01) | English only | confirm; add Shona or Ndebele later only with owner-supplied translations |
| "For employers" link, alerts, other reference features (OQ-24) | not built | confirm exclusion for launch |
| Verification policy, duplicate rules, category schemas, taxonomies, currencies (OQ-06 to OQ-08, OQ-21, OQ-22, OQ-29) | Phase 2 defaults | approve or change before real content is entered |
| Profile, For You, match display (OQ-23) | not built | decide before Phase 5 |
| Change of e-mail address | not built | confirm it is wanted |

## C. Known limitations that are not blockers
Timing of unknown-address answers is comparable, not identical; the staff site CSP still allows inline styles (Django Admin); staff pages on a phone need horizontal scrolling for wide tables; the outbox claim has no two-process concurrency test; the database-backed throttle store writes on every public read (Redis is deferred, ADR-0004); sessions created before Phase 3 are not tracked (development only); the list `total` is a count of all live listings per request (about 22 ms at 24,000 listings).
