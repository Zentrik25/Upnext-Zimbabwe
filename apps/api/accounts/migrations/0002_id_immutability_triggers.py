"""Reject updates of primary keys on identity tables (test DB-01)."""

from django.db import migrations

TABLES = ["accounts_user", "accounts_staffroleassignment"]


def _create(table: str) -> str:
    return (
        f"CREATE TRIGGER {table}_id_immutable BEFORE UPDATE ON {table} "
        "FOR EACH ROW EXECUTE FUNCTION upnext_prevent_id_update();"
    )


def _drop(table: str) -> str:
    return f"DROP TRIGGER IF EXISTS {table}_id_immutable ON {table};"


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial"), ("core", "0002_id_immutability_function")]
    operations = [migrations.RunSQL(_create(t), _drop(t)) for t in TABLES]
