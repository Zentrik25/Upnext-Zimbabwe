from django.db import migrations

TABLES = [
    "catalog_category",
    "catalog_location",
    "catalog_sector",
    "catalog_skill",
    "catalog_organisation",
    "catalog_detailschema",
]


class Migration(migrations.Migration):
    dependencies = [("catalog", "0002_seed_categories_and_schemas"), ("core", "0002_id_immutability_function")]
    operations = [
        migrations.RunSQL(
            f"CREATE TRIGGER {t}_id_immutable BEFORE UPDATE ON {t} "
            "FOR EACH ROW EXECUTE FUNCTION upnext_prevent_id_update();",
            f"DROP TRIGGER IF EXISTS {t}_id_immutable ON {t};",
        )
        for t in TABLES
    ]
