#!/usr/bin/env bash
# Seeds demo data and runs the browser suites against the LOCAL TLS stack (compose.tls.yaml).
# Seeding needs the owner database role (it deletes and truncates), so it runs in the worker container, which
# keeps demo tools for tests, with the owner credentials passed for this one command only.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root/infrastructure/compose"
files=(-p "${TLS_PROJECT:-upnext-tls}" -f compose.yaml -f compose.prod-like.yaml -f compose.tls.yaml)
set -a; . ./.env; set +a
export COMPOSE_BAKE=false
docker compose "${files[@]}" exec -T -e POSTGRES_USER="$POSTGRES_USER" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e UPNEXT_DEMO_PASSWORD="${E2E_DEMO_PASSWORD:-demo-only-Passw0rd-local}" worker python manage.py seed_demo --force >/dev/null
cd "$root/apps/web"
export BASE_URL="https://localhost:${UPNEXT_TLS_PORT:-8443}" E2E_IGNORE_HTTPS_ERRORS=1 E2E_STRICT_CONSOLE=1 \
  E2E_DEMO_DATA=1 E2E_ACCOUNTS=1 E2E_CMS=1 E2E_EMAIL_CHANGE_OFF=1 E2E_DEMO_PASSWORD="${E2E_DEMO_PASSWORD:-demo-only-Passw0rd-local}"
export E2E_EXEC="docker compose ${files[*]/#compose/$root/infrastructure/compose/compose} exec -T worker python manage.py"
npx playwright test --reporter=line --workers=1 "$@"
