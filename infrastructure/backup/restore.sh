#!/usr/bin/env bash
# Restores an encrypted backup into a NEW database (P5-04). It never overwrites an existing database.
# usage: restore.sh BACKUP.dump.enc TARGET_DATABASE      (PG* variables must name an owner-capable role)
# After restoring: run `manage.py provision_db_roles` against the new database (privileges are not part of the
# dump), `manage.py reapply_deletions LOGFILE` for deletions completed after the backup was taken, and
# `manage.py restore_check --expect SOURCE.json --smoke`. Elapsed time is printed: it is the RTO evidence.
set -euo pipefail
file="${1:?backup file}"; target="${2:?target database}"
key="${UPNEXT_BACKUP_KEY_FILE:?set UPNEXT_BACKUP_KEY_FILE}"
want="$(cat "$file.mac")"
have="$(openssl dgst -sha256 -hmac "$(base64 -w0 < "$key")" -r "$file" | cut -d' ' -f1)"
[ "$want" = "$have" ] || { echo "authentication of $file failed (wrong key, or the file was altered)" >&2; exit 3; }
start=$(date +%s)
createdb "$target"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass "file:$key" < "$file" \
  | pg_restore --no-owner --no-acl --exit-on-error --dbname="$target"
echo "restored into $target in $(( $(date +%s) - start )) s"
