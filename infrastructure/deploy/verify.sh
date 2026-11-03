#!/usr/bin/env bash
# External deployment verification (PRODUCTION_DEPLOYMENT_PLAN V-1..V-8). Read-only: it only issues GET/HEAD requests.
#   bash infrastructure/deploy/verify.sh                       # against https://upnext.co.zw
#   UPNEXT_VERIFY_BASE=http://127.0.0.1:8090 UPNEXT_VERIFY_HOST=upnext.co.zw bash ...   # local loopback (no TLS checks)
# Exit code is the number of failed checks.
set -u
base="${UPNEXT_VERIFY_BASE:-https://upnext.co.zw}"; host="${UPNEXT_VERIFY_HOST:-}"
curl_args=(-s --max-time 15); [ -n "$host" ] && curl_args+=(-H "Host: $host")
fails=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fails=$((fails+1)); }
code() { curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' "$base$1" || true; }
hdr() { curl "${curl_args[@]}" -D - -o /dev/null "$base$1"; }
for p in / /health/ready /robots.txt /sitemap.xml /privacy /terms /contact; do
  [ "$(code $p)" = 200 ] && ok "GET $p 200" || bad "GET $p"
done
h="$(hdr /)"
case "$base" in https://*)
  echo "$h" | grep -qi '^strict-transport-security: max-age=31536000' && ok HSTS || bad HSTS
  echo "$h" | grep -qi 'includesubdomains\|preload' && bad "HSTS must not include subdomains or preload" || ok "HSTS scope"
  ;;
esac
echo "$h" | grep -qi '^content-security-policy:' && ok CSP || bad CSP
echo "$h" | grep -qi '^x-content-type-options: nosniff' && ok nosniff || bad nosniff
[ "$(code /api/v1/schema)" = 404 ] && ok "OpenAPI schema not exposed" || bad "OpenAPI schema exposed"
curl "${curl_args[@]}" "$base/sitemap.xml" | grep -q 'https://upnext.co.zw' && ok "sitemap origin" || bad "sitemap origin"
curl "${curl_args[@]}" "$base/robots.txt" | grep -qi 'sitemap: https://upnext.co.zw' && ok "robots sitemap" || bad "robots sitemap"
curl "${curl_args[@]}" "$base/" | grep -qi 'nextjob' && bad "old name NextJob visible" || ok "no old name"
if [ -z "$host" ]; then
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://upnext.co.zw/ || true)" = 301 ] || [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://upnext.co.zw/ || true)" = 308 ] && ok "http redirects to https" || bad "http redirect"
  if curl -s -o /dev/null --max-time 10 https://www.upnext.co.zw/ 2>/dev/null; then bad "www.upnext.co.zw answers (must not exist)"; else ok "www does not answer"; fi
fi
echo "failed checks: $fails"; exit "$fails"
