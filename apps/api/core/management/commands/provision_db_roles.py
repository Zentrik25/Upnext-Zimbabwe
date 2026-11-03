"""Create or refresh the least-privilege database roles (P5-02). Run as the owner role, after migrate.

`upnext_app` is what the web process and the worker connect as: data changes only. It cannot create, alter
or drop anything, cannot truncate, cannot change the audit log or the editorial history tables, cannot
delete users and cannot edit the migration history. `upnext_readonly` can only read (backup verification,
reporting). Passwords come from the environment so they never appear in code or on a command line.
"""

from __future__ import annotations

import os
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import connection
from psycopg import sql

# Tables the application may add to but never change or remove from (also guarded by triggers).
APPEND_ONLY = (
    "audit_auditevent",
    "opportunities_verificationrecord",
    "opportunities_reviewdecision",
    "opportunities_publishingevent",
)
NO_DELETE = ("accounts_user",)
READ_ONLY_FOR_APP = ("django_migrations",)


def _ident(name: str) -> sql.Identifier:
    return sql.Identifier(name)


class Command(BaseCommand):
    help = "Create/refresh upnext_app and upnext_readonly with least privilege. Run as the owner role."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--app-user", default=os.environ.get("UPNEXT_DB_APP_USER", "upnext_app"))
        parser.add_argument(
            "--readonly-user", default=os.environ.get("UPNEXT_DB_READONLY_USER", "upnext_readonly")
        )

    def handle(self, *args: Any, **options: Any) -> None:
        app = options["app_user"]
        readonly = options["readonly_user"]
        app_password = os.environ.get("UPNEXT_DB_APP_PASSWORD", "")
        readonly_password = os.environ.get("UPNEXT_DB_READONLY_PASSWORD", "")
        if len(app_password) < 16:
            raise CommandError("UPNEXT_DB_APP_PASSWORD must be set (at least 16 characters).")
        if readonly_password and len(readonly_password) < 16:
            raise CommandError("UPNEXT_DB_READONLY_PASSWORD must be at least 16 characters when set.")
        with connection.cursor() as cur:
            cur.execute("SELECT current_user, current_database()")
            owner, database = cur.fetchone()
            if owner in (app, readonly):
                raise CommandError("Run this as the migrator/owner role, not as the application role.")
            self._role(cur, app, app_password)
            if readonly_password:
                self._role(cur, readonly, readonly_password)
            db, owner_id = _ident(database), _ident(owner)
            roles = [app] + ([readonly] if readonly_password else [])
            for role in roles:
                r = _ident(role)
                cur.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM {}").format(db, r))
                cur.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(db, r))
                cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(r))
                cur.execute(sql.SQL("REVOKE CREATE ON SCHEMA public FROM {}").format(r))
            cur.execute(sql.SQL("REVOKE ALL ON SCHEMA public FROM PUBLIC"))
            cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO PUBLIC"))
            a = _ident(app)
            cur.execute(sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}").format(a))
            cur.execute(
                sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}").format(a)
            )
            cur.execute(sql.SQL("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(a))
            for table in APPEND_ONLY:
                self._revoke(cur, table, "UPDATE, DELETE", a)
            for table in NO_DELETE:
                self._revoke(cur, table, "DELETE", a)
            for table in READ_ONLY_FOR_APP:
                self._revoke(cur, table, "INSERT, UPDATE, DELETE", a)
            # Tables and sequences added by later migrations (run by the owner) get the same baseline.
            cur.execute(
                sql.SQL(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public "
                    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {}"
                ).format(owner_id, a)
            )
            cur.execute(
                sql.SQL(
                    "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public "
                    "GRANT USAGE, SELECT ON SEQUENCES TO {}"
                ).format(owner_id, a)
            )
            if readonly_password:
                r = _ident(readonly)
                cur.execute(sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}").format(r))
                cur.execute(sql.SQL("GRANT SELECT ON ALL TABLES IN SCHEMA public TO {}").format(r))
                cur.execute(
                    sql.SQL("GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(r)
                )  # pg_dump reads them
                cur.execute(
                    sql.SQL(
                        "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public GRANT SELECT ON TABLES TO {}"
                    ).format(owner_id, r)
                )
                cur.execute(
                    sql.SQL(
                        "ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public "
                        "GRANT SELECT ON SEQUENCES TO {}"
                    ).format(owner_id, r)
                )
        self.stdout.write(f"roles ready: {', '.join(roles)} (owner {owner})")

    @staticmethod
    def _revoke(cur: Any, table: str, privileges: str, role: sql.Identifier) -> None:
        cur.execute("SELECT to_regclass(%s)", [f"public.{table}"])
        if cur.fetchone()[0] is not None:
            cur.execute(sql.SQL("REVOKE {} ON {} FROM {}").format(sql.SQL(privileges), _ident(table), role))

    @staticmethod
    def _role(cur: Any, name: str, password: str) -> None:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", [name])
        verb = "ALTER" if cur.fetchone() else "CREATE"
        cur.execute(
            sql.SQL(
                verb
                + " ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
            ).format(_ident(name), sql.Literal(password))
        )
