#!/usr/bin/env bash
# Deploys (or upgrades) the UPNEXT production Compose project on the VPS. It touches only the `upnext-prod`
# project: never another project, the shared proxy or DNS. Guarded: it refuses to run without the explicit
# confirmation variable, so it cannot be started by accident or from CI.
#
#   UPNEXT_DEPLOY_CONFIRM=upnext.co.zw UPNEXT_ENV_FILE=/etc/upnext/upnext.env UPNEXT_RELEASE=<git sha or tag> \
#       bash infrastructure/deploy/release.sh
#
# Steps: validate -> record the previous release -> build -> database up -> migrate (owner credentials) ->
# services up -> local health through the loopback proxy. On any failure it stops; run rollback.sh.
set -euo pipefail
[ "${UPNEXT_DEPLOY_CONFIRM:-}" = "upnext.co.zw" ] || { echo "refused: set UPNEXT_DEPLOY_CONFIRM=upnext.co.zw (final deployment authorisation required)" >&2; exit 2; }
env_file="${UPNEXT_ENV_FILE:?set UPNEXT_ENV_FILE}"; [ -f "$env_file" ] || { echo "refused: env file not found" >&2; exit 2; }
release="${UPNEXT_RELEASE:?set UPNEXT_RELEASE}"
case "$release" in *[!A-Za-z0-9._-]*|'') echo "refused: UPNEXT_RELEASE must be a plain tag or sha" >&2; exit 2 ;; esac
root="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$root/infrastructure/compose"
state="${UPNEXT_STATE_DIR:-/var/lib/upnext-deploy}"; mkdir -p "$state"
export UPNEXT_RELEASE="$release" COMPOSE_BAKE=false
files=(-f compose.production.yaml); [ -n "${UPNEXT_EDGE_NETWORK:-}" ] && files+=(-f compose.production.edge.yaml)
dc() { docker compose --env-file "$env_file" "${files[@]}" "$@"; }
dc --profile release --profile backup config -q
current="$(cat "$state/current" 2>/dev/null || true)"
[ -n "$current" ] && [ "$current" != "$release" ] && echo "$current" > "$state/previous"
echo "== release $release (previous: ${current:-none})"
dc --profile release --profile backup build
dc up -d --wait db
dc --profile release run --rm migrate
dc up -d --wait --wait-timeout 300 api worker web proxy
port="${UPNEXT_PROXY_PORT:-8090}"
for path in /health/ready /; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H 'Host: upnext.co.zw' "http://127.0.0.1:$port$path" || true)"
  [ "$code" = 200 ] || { echo "local check $path returned $code; run rollback.sh" >&2; exit 1; }
done
echo "$release" > "$state/current"
echo "release $release is up locally. Next: verify.sh against https://upnext.co.zw once the edge routes to it."
