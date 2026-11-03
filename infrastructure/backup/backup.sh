#!/usr/bin/env bash
# Encrypted logical backup of the UPNEXT database (P5-04). Runs where pg_dump and openssl exist (the postgres
# image has both). Connects with the read-only role. Nothing here chooses or configures a storage target:
# UPNEXT_BACKUP_UPLOAD_CMD is the owner's off-server copy command; without it the backup stays on local disk
# and is reported as such. A local-only copy is NOT a backup against loss of the server.
#
# Environment:  PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD   (read-only role)
#               UPNEXT_BACKUP_DIR (default /backups)  UPNEXT_BACKUP_KEY_FILE (>= 32 random bytes, kept apart)
#               UPNEXT_BACKUP_UPLOAD_CMD (optional, e.g. 'rclone copyto "$FILE" remote:upnext/')
#               UPNEXT_BACKUP_RECORD_CMD (optional, e.g. 'manage.py record_job backup' wrapper)
set -euo pipefail
dir="${UPNEXT_BACKUP_DIR:-/backups}"
key="${UPNEXT_BACKUP_KEY_FILE:?set UPNEXT_BACKUP_KEY_FILE}"
[ "$(wc -c < "$key")" -ge 32 ] || { echo "key file must hold at least 32 bytes" >&2; exit 2; }
mkdir -p "$dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$dir/upnext-$stamp"
record() { if [ -n "${UPNEXT_BACKUP_RECORD_CMD:-}" ]; then $UPNEXT_BACKUP_RECORD_CMD --status "$1" --detail "$2" || true; fi; }
trap 'record failed "backup script failed"; rm -f "$base".part' ERR
start=$(date +%s)
pg_dump --format=custom --compress=6 --no-owner --no-acl "${PGDATABASE:?}" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass "file:$key" > "$base.part"
mv "$base.part" "$base.dump.enc"
openssl dgst -sha256 -hmac "$(base64 -w0 < "$key")" -r "$base.dump.enc" | cut -d' ' -f1 > "$base.dump.enc.mac"
size=$(wc -c < "$base.dump.enc")
offsite=no
if [ -n "${UPNEXT_BACKUP_UPLOAD_CMD:-}" ]; then
  for f in "$base.dump.enc" "$base.dump.enc.mac"; do FILE="$f" bash -c "$UPNEXT_BACKUP_UPLOAD_CMD"; done
  offsite=yes
fi
"$(dirname "$0")/prune.sh" "$dir"
echo "backup $base.dump.enc ($size bytes, $(( $(date +%s) - start )) s, offsite=$offsite)"
record ok "file=$(basename "$base").dump.enc bytes=$size offsite=$offsite"
