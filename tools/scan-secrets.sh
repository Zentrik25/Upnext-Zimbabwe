#!/usr/bin/env bash
# Scans tracked/unignored files and every commit's tree for committed secrets with detect-secrets.
# Requires detect-secrets on PATH (installed from apps/api/requirements/dev.txt).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
exclude='(package-lock\.json|requirements/.*\.txt|docs/design/evidence/.*\.json|reference/approved-flat\.html|tools/secrets-allowlist\.json)'
findings=$(mktemp)

allowlist="$PWD/tools/secrets-allowlist.json"
report() {  # reads detect-secrets JSON on stdin, prints "path:line type" except reviewed false positives
  python3 -c '
import json, sys
allowed = {e["hashed_secret"] for e in json.load(open(sys.argv[1]))["reviewed_false_positives"]}
d = json.load(sys.stdin)
for path, hits in sorted(d["results"].items()):
    for h in hits:
        if h["hashed_secret"] not in allowed:
            print(path + ":" + str(h["line_number"]) + " " + h["type"])' "$1"
}

scan_files() {  # $1 = label; file list on stdin (NUL-separated)
  local out
  out=$(xargs -0 -r detect-secrets scan --exclude-files "$exclude" 2>/dev/null | report "$allowlist")
  # Pipelines run in subshells, so findings go to a file rather than a variable.
  if [ -n "$out" ]; then { echo "potential secrets in $1:"; echo "$out"; } >> "$findings"; fi
}

git ls-files --cached --others --exclude-standard -z | scan_files "working tree"

tmp=$(mktemp -d); trap 'rm -rf "$tmp" "$findings"' EXIT
count=0
for commit in $(git rev-list --all); do
  count=$((count + 1))
  rm -rf "$tmp/t"; mkdir "$tmp/t"
  git archive "$commit" | tar -x -C "$tmp/t"
  (cd "$tmp/t" && find . -type f -print0) | (cd "$tmp/t" && scan_files "commit $commit")
done
if [ -s "$findings" ]; then cat "$findings"; echo "SECRET SCAN FAILED"; exit 1; fi
echo "no secrets detected in the working tree or in $count commits"
