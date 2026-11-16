#!/usr/bin/env bash
# Read-only public checks for the AdSense audit fixes (D-79). Sends GET requests only; changes nothing.
#
#   infrastructure/scripts/verify-adsense-fixes.sh https://upnext.co.zw
#
# Pairs default to the two found by the audit on 2026-11-16 (duplicate=canonical); override with PAIRS="a=b c=d".
# Exit status is the number of failed checks (0 = all passed). Each line says PASS, FAIL or INFO.
set -uo pipefail

BASE="${1:-https://upnext.co.zw}"
BASE="${BASE%/}"
PAIRS="${PAIRS:-supply-assistant-nmk7k5=totalenergies-supply-assistant-harare transport-and-office-associate-6pkxba=acbf-transport-office-associate-harare}"
UA="UPNEXT-verify/1.0"
fails=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails + 1)); }
info() { printf 'INFO  %s\n' "$*"; }

# get PATH -> writes body to $tmp/body, headers to $tmp/head; prints the status code. Never follows redirects.
get() {
  curl -sS -A "$UA" --max-time 30 -o "$tmp/body" -D "$tmp/head" -w '%{http_code}' "$BASE$1" 2>/dev/null || echo 000
}
header() { grep -i "^$1:" "$tmp/head" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
path_of() { printf '%s' "$1" | sed -E 's#^https?://[^/]+##'; }

# --- duplicate pairs ----------------------------------------------------------------------------------------
for pair in $PAIRS; do
  dup="${pair%%=*}"
  keep="${pair#*=}"
  code="$(get "/opportunities/$keep")"
  if [ "$code" = 200 ]; then pass "canonical /opportunities/$keep answers 200"; else fail "canonical /opportunities/$keep answers $code"; fi
  cp "$tmp/body" "$tmp/keep.html"
  if grep -q "<link rel=\"canonical\" href=\"[^\"]*/opportunities/$keep\"" "$tmp/keep.html"; then
    pass "canonical page names itself as canonical"
  else
    fail "canonical page does not carry its own rel=canonical"
  fi
  postings="$(grep -o '"@type":"JobPosting"' "$tmp/keep.html" | wc -l | tr -d ' ')"
  if grep -q 'name="robots" content="noindex' "$tmp/keep.html"; then
    info "canonical page is noindex (closed or past its deadline): JobPosting count $postings (expected 0 after expiry)"
  elif [ "$postings" = 1 ]; then
    pass "canonical page carries exactly one JobPosting"
  else
    info "canonical page carries $postings JobPosting blocks (0 is expected when the listing is not job-category or has no place; see the expiry rules)"
  fi
  if grep -q "/opportunities/$dup" "$tmp/keep.html"; then fail "canonical page mentions the duplicate address"; else pass "canonical page never mentions the duplicate address"; fi

  for variant in "/opportunities/$dup" "/opportunities/$(printf '%s' "$dup" | tr '[:lower:]' '[:upper:]')" "/opportunities/$dup?utm_source=whatsapp&utm_medium=social"; do
    code="$(get "$variant")"
    location="$(header location)"
    target="$(path_of "$location")"
    if { [ "$code" = 308 ] || [ "$code" = 301 ]; } && [ "${target%%\?*}" = "/opportunities/$keep" ]; then
      second="$(get "$target")"
      if [ "$second" = 200 ]; then pass "$variant -> $code -> $target (one hop, final 200)"; else fail "$variant -> $code -> $target answers $second (not one hop)"; fi
    else
      fail "$variant answers $code with Location '${location:-none}' (expected 308/301 to /opportunities/$keep)"
    fi
  done
  code="$(get "/opportunities/$dup/report")"
  target="$(path_of "$(header location)")"
  if { [ "$code" = 308 ] || [ "$code" = 301 ]; } && [ "$target" = "/opportunities/$keep/report" ]; then
    pass "/opportunities/$dup/report moves to the canonical report form"
  else
    fail "/opportunities/$dup/report answers $code -> '${target:-none}'"
  fi
done

# --- public discovery ---------------------------------------------------------------------------------------
check_absent() { # name path
  local name="$1" path="$2" code
  code="$(get "$path")"
  if [ "$code" != 200 ]; then fail "$name ($path) answers $code"; return; fi
  local leaked=""
  for pair in $PAIRS; do grep -q "/opportunities/${pair%%=*}\"" "$tmp/body" && leaked="$leaked ${pair%%=*}"; done
  if [ -n "$leaked" ]; then fail "$name ($path) still links:$leaked"; else pass "$name ($path) links no duplicate"; fi
}
check_absent "home page" "/"
check_absent "all opportunities" "/opportunities"
check_absent "jobs list" "/opportunities?category=jobs"
check_absent "search" "/opportunities?q=Supply+Assistant"
check_absent "search" "/opportunities?q=Transport+Office+Associate"
check_absent "categories" "/categories"

code="$(get /sitemap.xml)"
if [ "$code" = 200 ]; then
  pass "sitemap.xml answers 200"
  for pair in $PAIRS; do
    dup="${pair%%=*}"; keep="${pair#*=}"
    if grep -q "/opportunities/$dup</loc>" "$tmp/body"; then fail "sitemap still lists $dup (caches refresh within about 10 minutes; retry before concluding)"; else pass "sitemap omits $dup"; fi
    if grep -q "/opportunities/$keep</loc>" "$tmp/body"; then pass "sitemap lists $keep"; else info "sitemap does not list $keep (expected only while it is open)"; fi
  done
else
  fail "sitemap.xml answers $code"
fi

code="$(get /robots.txt)"
if [ "$code" = 200 ] && grep -qi '^sitemap: .*/sitemap.xml' "$tmp/body" && header content-type | grep -qi 'text/plain'; then
  pass "robots.txt answers 200 as text/plain and names the sitemap"
else
  fail "robots.txt answers $code ($(header content-type))"
fi

# --- Career Insights and guides -------------------------------------------------------------------------------
code="$(get /insights)"
if [ "$code" = 200 ]; then
  pass "/insights answers 200"
  if grep -qi 'being written' "$tmp/body"; then fail "/insights still shows the 'being written' placeholder"; else pass "/insights shows no placeholder"; fi
  missing=0
  for g in how-to-find-jobs-in-zimbabwe apply-safely-and-avoid-scams how-listings-are-verified how-to-apply-for-graduate-trainee-programmes how-to-prepare-a-cv finding-engineering-internships-and-attachments; do
    grep -q "href=\"/guides/$g\"" "$tmp/body" || missing=$((missing + 1))
  done
  if [ "$missing" = 0 ]; then pass "/insights links all six guides"; else fail "/insights is missing $missing guide link(s)"; fi
  if grep -q 'data-testid="insights-guides"' "$tmp/body"; then
    if grep -q 'role="search"[^>]*action="/insights"\|action="/insights"[^>]*role="search"' "$tmp/body"; then fail "/insights offers article search with no published article"; else pass "/insights offers no article search while empty"; fi
  else
    info "/insights has published articles: the article layout and search are shown"
  fi
else
  fail "/insights answers $code"
fi
for path in /guides /guides/how-to-find-jobs-in-zimbabwe /guides/apply-safely-and-avoid-scams /guides/how-listings-are-verified /guides/how-to-apply-for-graduate-trainee-programmes /guides/how-to-prepare-a-cv /guides/finding-engineering-internships-and-attachments /privacy; do
  code="$(get "$path")"
  if [ "$code" = 200 ]; then pass "$path answers 200"; else fail "$path answers $code"; fi
done

# --- AdSense ----------------------------------------------------------------------------------------------------
code="$(get /ads.txt)"
if [ "$code" = 200 ] && header content-type | grep -qi '^text/plain' && grep -Eq '^google\.com, pub-[0-9]{10,20}, DIRECT, f08c47fec0942fa0$' "$tmp/body"; then
  publisher="$(grep -Eo 'pub-[0-9]+' "$tmp/body" | head -1)"
  pass "/ads.txt answers 200 as text/plain with the Google line for $publisher"
  code="$(get /)"
  if grep -q "<meta name=\"google-adsense-account\" content=\"ca-$publisher\"" "$tmp/body"; then
    pass "home page carries <meta name=\"google-adsense-account\" content=\"ca-$publisher\">"
  else
    fail "home page lacks the google-adsense-account meta tag for ca-$publisher"
  fi
else
  fail "/ads.txt answers $code ($(header content-type)): $(head -c 120 "$tmp/body")"
fi
for path in /sign-in /register /forgot-password /saved /account /dashboard /opportunities "/opportunities?q=zzzz-no-results" /this-page-does-not-exist; do
  code="$(get "$path")"
  if grep -q 'data-ad-placement\|googlesyndication\|adsbygoogle' "$tmp/body"; then fail "$path ($code) contains advertising markup"; else pass "$path ($code) carries no advertising"; fi
done

echo
if [ "$fails" = 0 ]; then echo "All checks passed for $BASE."; else echo "$fails check(s) failed for $BASE."; fi
exit "$fails"
