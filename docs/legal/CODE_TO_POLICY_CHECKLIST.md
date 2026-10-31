# Code-to-policy accuracy checklist

Status: verified against the repository at the commit of this change (2026-10-29). Each public statement is traced to code or configuration. Where a figure is a setting it is also asserted by `apps/web/tests/unit/legal.test.tsx` so a later change to the code fails the test until the policy is updated.

## Privacy Policy

| Statement | Evidence | Verified |
|---|---|---|
| No advertising, tracking or analytics cookies or service | `config/settings/base.py` sets only `upnext_sid` and `upnext_csrf`; no analytics dependency in `apps/web/package.json`; D-35 | yes |
| Cookie names, flags and lifetimes (HttpOnly, Secure, SameSite=Lax; jobseeker 7 days idle, 30 days absolute; staff 30 minutes idle, 8 hours) | `base.py` lines for `SESSION_COOKIE_*`, `UPNEXT_SEEKER_*`, `UPNEXT_STAFF_*` | yes (test) |
| Theme choice stored in local storage under `upnext-theme`, never sent | `components/layout/theme-toggle.tsx`, `app/layout.tsx` script | yes |
| Daily per-listing view and apply-click counts, no identifier, kept about twelve months | `employers.ListingDailyStat`, `UPNEXT_RETENTION_LISTING_STATS_DAYS=365`, `accounts/retention.py` | yes (test) |
| Account data, password stored only as a one-way hash | `accounts.User`, Django password hashers | yes |
| Session records hold a shortened network prefix and browser family | `accounts.UserSession` (`ip_prefix`, `user_agent_summary`); DATA_INVENTORY A | yes |
| Failed sign-ins stored as one-way hashes | `core/admin_login.py`, throttles with keyed hashes (DATA_INVENTORY A) | yes |
| Optional profile fields and fixed-list choices, no free text, visible only to the person | `profiles.SeekerProfile`; DATA_INVENTORY A and A2; no employer endpoint | yes |
| "For you" is rules-based, explained per listing, computed on request and not stored; no AI | `profiles/foryou.py` (`MODEL_VERSION = "rules-v1"`), DATA_INVENTORY A2 | yes |
| Alerts are opt-in with a separate ticked consent, confirmed e-mail required, daily or weekly, at most ten listings, one-click unsubscribe, consent time and wording version kept | `alerts/service.py` (`email_not_verified`, `MAX_PER_DIGEST = 10`), `alerts/models.py` (`consented_at`, `consent_wording_version`), `alerts/messages.py` (unsubscribe URL, RFC 8058 header), `components/seeker/alert-form.tsx` | yes |
| Alerts are never switched on by registration or by accepting the Terms | register form has no alert field; the only route is `alert-form.tsx` with an unticked consent box | yes (e2e `legal.spec.ts`) |
| No alert is sent while e-mail delivery is unverified | `alerts/service.py` `run_due` returns `delivery_unverified` | yes; the policy says sending starts "only once e-mail sending has been switched on and tested" |
| Delivered list of alerts kept 30 days | `alerts/service.py` `LEDGER_DAYS = 30` | yes (test) |
| Employer notices (claim, listing submitted, published, returned, closing soon) | D-41, `EMPLOYER_NOTIFICATIONS.md` | yes |
| Permanently refused addresses stored only as keyed hashes | `notifications/suppression.py` | yes |
| E-mails contain no tracking images (D-55: only the identical own-origin logo and, for verification, one illustration; no per-recipient URL, query string or 1×1 image) | `notifications/emailkit.py`, `tests/test_email_design.py` | yes |
| Resend is the selected delivery provider; delivery not claimed verified | D-34; B-01 open | yes |
| Hosting on a server we administer; encrypted backups, possibly with a separate storage provider | `compose.production.yaml`, `backup.sh`, `offsite.sh`; no provider named because none is chosen | yes (no provider named) |
| Security measures (HTTPS/HSTS, rate limits, HttpOnly cookies, staff two-step, short staff sessions, audit record, no self-approval, least-privilege DB role, redacted logs, encrypted backups) | `PRODUCTION_CONFIGURATION.md` §1 and §5, `core/logging.py`, `provision_db_roles`, D-18/D-22 | yes |
| Retention table: tokens 7 days; sent outbox address 30 days; dead 90; revoked sessions 30; report contact 30 days after closing | `base.py` `UPNEXT_RETENTION_*`; `accounts/retention.py`; `reports/services.py` | yes (test) |
| No fixed period for closed reports and notes, audit and security records, employer claim decisions, server logs | DATA_INVENTORY (OQ-09 open); compose `json-file` log rotation by size only | yes (honestly stated as not fixed) |
| Backups: latest 7 daily, 4 weekly, 3 monthly; deleted data can persist up to about three months | `infrastructure/backup/prune.sh` defaults | yes (test) |
| Account deletion: password asked, 14-day wait, cancel any time, what is deleted and what remains, address released, completion e-mail, staff roles must be removed first, completed deletions re-applied after a restore | `accounts/deletion.py`, `UPNEXT_DELETION_COOLING_OFF_DAYS=14`, `RIGHTS_PROCEDURES.md`, `BACKUP_AND_RESTORE.md` §5 | yes (test) |
| Access to a copy is manual; no self-service export | RIGHTS_PROCEDURES.md "Access to a copy"; D-38 P6B-12 | yes |
| Reports: reason, text up to 2,000 characters, optional evidence link and e-mail; no IP or browser stored; one-way repeat code cleared after closing | `reports` app, DATA_INVENTORY B3 | yes |
| Accounts for people 18 and over | **owner/legal default, not enforced in code** | policy statement; the registration form does not ask for age. Listed as an open item |
| No employer access to jobseeker profiles, no CV uploads, no payments | D-35 scope; no such endpoints | yes |

## Terms of Service

| Statement | Evidence | Verified |
|---|---|---|
| Listings are reviewed by an editor other than the preparer; no self-approval; material changes need fresh approval | D-18, D-22, `EDITORIAL_WORKFLOW.md`, tests SC-* | yes |
| Employers claim an organisation and staff review; verification is a labelled check | Phase 6A (D-35), `employers` app | yes |
| UPNEXT does not receive applications; apply links lead off-site | PRD scope; listing detail apply link | yes |
| No fees, subscriptions, payments, candidate documents or employer search of profiles | CLAUDE.md "Not authorised"; code | yes |
| Report this opportunity is open to everyone and never removes a listing automatically | `PUBLIC_REPORTING.md` | yes |
| Alerts are never switched on by the Terms | see above | yes |
| Governing law and courts of Zimbabwe; liability limits | **legal drafting, not code** | for adviser review |

## What could not be verified from code
Operator registered address, registration number, licence status, DPO; hosting provider and location; backup provider; e-mail delivery (not live); response-time commitments; the support@ mailbox being monitored. See `LEGAL_APPROVAL_CHECKLIST.md`.
