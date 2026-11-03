#!/usr/bin/env bash
# Keeps 7 daily, 4 weekly and 3 monthly backups (P5-04) and removes the rest. Names: upnext-YYYYmmddTHHMMSSZ.dump.enc
set -euo pipefail
dir="${1:-${UPNEXT_BACKUP_DIR:-/backups}}"
daily="${UPNEXT_KEEP_DAILY:-7}"; weekly="${UPNEXT_KEEP_WEEKLY:-4}"; monthly="${UPNEXT_KEEP_MONTHLY:-3}"
declare -A keep seen_d seen_w seen_m
nd=0; nw=0; nm=0
while IFS= read -r f; do   # newest first
  name="$(basename "$f")"; ts="${name#upnext-}"; ts="${ts%%.*}"
  day="${ts:0:8}"
  week="$(date -u -d "${day:0:4}-${day:4:2}-${day:6:2}" +%G-W%V)"
  month="${day:0:6}"
  if [ -z "${seen_d[$day]:-}" ] && [ "$nd" -lt "$daily" ]; then seen_d[$day]=1; nd=$((nd+1)); keep[$f]=1; fi
  if [ -z "${seen_w[$week]:-}" ] && [ "$nw" -lt "$weekly" ]; then seen_w[$week]=1; nw=$((nw+1)); keep[$f]=1; fi
  if [ -z "${seen_m[$month]:-}" ] && [ "$nm" -lt "$monthly" ]; then seen_m[$month]=1; nm=$((nm+1)); keep[$f]=1; fi
done < <(ls -1 "$dir"/upnext-*.dump.enc 2>/dev/null | sort -r)
for f in "$dir"/upnext-*.dump.enc; do
  [ -e "$f" ] || continue
  if [ -z "${keep[$f]:-}" ]; then rm -f "$f" "$f.mac"; echo "pruned $(basename "$f")"; fi
done
