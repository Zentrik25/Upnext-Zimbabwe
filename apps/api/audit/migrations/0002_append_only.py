"""The audit log is append-only: UPDATE and DELETE are rejected for every role (ERD §3.8).

TRUNCATE and DDL are controlled by database privileges at deployment (the application role is not the
table owner there); a TRUNCATE trigger is deliberately not used because it would also block the test
framework's table flushing.
"""

from django.db import migrations

CREATE = """
CREATE OR REPLACE FUNCTION upnext_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_auditevent_append_only BEFORE UPDATE OR DELETE ON audit_auditevent
    FOR EACH ROW EXECUTE FUNCTION upnext_append_only();
"""
DROP = """
DROP TRIGGER IF EXISTS audit_auditevent_append_only ON audit_auditevent;
DROP FUNCTION IF EXISTS upnext_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]
    operations = [migrations.RunSQL(CREATE, DROP)]
