"""Shared trigger function: primary keys are immutable (ERD §1, ADR-0006)."""

from django.db import migrations

CREATE = """
CREATE OR REPLACE FUNCTION upnext_prevent_id_update() RETURNS trigger AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'primary key of %.% is immutable', TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0001_cache_table")]
    operations = [migrations.RunSQL(CREATE, "DROP FUNCTION IF EXISTS upnext_prevent_id_update();")]
