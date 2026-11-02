"""Data step for D-62: carry the old verification levels over to the single switch, and register every image a
revision already uses in the Media Library. Nothing is deleted: `VerificationRecord` rows and image files stay."""

from __future__ import annotations

import hashlib

from django.core.files.storage import default_storage
from django.db import migrations


def forwards(apps, schema_editor):  # type: ignore[no-untyped-def]
    Opportunity = apps.get_model("opportunities", "Opportunity")
    Record = apps.get_model("opportunities", "VerificationRecord")
    Version = apps.get_model("opportunities", "OpportunityVersion")
    Asset = apps.get_model("opportunities", "MediaAsset")

    # "Verified with the issuer" is the only level that meant a confirmed listing; "source checked" was a weaker
    # claim that staff can no longer set, so those listings read Not Verified from now on (records are kept).
    for opp in Opportunity.objects.filter(verification_level="issuer_verified"):
        latest = (
            Record.objects.filter(opportunity=opp, level="issuer_verified", outcome="confirmed")
            .order_by("-checked_at")
            .first()
        )
        opp.is_verified = True
        opp.verification_changed_at = opp.verification_checked_at or (latest.checked_at if latest else None)
        opp.verification_changed_by_id = latest.checked_by_id if latest else None
        opp.save(update_fields=["is_verified", "verification_changed_at", "verification_changed_by"])
    Opportunity.objects.filter(verification_level="source_checked").update(
        verification_level="not_verified", verification_checked_at=None
    )

    names: set[str] = set()
    for column in ("featured_image", "social_image"):
        names |= set(
            Version.objects.filter(**{f"{column}__isnull": False})
            .exclude(**{column: ""})
            .values_list(column, flat=True)
            .distinct()
        )
    for name in sorted(names):
        if Asset.objects.filter(name=name).exists():
            continue
        digest, size = "", None
        try:
            with default_storage.open(name, "rb") as handle:
                data = handle.read()
            digest, size = hashlib.sha256(data).hexdigest(), len(data)
        except OSError:  # a missing file still gets its row, so no revision is left pointing at nothing known
            pass
        Asset.objects.create(name=name, title="Earlier upload", content_hash=digest, byte_size=size)


def backwards(apps, schema_editor):  # type: ignore[no-untyped-def]
    # The switch and the library rows are additive; the old columns were never changed except for the
    # source-checked level, which cannot be restored from here (the records still hold it).
    apps.get_model("opportunities", "MediaAsset").objects.filter(title="Earlier upload").delete()
    apps.get_model("opportunities", "Opportunity").objects.update(
        is_verified=False, verification_changed_at=None, verification_changed_by=None
    )


class Migration(migrations.Migration):
    dependencies = [("opportunities", "0010_media_library_and_verification")]
    operations = [migrations.RunPython(forwards, backwards)]
