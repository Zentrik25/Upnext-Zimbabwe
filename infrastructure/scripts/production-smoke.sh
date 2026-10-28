#!/usr/bin/env bash
# Boots compose.production.yaml with THROWAWAY values on a disposable machine (CI) and checks what can be checked
# without the real domain, certificate or edge: build of the prod images, release migration, least-privilege
# roles, health, host handling (only upnext.co.zw answers; www and any other host get nothing), headers and the
# production preflight. It proves nothing about DNS, TLS issuance or the shared proxy. Never run it on the VPS.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root/infrastructure/compose"
export COMPOSE_BAKE=false
rnd() { python3 -c 'import secrets; print(secrets.token_urlsafe(int("'"$1"'")))'; }
keyfile="$(mktemp)"; head -c 48 /dev/urandom > "$keyfile"; chmod 0644 "$keyfile"
envfile="$(mktemp)"; trap 'docker compose --env-file "$envfile" -f compose.production.yaml --profile release down -v >/dev/null 2>&1 || true; rm -f "$envfile" "$keyfile"' EXIT
cat > "$envfile" <<ENV
POSTGRES_DB=upnext
POSTGRES_USER=upnext_owner
POSTGRES_PASSWORD=$(rnd 24)
POSTGRES_MIGRATOR_USER=upnext_owner
POSTGRES_MIGRATOR_PASSWORD=placeholder
DJANGO_SECRET_KEY=$(rnd 64)
UPNEXT_TOKEN_KEY=$(rnd 48)
UPNEXT_THROTTLE_PEPPER=$(rnd 32)
UPNEXT_DB_APP_PASSWORD=$(rnd 24)
UPNEXT_DB_READONLY_PASSWORD=$(rnd 24)
UPNEXT_RELEASE=ci
UPNEXT_EDGE_CIDR=172.16.0.0/12
UPNEXT_PROXY_PORT=8090
UPNEXT_BACKUP_KEY_HOST_PATH=$keyfile
ENV
# the migrator password must equal the bootstrap password
pw="$(grep '^POSTGRES_PASSWORD=' "$envfile" | cut -d= -f2-)"
sed -i "s|^POSTGRES_MIGRATOR_PASSWORD=.*|POSTGRES_MIGRATOR_PASSWORD=$pw|" "$envfile"
dc() { docker compose --env-file "$envfile" -f compose.production.yaml "$@"; }

echo "== static validation"; dc --profile release config -q
echo "== build and start the database"; dc --profile release build; dc up -d --wait db
echo "== release step (owner credentials)"; dc --profile release run --rm migrate
echo "== start the services"
dc up -d --wait --wait-timeout 300 api worker web proxy || { dc ps -a; dc logs --no-color --tail 100 api worker web proxy >&2; exit 1; }
dc ps

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $1" "http://127.0.0.1:8090$2" || true; }
fail() { echo "FAIL: $*" >&2; dc logs --no-color --tail 80 >&2; exit 1; }

[ "$(code upnext.co.zw /health/live)" = 200 ] || fail "health/live"
[ "$(code upnext.co.zw /health/ready)" = 200 ] || fail "health/ready"
[ "$(code upnext.co.zw /)" = 200 ] || fail "home page"
[ "$(code upnext.co.zw /robots.txt)" = 200 ] || fail "robots"
for h in www.upnext.co.zw example.com 127.0.0.1; do
  [ "$(code "$h" /)" = 000 ] || fail "host $h must receive no answer"
done
hdr="$(curl -s -D - -o /dev/null --max-time 10 -H 'Host: upnext.co.zw' http://127.0.0.1:8090/)"
echo "$hdr" | grep -qi '^strict-transport-security: max-age=31536000' || fail "HSTS header missing"
echo "$hdr" | grep -qi '^content-security-policy:' || fail "CSP header missing"
echo "$hdr" | grep -qi '^x-powered-by' && fail "x-powered-by leaks"
[ "$(code upnext.co.zw /api/v1/schema)" = 404 ] || fail "OpenAPI schema must not be exposed"
[ "$(curl -s --max-time 10 -H 'Host: upnext.co.zw' http://127.0.0.1:8090/sitemap.xml | grep -c 'https://upnext.co.zw')" -ge 1 ] || fail "sitemap origin"

echo "== only loopback is published"
published="$(docker ps --filter "label=com.docker.compose.project=upnext-prod" --format '{{.Ports}}' | tr ',' '\n' | grep -- '->' || true)"
echo "$published"
echo "$published" | grep -v '^127\.0\.0\.1:8090->80/tcp$' | grep -q . && fail "unexpected published port"

echo "== deployment verification script against the loopback proxy"
UPNEXT_VERIFY_BASE=http://127.0.0.1:8090 UPNEXT_VERIFY_HOST=upnext.co.zw bash ../deploy/verify.sh || fail "verify.sh"

echo "== backup job (read-only role, encrypted dump, outcome recorded for the alerts)"
UPNEXT_ENV_FILE="$envfile" bash ../deploy/backup-job.sh | tee /tmp/backup-job.out
grep -q 'offsite=no' /tmp/backup-job.out || fail "backup did not report offsite=no"
grep -q 'recorded backup: ok' /tmp/backup-job.out || fail "backup outcome not recorded"
dc --profile backup run --rm --entrypoint bash backup -c 'f=$(ls /backups/upnext-*.dump.enc | head -1); test "$(wc -c < "$f")" -gt 1000; ! head -c 5 "$f" | grep -q PGDMP' || fail "backup file missing or not encrypted"

echo "== production preflight inside the API container (real production mode)"
dc exec -T api python manage.py check_production_config
echo "production smoke test passed"
