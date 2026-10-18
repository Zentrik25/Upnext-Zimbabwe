#!/usr/bin/env bash
# Soak: steady load for N minutes while sampling container memory and database connections once a minute.
#   tools/perf/soak.sh 10 50 4        (minutes, users, max think seconds)
set -euo pipefail
minutes="${1:-10}"; users="${2:-50}"; think="${3:-4}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
files=(-p "${TLS_PROJECT:-upnext-tls}" -f compose.yaml -f compose.prod-like.yaml -f compose.tls.yaml)
cd "$root/infrastructure/compose"; set -a; . ./.env; set +a
cd "$root"
python3 tools/perf/load.py --base "https://localhost:${UPNEXT_TLS_PORT:-8443}" --ca infrastructure/tls/.certs/ca.crt \
  --users "$users" --seconds $((minutes*60)) --ramp 10 --think "$think" \
  ${SESSIONS:+--sessions "$SESSIONS" --cookie-name __Host-upnext_sid} --json "${OUT:-/tmp/soak.json}" &
pid=$!
echo "minute,api_mem_MiB,web_mem_MiB,db_mem_MiB,db_connections"
for ((m=1; m<=minutes; m++)); do
  sleep 60
  mem() { docker stats --no-stream --format '{{.MemUsage}}' "${TLS_PROJECT:-upnext-tls}-$1-1" | awk '{print $1}' | sed 's/MiB//'; }
  conns=$(cd infrastructure/compose && docker compose "${files[@]}" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from pg_stat_activity where datname='$POSTGRES_DB'")
  echo "$m,$(mem api),$(mem web),$(mem db),$conns"
done
wait $pid
