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
