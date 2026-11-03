#!/usr/bin/env bash
# Rolls the application back to the previous release recorded by release.sh (images are rebuilt from that
# release's tag, so the repository must be checked out at it first: `git checkout <previous>`).
# Data is never rolled back by this script: migrations are forward-only; a data problem is a restore from
# backup (docs/engineering/BACKUP_AND_RESTORE.md section 4 and 8.2). Same guard as release.sh.
set -euo pipefail
[ "${UPNEXT_DEPLOY_CONFIRM:-}" = "upnext.co.zw" ] || { echo "refused: set UPNEXT_DEPLOY_CONFIRM=upnext.co.zw" >&2; exit 2; }
state="${UPNEXT_STATE_DIR:-/var/lib/upnext-deploy}"
prev="$(cat "$state/previous" 2>/dev/null || true)"
[ -n "$prev" ] || { echo "refused: no previous release is recorded" >&2; exit 2; }
echo "rolling back to $prev; check the repository is at that revision"
head="$(git -C "$(dirname "$0")/../.." rev-parse HEAD)"
case "$head" in "$prev"*) ;; *) [ "${UPNEXT_ROLLBACK_FORCE:-}" = 1 ] || { echo "refused: repository HEAD is $head, not $prev (set UPNEXT_ROLLBACK_FORCE=1 if the release is a tag)" >&2; exit 2; } ;; esac
UPNEXT_RELEASE="$prev" bash "$(dirname "$0")/release.sh"
