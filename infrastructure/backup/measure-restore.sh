#!/usr/bin/env bash
# Measured restore on real infrastructure (B-07). Restores a backup into a NEW database and writes a JSON record
# of what was measured, to be attached to the launch evidence. It proves nothing about other data sizes.
# usage: measure-restore.sh BACKUP.dump.enc TARGET_DATABASE REPORT.json
#   PG* must name an owner-capable role; UPNEXT_BACKUP_KEY_FILE is the key; UPNEXT_RTO_SECONDS defaults to 14400 (4 h).
# If the backup was fetched from the off-server target first, set UPNEXT_RESTORE_SOURCE=offsite so the record says so.
set -euo pipefail
file="${1:?backup file}"; target="${2:?target database}"; report="${3:?report json}"
here="$(cd "$(dirname "$0")" && pwd)"
rto="${UPNEXT_RTO_SECONDS:-14400}"
t0=$(date +%s)
status=failed
if bash "$here/restore.sh" "$file" "$target"; then status=restored; fi
elapsed=$(( $(date +%s) - t0 ))
tables=0
if [ "$status" = restored ]; then
  tables="$(psql -At -d "$target" -c "select count(*) from information_schema.tables where table_schema='public'")"
fi
within=false; [ "$status" = restored ] && [ "$elapsed" -le "$rto" ] && within=true
printf '{"measured_at":"%s","source":"%s","status":"%s","backup_bytes":%s,"restore_seconds":%s,"public_tables":%s,"rto_seconds":%s,"within_rto":%s}\n' \
  "$(date -u +%FT%TZ)" "${UPNEXT_RESTORE_SOURCE:-local}" "$status" "$(wc -c < "$file")" "$elapsed" "$tables" "$rto" "$within" > "$report"
cat "$report"
[ "$status" = restored ]
