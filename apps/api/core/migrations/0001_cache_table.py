"""Create the database cache table used for rate-limit counters (Redis is deferred, ADR-0004)."""

from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):  # type: ignore[no-untyped-def]
    call_command("createcachetable", "django_cache", database=schema_editor.connection.alias, verbosity=0)


def drop_cache_table(apps, schema_editor):  # type: ignore[no-untyped-def]
    schema_editor.execute("DROP TABLE IF EXISTS django_cache")


class Migration(migrations.Migration):
    dependencies: list[tuple[str, str]] = []
    operations = [migrations.RunPython(create_cache_table, drop_cache_table)]
