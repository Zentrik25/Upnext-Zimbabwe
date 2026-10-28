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
want="$(sha256sum "$file" | cut -d' ' -f1)"
case "$kind" in
  dir)
    [ -d "$target" ] || { echo "offsite: target directory $target does not exist" >&2; exit 4; }
    cp "$file" "$target/$name.part" && mv "$target/$name.part" "$target/$name"
    have="$(sha256sum "$target/$name" | cut -d' ' -f1)" ;;
  rsync)
    rsync --partial --quiet "$file" "${target%/}/"
    have="$(rsync --quiet "${target%/}/$name" /dev/stdout 2>/dev/null | sha256sum | cut -d' ' -f1)" ;;
  rclone)
    rclone copyto "$file" "${target%/}/$name"
    have="$(rclone cat "${target%/}/$name" | sha256sum | cut -d' ' -f1)" ;;
  *) echo "offsite: unknown kind $kind" >&2; exit 2 ;;
esac
[ "$want" = "$have" ] || { echo "offsite: read-back of $name does not match the local file" >&2; exit 5; }
echo "offsite: $name verified on $kind target"
