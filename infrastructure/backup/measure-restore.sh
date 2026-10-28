#!/usr/bin/env bash
# Measured restore on real infrastructure (B-07). Restores a backup into a NEW database and writes a JSON record
# of what was measured, to be attached to the launch evidence. It proves nothing about other data sizes.
# usage: measure-restore.sh BACKUP.dump.enc TARGET_DATABASE REPORT.json
#   PG* must name an owner-capable role; UPNEXT_BACKUP_KEY_FILE is the key; UPNEXT_RTO_SECONDS defaults to 14400 (4 h).
# UPNEXT_RESTORE_TIMEOUT_SECONDS (default: twice the RTO) stops a stuck restore; status is then "timeout".
# If the backup was fetched from the off-server target first, set UPNEXT_RESTORE_SOURCE=offsite so the record says so.
set -euo pipefail
file="${1:?backup file}"; target="${2:?target database}"; report="${3:?report json}"
here="$(cd "$(dirname "$0")" && pwd)"
rto="${UPNEXT_RTO_SECONDS:-14400}"
t0=$(date +%s)
case "$rto" in ''|*[!0-9]*|0) echo "UPNEXT_RTO_SECONDS must be a positive integer" >&2; exit 2 ;; esac
limit="${UPNEXT_RESTORE_TIMEOUT_SECONDS:-$(( rto * 2 ))}"
status=failed
case "$limit" in ''|*[!0-9]*|0) echo "UPNEXT_RESTORE_TIMEOUT_SECONDS must be a positive integer" >&2; exit 2 ;; esac
rc=0
timeout -k 5 "$limit" bash "$here/restore.sh" "$file" "$target" || rc=$?
if [ "$rc" -eq 0 ]; then status=restored; elif [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then status=timeout; fi
elapsed=$(( $(date +%s) - t0 ))
bytes=0; [ -f "$file" ] && bytes="$(wc -c < "$file")"
tables=0
if [ "$status" = restored ]; then
  tables="$(psql -At -d "$target" -c "select count(*) from information_schema.tables where table_schema='public'")" || tables=-1
fi
within=false; [ "$status" = restored ] && [ "$elapsed" -le "$rto" ] && within=true
printf '{"measured_at":"%s","source":"%s","status":"%s","backup_bytes":%s,"restore_seconds":%s,"public_tables":%s,"rto_seconds":%s,"within_rto":%s}\n' \
  "$(date -u +%FT%TZ)" "${UPNEXT_RESTORE_SOURCE:-local}" "$status" "$bytes" "$elapsed" "$tables" "$rto" "$within" > "$report"
cat "$report"
[ "$status" = restored ]
