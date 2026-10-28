#!/usr/bin/env bash
# Off-server copy of one backup file, with read-back verification (B-07). Used as the owner's
# UPNEXT_BACKUP_UPLOAD_CMD:   UPNEXT_BACKUP_UPLOAD_CMD='bash /backup/offsite.sh "$FILE"'
# It chooses no provider. The owner supplies the target (a mounted path, an ssh/rsync destination, or an rclone
# remote) and its credentials through the environment or the tool's own configuration, never through git.
#
#   UPNEXT_OFFSITE_KIND    dir | rsync | rclone
#   UPNEXT_OFFSITE_TARGET  dir: an existing directory on a DIFFERENT machine or volume (e.g. a mount)
#                          rsync: user@host:/path/   (ssh key supplied by the environment)
#                          rclone: remote:path       (remote configured by the owner)
# The file is copied, read back from the target and its SHA-256 compared with the local file. Any failure exits
# non-zero, so backup.sh fails and reports `failed`; a backup is never reported off-server on trust.
set -euo pipefail
file="${1:?backup file}"
kind="${UPNEXT_OFFSITE_KIND:?set UPNEXT_OFFSITE_KIND (dir|rsync|rclone)}"
target="${UPNEXT_OFFSITE_TARGET:?set UPNEXT_OFFSITE_TARGET}"
name="$(basename "$file")"
[ -f "$file" ] || { echo "offsite: backup file not found" >&2; exit 2; }
# Credentials belong in the tool's own configuration or the environment, never in the target string.
case "$target" in
  *://*:*@*) echo "offsite: the target must not contain credentials; configure them in the tool or the environment" >&2; exit 6 ;;
esac
want="$(sha256sum "$file" | cut -d' ' -f1)"
err="$(mktemp)"; trap 'rm -f "$err"' EXIT
# Output of the copy tools is withheld: it can echo the target, a key path or a token. Only the exit status is reported.
tool() { "$@" 2>"$err" || { echo "offsite: $1 failed (exit $?); details withheld to avoid exposing credentials" >&2; exit 7; }; }
case "$kind" in
  dir)
    [ -d "$target" ] || { echo "offsite: target directory does not exist" >&2; exit 4; }
    cp "$file" "$target/$name.part" 2>"$err" || { rm -f "$target/$name.part"; echo "offsite: copy failed" >&2; exit 7; }
    mv "$target/$name.part" "$target/$name"
    have="$(sha256sum "$target/$name" | cut -d' ' -f1)" ;;
  rsync)
    tool rsync --partial --quiet "$file" "${target%/}/"
    # A checksum dry run lists the file only if the remote copy differs.
    diff="$(rsync --checksum --dry-run --itemize-changes "$file" "${target%/}/$name" 2>"$err")" || { echo "offsite: rsync verification failed; details withheld" >&2; exit 7; }
    if [ -z "$diff" ]; then have="$want"; else have="differs"; fi ;;
  rclone)
    tool rclone copyto "$file" "${target%/}/$name"
    have="$(rclone cat "${target%/}/$name" 2>"$err" | sha256sum | cut -d' ' -f1)" ;;
  *) echo "offsite: unknown kind" >&2; exit 2 ;;
esac
[ "$want" = "$have" ] || { echo "offsite: read-back of $name does not match the local file" >&2; exit 5; }
echo "offsite: $name verified on $kind target"
