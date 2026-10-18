#!/bin/sh
# Container entrypoint: optionally apply migrations (development and local stacks only), then exec the command.
# When POSTGRES_MIGRATOR_USER is set, migrations and the role provisioning run as that owner role while the
# process itself keeps connecting as the unprivileged application role (P5-02). Production runs migrations
# as a separate release step with the owner credentials and never gives them to the running service.
set -eu
if [ "${UPNEXT_RUN_MIGRATIONS:-0}" = "1" ]; then
  if [ -n "${POSTGRES_MIGRATOR_USER:-}" ]; then
    POSTGRES_USER="$POSTGRES_MIGRATOR_USER" POSTGRES_PASSWORD="${POSTGRES_MIGRATOR_PASSWORD:?}" python manage.py migrate --noinput
    POSTGRES_USER="$POSTGRES_MIGRATOR_USER" POSTGRES_PASSWORD="${POSTGRES_MIGRATOR_PASSWORD:?}" python manage.py provision_db_roles
  else
    python manage.py migrate --noinput
  fi
fi
exec "$@"
