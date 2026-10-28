from django.db import migrations

# The history of a report is evidence of what staff did: it can be added to, never changed or removed
# (the same function and rule as the audit log).
class Migration(migrations.Migration):
    dependencies = [("reports", "0001_initial"), ("audit", "0002_append_only")]
    operations = [
        migrations.RunSQL(
            sql="""
CREATE TRIGGER reports_reportevent_append_only BEFORE UPDATE OR DELETE ON reports_reportevent
    FOR EACH ROW EXECUTE FUNCTION upnext_append_only();
""",
            reverse_sql="DROP TRIGGER IF EXISTS reports_reportevent_append_only ON reports_reportevent;",
        )
    ]
