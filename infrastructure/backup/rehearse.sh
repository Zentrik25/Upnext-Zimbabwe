#!/usr/bin/env bash
# Backup and restore rehearsal on the LOCAL TLS stack (P5-04). It proves the scripts and the restore path, not
# a storage target: the backup stays inside a throwaway container volume. It prints the measured times.
#   1. record the source database (row counts, triggers, indexes)
#   2. encrypted backup as the read-only role, prune check
#   3. tamper check (an altered file must be refused)
#   4. restore into a new database, re-provision privileges, re-apply deletions from a log
#   5. compare with the source and run the application's read paths against the restored copy as the app role
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root/infrastructure/compose"
files=(-p "${TLS_PROJECT:-upnext-tls}" -f compose.yaml -f compose.prod-like.yaml -f compose.tls.yaml)
export COMPOSE_BAKE=false
set -a; . ./.env; set +a
dc() { docker compose "${files[@]}" "$@"; }
RO_PW="${UPNEXT_DB_READONLY_PASSWORD:-local-tls-ro-password-0001}"
APP_PW="${UPNEXT_DB_APP_PASSWORD:-local-tls-app-password-0001}"
OWNER=(-e POSTGRES_USER="$POSTGRES_USER" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD")

echo "== 1. source"
dc exec -T api python manage.py restore_check --json > /tmp/upnext-source.json
dc exec -T api python manage.py restore_check | head -1

echo "== 2. backup"
dc cp "$root/infrastructure/backup" db:/tmp/backup >/dev/null
dc exec -T db bash -c 'umask 077; head -c 48 /dev/urandom > /tmp/backup-key; rm -rf /tmp/backups; mkdir -p /tmp/backups'
t0=$(date +%s)
dc exec -T -e PGHOST=127.0.0.1 -e PGDATABASE="$POSTGRES_DB" -e PGUSER=upnext_readonly -e PGPASSWORD="$RO_PW" \
  -e UPNEXT_BACKUP_DIR=/tmp/backups -e UPNEXT_BACKUP_KEY_FILE=/tmp/backup-key db bash /tmp/backup/backup.sh
echo "backup took $(( $(date +%s) - t0 )) s"
file="$(dc exec -T db bash -c 'ls -1 /tmp/backups/*.dump.enc | head -1' | tr -d '\r')"
dc exec -T db bash -c "test \"\$(wc -c < $file)\" -gt 1000 && ! head -c 5 $file | grep -q PGDMP" \
  && echo "backup is encrypted (no PGDMP header)"

echo "== 3. tamper check"
dc exec -T db bash -c "cp $file /tmp/tampered.dump.enc; cp $file.mac /tmp/tampered.dump.enc.mac; printf X | dd of=/tmp/tampered.dump.enc bs=1 seek=100 conv=notrunc 2>/dev/null"
if dc exec -T -e PGUSER="$POSTGRES_USER" -e PGPASSWORD="$POSTGRES_PASSWORD" -e UPNEXT_BACKUP_KEY_FILE=/tmp/backup-key db bash /tmp/backup/restore.sh /tmp/tampered.dump.enc tamper_target; then
  echo "FAIL: a tampered backup was accepted" >&2; exit 1; else echo "tampered backup refused"; fi

echo "== 4. restore"
dc exec -T -e PGUSER="$POSTGRES_USER" -e PGPASSWORD="$POSTGRES_PASSWORD" db bash -c 'dropdb --if-exists restore_check'
t1=$(date +%s)
dc exec -T -e PGHOST=127.0.0.1 -e PGUSER="$POSTGRES_USER" -e PGPASSWORD="$POSTGRES_PASSWORD" -e UPNEXT_BACKUP_KEY_FILE=/tmp/backup-key db bash /tmp/backup/restore.sh "$file" restore_check
dc exec -T "${OWNER[@]}" -e POSTGRES_DB=restore_check -e UPNEXT_DB_APP_PASSWORD="$APP_PW" -e UPNEXT_DB_READONLY_PASSWORD="$RO_PW" api python manage.py provision_db_roles
echo "restore + privileges took $(( $(date +%s) - t1 )) s (RTO evidence for this data size only)"

echo "== 5. verify"
dc cp /tmp/upnext-source.json api:/tmp/upnext-source.json
dc exec -T -e POSTGRES_DB=restore_check api python manage.py restore_check --expect /tmp/upnext-source.json --smoke
dc exec -T -e POSTGRES_DB=restore_check api python manage.py check_production_config --skip-database >/dev/null 2>&1 || true
echo "== re-apply deletions (nothing to do in a fresh rehearsal; proves the command runs against the restored copy)"
printf '{"event": "account.deletion_completed", "user_id": "00000000-0000-0000-0000-000000000000"}\n' > /tmp/deletions.log
dc cp /tmp/deletions.log api:/tmp/deletions.log
dc exec -T -e POSTGRES_DB=restore_check api python manage.py reapply_deletions /tmp/deletions.log
dc exec -T -e PGUSER="$POSTGRES_USER" -e PGPASSWORD="$POSTGRES_PASSWORD" db bash -c 'dropdb restore_check; rm -f /tmp/backup-key /tmp/tampered.dump.enc*; rm -rf /tmp/backups'
echo "rehearsal complete"
