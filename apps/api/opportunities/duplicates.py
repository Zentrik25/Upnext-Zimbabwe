"""Duplicate detection (P2-09, VALIDATION_SPEC §6). Hard duplicates block submit unless acknowledged."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Q
from django.utils import timezone

from .models import ListingStatus, OpportunitySource, OpportunityVersion, VersionState

LIVE_OR_PIPELINE = (VersionState.IN_REVIEW, VersionState.APPROVED, VersionState.PUBLISHED)


@dataclass(frozen=True)
class Duplicate:
    opportunity_id: str
    level: str  # "hard" | "soft"
    reason: str


def find_duplicates(version: OpportunityVersion) -> list[Duplicate]:
    found: dict[str, Duplicate] = {}
    others = (
        OpportunityVersion.objects.filter(state__in=LIVE_OR_PIPELINE)
        .exclude(opportunity_id=version.opportunity_id)
        .exclude(opportunity__status=ListingStatus.ARCHIVED)
    )

    primary = version.sources.filter(is_primary=True).first()
    if primary is not None and primary.url:
        urls = OpportunitySource.objects.filter(url=primary.url, is_primary=True, version__in=others)
        for source in urls.select_related("version"):
            found.setdefault(
                str(source.opportunity_id),
                Duplicate(str(source.opportunity_id), "hard", "Same primary source address."),
            )
    if version.application_url:
        same_apply = others.filter(
            application_url=version.application_url, organisation_id=version.organisation_id
        )
        for same in same_apply:
            found.setdefault(
                str(same.opportunity_id),
                Duplicate(str(same.opportunity_id), "hard", "Same application address and organisation."),
            )

    since = timezone.now() - timedelta(days=90)
    similar = (
        others.filter(organisation_id=version.organisation_id, created_at__gte=since)
        .annotate(similarity=TrigramSimilarity("title", version.title))
        .filter(
            Q(similarity__gte=0.8)
            | Q(reference_number__isnull=False, reference_number=version.reference_number)
        )
    )
    for candidate in similar:
        found.setdefault(
            str(candidate.opportunity_id),
            Duplicate(
                str(candidate.opportunity_id), "soft", "Same organisation and a similar title or reference."
            ),
        )
    return list(found.values())
