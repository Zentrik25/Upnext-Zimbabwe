#!/usr/bin/env bash
# Daily backup wrapper (run by upnext-backup.service). Runs the backup container, then records the outcome in the
# application's job table so the alerts backup.stale / backup.failed / backup.local_only can fire. A failed run
# is recorded as failed and the script exits non-zero (systemd marks the unit failed).
set -uo pipefail
env_file="${UPNEXT_ENV_FILE:-/etc/upnext/upnext.env}"
cd "$(dirname "$0")/../compose"
dc() { docker compose --env-file "$env_file" -f compose.production.yaml "$@"; }
out="$(dc --profile backup run --rm backup 2>&1)"; rc=$?
echo "$out" | sed -e 's/^/backup: /'
if [ "$rc" -eq 0 ]; then
  detail="$(echo "$out" | grep -E '^backup .*offsite=' | tail -1 | sed -E 's/^backup [^ ]*\/([^ ]*) \(([^)]*)\)/file=\1 \2/')"
  dc exec -T api python manage.py record_job backup --status ok --detail "${detail:-offsite=unknown}"
else
  dc exec -T api python manage.py record_job backup --status failed --detail "backup container exit $rc" || true
  exit "$rc"
fi
