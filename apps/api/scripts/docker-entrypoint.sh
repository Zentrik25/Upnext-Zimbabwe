#!/bin/sh
# Container entrypoint: optionally apply migrations (development only), then exec the command.
set -eu
if [ "${UPNEXT_RUN_MIGRATIONS:-0}" = "1" ]; then
  python manage.py migrate --noinput
fi
exec "$@"
