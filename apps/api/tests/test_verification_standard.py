"""The verification standard (D-75, owner decision 2026-11-14): Verified needs a method, an evidence note, a recorded
source and an independent checker; it is kept as a verification record; listings Verified before the standard are
flagged for re-verification, never certified automatically, and say so publicly."""

from __future__ import annotations

import importlib

import pytest
from django.apps import apps
from rest_framework.test import APIClient

from accounts.models import User
from opportunities import workflow
from opportunities.errors import SeparationOfDuties, ValidationFailed
from opportunities.models import (
    Opportunity,
    OpportunitySource,
    VerificationLevel,
    VerificationRecord,
)
from tests.factories import STANDARD, World, new_draft, published, varied

from .test_staff_api import S, signed_in

pytestmark = pytest.mark.django_db

flag_verified = importlib.import_module("opportunities.migrations.0012_verification_standard").flag_verified


def _legacy_verified(opp: Opportunity) -> None:
    """A listing marked with the old single switch (D-62): Verified, no record, as production holds today."""
    Opportunity.objects.filter(pk=opp.pk).update(
        is_verified=True, verification_level=VerificationLevel.ISSUER_VERIFIED
    )
    flag_verified(apps, None)
    opp.refresh_from_db()


def test_verifying_without_method_or_evidence_is_refused_and_changes_nothing(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    with pytest.raises(ValidationFailed) as refused:
        workflow.set_verification(people["editor2"], opp.pk, verified=True)
    assert set(refused.value.fields) == {"method", "evidence"}
    with pytest.raises(ValidationFailed) as short:
        workflow.set_verification(
            people["editor2"], opp.pk, verified=True, method="issuer_contact", evidence="ok"
        )
    assert set(short.value.fields) == {"evidence"}
    with pytest.raises(ValidationFailed) as unknown:
        workflow.set_verification(
            people["editor2"], opp.pk, verified=True, method="looked_at_it", evidence=STANDARD["evidence"]
        )
    assert set(unknown.value.fields) == {"method"}
    opp.refresh_from_db()
    assert not opp.is_verified and not VerificationRecord.objects.filter(opportunity=opp).exists()


def test_a_listing_without_a_recorded_source_cannot_be_verified(
    world: World, people: dict[str, User]
) -> None:
    # A draft can be verified (D-62); without a recorded source it may not be (D-75). Published revisions are
    # frozen, so the case is built on a draft written without a source.
    opp = new_draft(world, people["author"], sources=[])
    assert not OpportunitySource.objects.filter(opportunity=opp).exists()
    with pytest.raises(ValidationFailed) as refused:
        workflow.set_verification(people["editor2"], opp.pk, verified=True, **STANDARD)
    assert set(refused.value.fields) == {"sources"}


def test_employer_account_is_only_for_listings_from_the_employer_portal(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    with pytest.raises(ValidationFailed) as refused:
        workflow.set_verification(
            people["editor2"], opp.pk, verified=True, method="employer_account", evidence=STANDARD["evidence"]
        )
    assert set(refused.value.fields) == {"method"}


def test_a_verification_is_recorded_with_method_evidence_and_checker(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    workflow.set_verification(people["editor2"], opp.pk, verified=True, **STANDARD)
    record = VerificationRecord.objects.get(opportunity=opp)
    assert record.method == "issuer_contact" and record.outcome == "confirmed"
    assert record.evidence_note == STANDARD["evidence"] and record.checked_by_id == people["editor2"].pk
    shown = APIClient().get(f"/api/v1/opportunities/{opp.slug}").json()["verification"]
    assert shown == {
        "level": "issuer_verified",
        "reverification_pending": False,
        "checked_at": shown["checked_at"],
        "method": "issuer_contact",
    }
    assert shown["checked_at"]
    # Already Verified under the standard: asking again writes nothing.
    workflow.set_verification(people["editor2"], opp.pk, verified=True, **STANDARD)
    assert VerificationRecord.objects.filter(opportunity=opp).count() == 1


def test_the_author_or_submitter_cannot_verify(world: World, people: dict[str, User]) -> None:
    opp = new_draft(world, people["editor"])
    with pytest.raises(SeparationOfDuties):
        workflow.set_verification(people["editor"], opp.pk, verified=True, **STANDARD)
    assert not VerificationRecord.objects.filter(opportunity=opp).exists()


def test_the_migration_flags_every_verified_listing_and_only_those(
    world: World, people: dict[str, User]
) -> None:
    old = published(world, people["author"], people["editor"])
    other = published(world, people["author"], people["editor"], **varied(world, "jobs-1", "b"))
    _legacy_verified(old)
    other.refresh_from_db()
    assert old.is_verified and old.reverification_required
    assert not other.is_verified and not other.reverification_required


def test_a_flagged_listing_keeps_its_label_but_claims_no_check_until_re_verified(
    world: World, people: dict[str, User]
) -> None:
    opp = published(world, people["author"], people["editor"])
    _legacy_verified(opp)
    public = APIClient()
    shown = public.get(f"/api/v1/opportunities/{opp.slug}").json()["verification"]
    assert shown == {
        "level": "issuer_verified",
        "reverification_pending": True,
        "checked_at": None,
        "method": None,
    }
    listed = [r for r in public.get("/api/v1/opportunities").json()["data"] if r["slug"] == opp.slug]
    assert listed[0]["verification"]["reverification_pending"] is True
    row = signed_in(people["editor"]).get(f"{S}/opportunities/{opp.pk}").json()
    assert row["reverification_required"] is True
    # Not certified automatically: a re-verification without evidence is refused and the flag stays.
    with pytest.raises(ValidationFailed):
        workflow.set_verification(people["editor2"], opp.pk, verified=True)
    opp.refresh_from_db()
    assert opp.reverification_required
    # Re-verified under the standard: one record, flag cleared, the method shown.
    workflow.set_verification(people["editor2"], opp.pk, verified=True, **STANDARD)
    opp.refresh_from_db()
    assert opp.is_verified and not opp.reverification_required
    assert VerificationRecord.objects.filter(opportunity=opp).count() == 1
    assert (
        public.get(f"/api/v1/opportunities/{opp.slug}").json()["verification"]["method"] == "issuer_contact"
    )


def test_unverifying_a_flagged_listing_clears_the_flag(world: World, people: dict[str, User]) -> None:
    opp = published(world, people["author"], people["editor"])
    _legacy_verified(opp)
    workflow.set_verification(people["editor2"], opp.pk, verified=False)
    opp.refresh_from_db()
    assert not opp.is_verified and not opp.reverification_required


def test_the_staff_api_passes_method_and_evidence_and_returns_field_errors(
    world: World, people: dict[str, User]
) -> None:
    from .conftest import csrf

    opp = published(world, people["author"], people["editor"])
    client = signed_in(people["editor2"])

    def put(body: dict[str, object]):  # type: ignore[no-untyped-def]
        return client.put(
            f"{S}/opportunities/{opp.pk}/verification", body, format="json", HTTP_X_CSRFTOKEN=csrf(client)
        )

    refused = put({"verified": True})
    assert refused.status_code == 400
    assert {"method", "evidence"} <= set(refused.json()["error"]["fields"])
    assert put({"verified": True, "method": 3, "evidence": STANDARD["evidence"]}).status_code == 400
    ok = put({"verified": True, **STANDARD})
    assert ok.status_code == 200 and ok.json()["verified"] is True
    assert ok.json()["reverification_required"] is False
