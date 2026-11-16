"""Duplicate detection (P2-09, D-62): is this the same vacancy as one that is already open?

The test is the organisation, the normalised job title and the listing's own details. Sharing an
organisation, a website, an application e-mail address or a source address says nothing: one employer
routinely advertises several different jobs through the same address, and those are separate vacancies.

"The same organisation" is the same employer, not the same database row: two organisation records with the
same name ("TotalEnergies Marketing Zimbabwe" and "TotalEnergies Marketing Zimbabwe (Private) Limited") are
compared as one. On the live site (2026-11-16) one vacancy was public twice because each copy hung from its
own record.

* `hard`: same organisation and category, the same job title once normalised, and no clear difference in
  place, closing date or reference. This needs one confirmation before it is submitted or published. A place
  written more or less precisely ("Harare" and "Harare, Zimbabwe", or "Eastlea, Harare") is not a difference.
* `soft`: a similar title, or the same title with a clearly different place, date or reference. This is
  shown as a warning and never blocks.

Only listings still open (in review, approved or live, not past their closing date) are compared, so a vacancy
advertised again next year is new.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from difflib import SequenceMatcher

from django.utils import timezone

from catalog.models import Organisation

from .models import ListingStatus, OpportunityVersion, VersionState

LIVE_OR_PIPELINE = (VersionState.IN_REVIEW, VersionState.APPROVED, VersionState.PUBLISHED)
OPEN_STATUSES = (ListingStatus.IN_REVIEW, ListingStatus.APPROVED, ListingStatus.PUBLISHED)
SIMILAR_RATIO = 0.85
_FILLER = frozenset({"vacancy", "vacancies", "urgent", "wanted", "required", "needed", "hiring", "position"})
_NON_WORD = re.compile(r"[^a-z0-9]+")
# Legal forms and the country say nothing about which employer or which place is meant.
_LEGAL_FORM = frozenset({"private", "pvt", "pty", "limited", "ltd", "plc", "inc", "incorporated", "the"})
_COUNTRY = frozenset({"zimbabwe"})


@dataclass(frozen=True)
class Duplicate:
    opportunity_id: str
    level: str  # "hard" | "soft"
    reason: str
    title: str = ""
    status: str = ""


def normalise_title(title: str | None) -> str:
    """Lower case, no accents or punctuation, no filler words, and singular endings folded ("Controllers" and
    "controller" match), so two spellings of one title compare equal."""
    text = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode().lower()
    words = [w for w in _NON_WORD.split(text) if w and w not in _FILLER]
    return " ".join(w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words)


def _plain(value: str | None) -> str:
    return " ".join(_NON_WORD.split(unicodedata.normalize("NFKD", value or "").lower())).strip()


def _differs(a: str, b: str) -> bool:
    return bool(a) and bool(b) and a != b


def organisation_key(name: str | None) -> str:
    """One employer under its different spellings: no case, accents, punctuation or legal form. A bracketed
    abbreviation after the name ("... Foundation (ACBF)") is kept: it is part of how the employer is known."""
    words = [w for w in _plain(name).split() if w not in _LEGAL_FORM]
    return " ".join(words)


def _same_employer_ids(version: OpportunityVersion) -> list[uuid.UUID]:
    """The listing's organisation and every other live record that names the same employer."""
    mine = organisation_key(version.organisation.name)
    ids: list[uuid.UUID] = [version.organisation_id]
    if not mine:
        return ids
    first = mine.split()[0]
    others = Organisation.objects.filter(merged_into__isnull=True, name_normalized__contains=first).exclude(
        pk=version.organisation_id
    )
    ids.extend(o.pk for o in others if organisation_key(o.name) == mine)
    return ids


def _places_differ(a: str | None, b: str | None) -> bool:
    """Two stated places that cannot be the same one. "Harare" against "Harare, Zimbabwe" or "Eastlea,
    Harare" is the same place written more or less precisely; the country alone states no place at all."""
    mine = set(_plain(a).split()) - _COUNTRY
    theirs = set(_plain(b).split()) - _COUNTRY
    if not mine or not theirs:
        return False
    return not (mine <= theirs or theirs <= mine)


def _difference(mine: OpportunityVersion, other: OpportunityVersion) -> str | None:
    """What clearly tells two same-titled listings apart, or None when nothing does."""
    if _places_differ(mine.location_text, other.location_text):
        return "a different location"
    if _differs(
        (mine.reference_number or "").strip().lower(), (other.reference_number or "").strip().lower()
    ):
        return "a different reference number"
    if mine.deadline_at and other.deadline_at and mine.deadline_at.date() != other.deadline_at.date():
        return "a different closing date"
    return None


def find_duplicates(version: OpportunityVersion) -> list[Duplicate]:
    mine = normalise_title(version.title)
    if not mine:
        return []
    now = timezone.now()
    candidates = (
        OpportunityVersion.objects.filter(
            state__in=LIVE_OR_PIPELINE,
            organisation_id__in=_same_employer_ids(version),
            opportunity__category_id=version.opportunity.category_id,
            opportunity__status__in=OPEN_STATUSES,
        )
        .exclude(opportunity_id=version.opportunity_id)
        .select_related("opportunity")
    )
    found: dict[str, Duplicate] = {}
    for other in candidates:
        if other.deadline_at is not None and other.deadline_at < now:
            continue
        theirs = normalise_title(other.title)
        if not theirs:
            continue
        same = mine == theirs
        if not same and SequenceMatcher(None, mine, theirs).ratio() < SIMILAR_RATIO:
            continue
        difference = _difference(version, other)
        key = str(other.opportunity_id)
        status = other.opportunity.status
        if difference is None and same:
            found[key] = Duplicate(key, "hard", "Same organisation and job title.", other.title, status)
        elif difference is None:
            found.setdefault(key, Duplicate(key, "soft", "A similar job title.", other.title, status))
        elif same:
            reason = f"Same job title with {difference}."
            found.setdefault(key, Duplicate(key, "soft", reason, other.title, status))
    return list(found.values())
