# Backup and restore — DRAFT

Status: DRAFT (Phase 5, P5-04). RPO 24 hours and RTO 4 hours are the owner's targets (D-32) **and remain unproven until a restore is measured on the real target with real data volumes**. The repository provides scripts and a rehearsal; it does not provide a storage target, and no backup has been stored off a server.

## 1. What is backed up
The PostgreSQL database (all accounts, listings, editorial history, audit log, outbox). Not included: secrets and environment files (kept separately by the owner), application images (rebuilt from the repository), logs (kept off the server, and the record of completed deletions, §5), uploaded files (none exist).

## 2. Backup
`infrastructure/backup/backup.sh`, run where `pg_dump` and `openssl` exist (the PostgreSQL image has both), as the **read-only** database role: custom-format dump, encrypted with AES-256-CBC (PBKDF2, 600,000 iterations) using a key file of at least 32 random bytes **kept apart from the backup**, a keyed SHA-256 MAC beside it (a changed file is refused before anything is restored), then the owner's off-server copy command if `UPNEXT_BACKUP_UPLOAD_CMD` is set. Without it the result is recorded as `offsite=no` and the `backup.local_only` alert fires: **a local file is not protection against losing the server.** `prune.sh` keeps 7 daily, 4 weekly and 3 monthly files. The outcome is written to `core_jobrun` (`record_job backup`) so alerts can see it.

Owner inputs: the off-server target and its credentials, where the key is stored and who can read it, and the schedule (proposed: nightly, off-peak). Pick an authenticated-encryption tool (for example `age`) instead of OpenSSL CBC plus MAC if the owner prefers; the interface stays the same.

## 3. Retention and personal data
Backups hold personal data for as long as they are kept: up to about 3 months of monthly files under the default retention. The privacy notice must say this and how deleted data ages out of backups (OQ-09, B-02). Backups are encrypted and access to the key is limited to named people.

## 4. Restore (new database only; never over a live one)
1. Stop the application (or restore beside it).
2. `restore.sh BACKUP.dump.enc TARGET_DB` as an owner-capable role: verifies the MAC, decrypts, restores with `pg_restore --no-owner --no-acl --exit-on-error` into a **new** database, prints elapsed seconds.
3. `manage.py provision_db_roles` against the new database (privileges are not part of the dump).
4. Re-apply deletions completed after the backup (§5).
5. `manage.py restore_check --expect SOURCE.json --smoke` (row counts, triggers and indexes equal to the source when one exists, no pending migrations, readiness and public read paths answer).
6. Point the application at the restored database, start it, run `check_alerts`, record `record_job restore`.

## 5. Deletions and restores
A backup older than a deletion would bring a deleted person back. The worker logs `account.deletion_completed` (opaque user id, no personal data) for every completed deletion. Keep those log lines off the database for at least as long as the longest backup retention, and after any restore run `manage.py reapply_deletions LOGFILE` (JSON log lines or a file of ids): each account is deleted exactly as in the normal lifecycle, without a second e-mail, and audited as `account.deletion_reapplied`. Staff accounts are skipped.

## 6. Rehearsal (what has actually been run)
`infrastructure/backup/rehearse.sh` runs steps 1 to 5 on the local TLS stack: source description, encrypted backup as the read-only role, a tamper check (a one-byte change is refused), restore into a new database, privileges, equality of counts, triggers and indexes with the source, application read paths as the application role, a re-apply run. It is also a CI job. The measured times and the data volume of each run are recorded in `docs/phase5/acceptance/`. **They prove the scripts and the procedure on a laptop-sized dataset; they are not evidence of the RTO on the production server or of an off-server target.**

## 7. Still required before launch (B-07)
An off-server target and a recorded off-server restore on the real infrastructure with timing; the owner's decision on the key custodian and schedule; log retention for the deletion ledger; a quarterly rehearsal calendar.

## 8. Off-server copy and measured restore (launch preparation, B-07) — DRAFT

Status: DRAFT. **Prepared and tested without any external account. No off-server target exists, no backup has left a server, no measured restore on real infrastructure has been done, and B-07 stays open.**

### 8.1 Off-server copy

`infrastructure/backup/offsite.sh` is the owner's `UPNEXT_BACKUP_UPLOAD_CMD`. It chooses no provider; the owner picks the target (decision O-7, `LAUNCH_DECISIONS_TRIAGE.md`).

```
UPNEXT_BACKUP_UPLOAD_CMD='bash /tmp/backup/offsite.sh "$FILE"'
UPNEXT_OFFSITE_KIND=dir|rsync|rclone
UPNEXT_OFFSITE_TARGET=<mounted path | user@host:/path/ | remote:path>
```

The script copies the file, reads it back from the target and compares its SHA-256 with the local file. A mismatch, an absent target or an unknown kind exits non-zero, so `backup.sh` fails and records `failed`; `offsite=yes` is therefore never reported on trust. Backups are already AES-256 encrypted with a key that is kept apart (section 2), so the target sees only ciphertext plus a keyed MAC; the key must be held in a second place that is **not** the same server or the same storage account. Tested in `apps/api/tests/test_backup_offsite.py` (verified copy, no leftover partial file, missing target, unconfigured/unknown kind). The `rsync` and `rclone` branches are **not** exercised by any test: they need a real target.

Target requirements to decide before launch: a location on different infrastructure from the VPS; credentials limited to write/list on that bucket or path only (no delete or overwrite, or object-lock/versioning on, so a compromised server cannot erase its own backups); region (cross-border transfer is legal question L-6); cost; who holds the credentials; who holds the key copy.

### 8.2 Measured restore

`infrastructure/backup/measure-restore.sh BACKUP.dump.enc TARGET_DB REPORT.json` wraps `restore.sh` and writes one JSON record: time, source (`UPNEXT_RESTORE_SOURCE=offsite` when the file was first fetched from the target), backup size, public table count, and whether the time is within `UPNEXT_RTO_SECONDS` (default 14400, the 4-hour RTO). Procedure for the evidence B-07 needs, on the real server once it exists:

1. Run `backup.sh` with `UPNEXT_BACKUP_UPLOAD_CMD` set; confirm `offsite=yes`.
2. On a **different** machine (or a clean container), fetch the file and its `.mac` from the target using only the documented credentials and the escrowed key.
3. Run `measure-restore.sh` with `UPNEXT_RESTORE_SOURCE=offsite`; keep the JSON.
4. Run `provision_db_roles`, `reapply_deletions`, `restore_check --expect … --smoke` (section 4).
5. Record: date, operator, data volume, measured seconds, outcome. Repeat after any change of volume by a factor of ten and at least quarterly.

The existing CI rehearsal (`rehearse.sh`) measures the script path on demo data only; its times say nothing about production.

### 8.3 Alerting for backups

Already implemented (`core/alerts.py`, `MONITORING_AND_ALERTING.md`): `backup.never_ok`, `backup.stale`, `backup.failed` (set `UPNEXT_BACKUP_EXPECTED=1` in production), `backup.local_only`, `restore.performed`. They are logged as `alert.fired` and POSTed to `UPNEXT_ALERT_WEBHOOK_URL` when set. **What is missing is only a destination:** a webhook-capable channel the owner reads (decision O-8). A launch is not safe until one real test alert has been received (`manage.py check_alerts --notify` after setting a test condition) and that is recorded.

### 8.4 Remaining B-07 closure evidence (all external)

Off-server target and credentials; key escrow; one successful off-server backup; one measured restore on the real server with the JSON attached; one real alert received; written backup retention decision (also L-4 and B-02).
