# Monitoring and alerting — DRAFT

Status: DRAFT (Phase 5, P5-05). Describes what the application provides and what the owner still has to decide (OQ-26). **Nothing here sends an alert to a person until the owner supplies a channel; no monitoring service has been chosen or configured, and no alert has been delivered to a real recipient.**

## 1. Architecture

| Layer | What exists | What the owner must provide |
|---|---|---|
| Probes | `/health/live` (process up), `/health/ready` (database answers, migrations applied) | An external uptime probe that calls the public home page and `/health/ready` from outside the server |
| Logs | Structured JSON on stdout with request id; passwords, tokens, cookies and e-mail addresses are redacted (test SEC-09 and the alert tests) | Where logs are kept off the server and for how long (also the only durable record of completed deletions, see BACKUP_AND_RESTORE §5) |
| Job state | `core_jobrun`: one row per job (`worker`, `housekeeping`, `backup`, `restore`) with last start, finish, last success, status, counters | — |
| Alert catalogue | `core/alerts.py` evaluated every housekeeping cycle by the worker and on demand by `manage.py check_alerts [--notify]` (exit 1 while anything fires) | A destination for alerts |
| Delivery | Every alert is logged as `alert.fired`. If `UPNEXT_ALERT_WEBHOOK_URL` is set, new alerts are POSTed there as `{"service":"upnext","alerts":[{code,severity,message,runbook}]}` (https required in production), repeated at most every `UPNEXT_ALERT_REPEAT_HOURS` (6) while they persist | A webhook-capable channel (chat tool, incident service) or an external collector that reads the log lines |
| Error tracking and metrics | Not built (OQ-26 open). Proposed: hosted error tracking with personal data scrubbed, plus request-rate, 5xx-rate and latency from the proxy or access logs | Choice of provider and hosting location, which also feeds the privacy notice |

## 2. Alert catalogue

| Code | Severity | Fires when | Runbook |
|---|---|---|---|
| `mail.dead` | critical | any outbox message is dead | §3 mail |
| `mail.stuck` | critical | oldest waiting message older than 10 minutes | §3 mail |
| `job.worker_stale` / `_missing` / `_failed` | critical | no worker cycle for 120 s, never recorded (when listed in `UPNEXT_ALERTS_EXPECT_JOBS`), or failed | §4 worker |
| `job.housekeeping_stale` / `_missing` / `_failed` | critical | no deletion/retention run for 15 minutes, never recorded, or failed | §4 worker |
| `backup.never_ok` / `backup.stale` / `backup.failed` | critical | with `UPNEXT_BACKUP_EXPECTED=1`: no successful backup, last success older than `UPNEXT_BACKUP_MAX_AGE_HOURS` (26), or last run failed | §5 backup |
| `backup.local_only` | warning | last backup was not copied off the server | §5 backup |
| `restore.performed` | warning | a restore was recorded in the last 24 hours | §6 restore |
| `auth.login_failures` | warning | 50 or more failed sign-ins in 15 minutes (`UPNEXT_ALERT_LOGIN_FAILURES`) | §7 auth |
| `auth.mfa_failures` | critical | 5 or more failed staff second-step checks in 15 minutes (`UPNEXT_ALERT_MFA_FAILURES`) | §7 auth |
| `staff.role_changed` | warning | a staff role was granted or revoked in 24 hours | §8 staff |
| `disk.low` | critical | a path in `UPNEXT_ALERT_DISK_PATHS` is at least `UPNEXT_ALERT_DISK_PERCENT` (85) full | §9 capacity |
| `db.size` | warning | database at least `UPNEXT_ALERT_DB_BYTES` (off until real capacity is known, OQ-10) | §9 capacity |
| `cert.expiring` / `cert.unreadable` | warning at 30 days, critical at 7 days or unreadable | `UPNEXT_ALERT_CERT_HOST=host:port` is set | §10 certificate |

Not yet covered, and why: 5xx-rate and latency alerts need metrics from the front or an external collector (OQ-26); dead-man's-switch for the whole server needs the external probe.

## 3. mail
`manage.py outbox_status` shows counts and the oldest waiting age. Dead: read the last error in the Administrator outbox page (`/staff/`, addresses masked), fix the cause (provider credentials, domain authentication, suppression), then retry from the same page (audited). Stuck with the worker healthy: check the provider status and `check_email_config --connect`.

## 4. worker
Check the container health, `docker logs`, then `manage.py run_worker --once`. A failed housekeeping run raises in the log; deletion and retention are idempotent and safe to repeat.

## 5. backup
See BACKUP_AND_RESTORE.md. A stale or failed backup means the 24-hour RPO is not being met: run `backup.sh` by hand and read its output.

## 6. restore
A restore changes history. Confirm who performed it and why, then follow BACKUP_AND_RESTORE §4 to the end (privileges, deletions re-applied, verification).

## 7. auth
Failed sign-ins: check whether one address or many (credential stuffing); the throttle already limits per address and IP. Failed staff second steps: contact the staff member; if they did not cause it, treat the password as compromised, reset it and use `reset_staff_mfa` after verifying identity (STAFF_ACCESS_RUNBOOK).

## 8. staff
Confirm the change matches an approved request. Unexpected: revoke the role (`manage_staff_role`), review the audit log for what the account did, and follow the offboarding steps.

## 9. capacity
Free space or grow the volume before the database stops accepting writes; check backup retention and log retention first.

## 10. certificate
Renew through the owner's certificate process. Expiry alerts need the real front's address, which is a Phase 7 input.

## 11. How this was tested
Unit tests exercise every alert and the debouncing with a fake clock (`tests/test_operations.py`); the webhook path is tested against a stub opener only. **No test sent anything to a real channel.** Acceptance of the monitoring architecture needs the owner's channel and one real test alert recorded.

## Addendum (D-34): Resend webhook

Watch the `email.webhook.resend` log events (counts and event types only) and the suppression count. A sudden rise in permanent bounces or any complaint should be reviewed the same day. A 401 burst on `/api/v1/hooks/email/resend` means a wrong secret or clock drift; 404 means the secret is not set. Runbook for a leaked key: revoke it in Resend, create a new restricted key, update `UPNEXT_SMTP_PASSWORD`, restart the worker.
