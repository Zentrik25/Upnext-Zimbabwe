"""Reference data the system cannot work without: the six categories (D-01) and their detail schemas.

Ids are deterministic (uuid5) so every environment shares them. Version 1 of each schema is the Phase 0
draft, active but pending owner approval of the field lists (OQ-06, P2-07).
"""

import hashlib
import uuid
from pathlib import Path

from django.db import migrations
from django.utils import timezone

NAMESPACE = uuid.UUID("6f1c1c0e-6d0d-4b8e-9a54-2f3d5d1f6a10")
SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schemas"
CATEGORIES = [
    ("jobs", "Jobs"),
    ("internships", "Internships"),
    ("graduate-programmes", "Graduate programmes"),
    ("scholarships", "Scholarships"),
    ("tenders", "Tenders"),
    ("grants", "Grants"),
]


def seed(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    DetailSchema = apps.get_model("catalog", "DetailSchema")
    for order, (code, name) in enumerate(CATEGORIES, start=1):
        category, _ = Category.objects.get_or_create(
            code=code,
            defaults={
                "id": uuid.uuid5(NAMESPACE, f"category:{code}"),
                "name": name,
                "detail_schema_key": code,
                "sort_order": order,
            },
        )
        digest = hashlib.sha256((SCHEMA_DIR / code / "v1.json").read_bytes()).digest()
        DetailSchema.objects.get_or_create(
            category=category,
            version=1,
            defaults={"schema_sha256": digest, "status": "active", "activated_at": timezone.now()},
        )


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
