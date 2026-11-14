"""Verification standard (D-75, owner decision 2026-11-14).

Adds the `employer_account` method and the `reverification_required` flag, then flags every listing that is
Verified today: those were marked with the single switch of D-62, which recorded no method or evidence, so they
are not certified against the new standard. The flag changes no label and no other column; an editor clears it
only by verifying the listing again with a method and evidence (or by unverifying it). Nothing is deleted.
"""

from django.db import migrations, models


def flag_verified(apps, schema_editor):  # type: ignore[no-untyped-def]
    Opportunity = apps.get_model("opportunities", "Opportunity")
    Opportunity.objects.filter(is_verified=True).update(reverification_required=True)


class Migration(migrations.Migration):
    dependencies = [
        ("opportunities", "0011_backfill_verification_and_media"),
    ]

    operations = [
        migrations.AddField(
            model_name="opportunity",
            name="reverification_required",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="verificationrecord",
            name="method",
            field=models.CharField(
                choices=[
                    ("source_page_review", "Source Page Review"),
                    ("document_review", "Document Review"),
                    ("issuer_contact", "Issuer Contact"),
                    ("employer_account", "Employer Account"),
                ],
                max_length=20,
            ),
        ),
        # Reversing removes the column, so the reverse data step has nothing to undo.
        migrations.RunPython(flag_verified, migrations.RunPython.noop),
    ]
