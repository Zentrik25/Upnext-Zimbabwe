"""`rules-v1`: deterministic, explainable recommendations from a seeker profile (Phase 6B, D-38).

The specification is `docs/engineering/RECOMMENDATION_SPEC.md`; this module is its only implementation.

* Candidates are the public, still-open listings from `visible_versions` (published live revision, deadline
  not passed). Nothing else is reachable from here, so unpublished, rejected, closed and expired listings
  cannot appear.
* A listing is recommended only if at least one **positive signal** matches: category, industry, skills,
  location, work arrangement, employment type, experience level, or a qualification level equal to the
  listing's stated minimum. A missing value on either side is never a match and never an exclusion.
* There is no numeric score. Order: number of matching signals, then number of matching skills, then the
  earlier closing date (no deadline last), then the newer listing, then the id. Every sentence shown to the
  person is produced by the signal that ranked the listing.
* Nothing is inferred from behaviour (views, saves, searches) and no protected characteristic exists in the
  profile or is read from the listing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from django.db.models import Q, QuerySet

from catalog.models import Location
from catalog.places import with_descendants
from opportunities import public
from opportunities.models import EmploymentType, ExperienceLevel, OpportunityVersion, WorkMode

from .models import QUALIFICATION_RANK, SeekerProfile
from .service import filled_fields

MODEL_VERSION = "rules-v1"
CANDIDATE_CAP = 500  # newest open listings considered; documented in the specification
MAX_UNKNOWNS = 3
EMPLOYMENT_CATEGORIES = frozenset({"jobs", "internships", "graduate-programmes"})
SIGNALS = (
    "category_interest",
    "sector_interest",
    "skills",
    "location",
    "work_arrangement",
    "employment_type",
    "experience",
    "education",
)

WORK_LABEL = dict(WorkMode.choices)
EMPLOYMENT_LABEL = dict(EmploymentType.choices)
EXPERIENCE_LABEL = dict(ExperienceLevel.choices)
QUALIFICATION_LABEL = {
    "o_level": "O Level",
    "a_level": "A Level",
    "certificate": "Certificate",
    "diploma": "Diploma",
    "bachelors_degree": "Bachelor's degree",
    "honours_degree": "Honours degree",
    "masters_degree": "Master's degree",
    "doctorate": "Doctorate",
    "professional_qualification": "Professional qualification",
}


@dataclass(frozen=True)
class Note:
    signal: str
    text: str


@dataclass
class Match:
    version: OpportunityVersion
    reasons: list[Note] = field(default_factory=list)
    unknowns: list[Note] = field(default_factory=list)
    notes: list[Note] = field(default_factory=list)
    skill_overlap: int = 0

    @property
    def signal_count(self) -> int:
        return len(self.reasons)


@dataclass
class Result:
    mode: str  # "matched" or "newest"
    matches: list[Match]
    fields_filled: int
    suggestions: list[Note]


def _candidates(now: datetime, category: str | None, location: str | None) -> QuerySet[OpportunityVersion]:
    qs = public.visible_versions().filter(Q(deadline_at__isnull=True) | Q(deadline_at__gt=now))
    if category:
        qs = qs.filter(opportunity__category__code=category)
    if location:
        wanted = Location.objects.filter(
            Q(slug=location) | Q(parent__slug=location) | Q(parent__parent__slug=location)
        ).values("pk")
        qs = qs.filter(locations__location__in=wanted).distinct()
    return qs.order_by("-opportunity__first_published_at", "-opportunity__slug").prefetch_related(
        "locations__location", "skills__skill", "sectors__sector", "sources"
    )[:CANDIDATE_CAP]


def _join(names: list[str], limit: int = 3) -> str:
    shown = names[:limit]
    extra = len(names) - len(shown)
    return ", ".join(shown) + (f" and {extra} more" if extra > 0 else "")


@dataclass
class _Preferences:
    categories: set[str]
    sectors: set[Any]
    skills: set[Any]
    employment_types: set[str]
    work_arrangements: set[str]
    experience: str | None
    qualification: str | None
    preferred_places: set[Any]
    home_places: set[Any]


def _preferences(profile: SeekerProfile) -> _Preferences:
    preferred = {loc.pk for loc in profile.preferred_locations.all()}
    home = {profile.home_location_id} if profile.home_location_id else set()
    return _Preferences(
        categories={c.code for c in profile.categories.all()},
        sectors={s.pk for s in profile.sectors.all()},
        skills={s.pk for s in profile.skills.all()},
        employment_types=set(profile.employment_types),
        work_arrangements=set(profile.work_arrangements),
        experience=profile.experience_level,
        qualification=profile.highest_qualification,
        preferred_places=with_descendants(preferred),
        home_places=with_descendants(home),
    )


def explain(version: OpportunityVersion, prefs: _Preferences) -> Match:
    """Compare one listing with the preferences. Pure: no query beyond the prefetched relations."""
    match = Match(version)
    reasons = match.reasons
    category = version.opportunity.category
    if category.code in prefs.categories:
        reasons.append(Note("category_interest", f"Matches your interest in {category.name}."))

    sector_names = sorted(r.sector.name for r in version.sectors.all() if r.sector_id in prefs.sectors)
    if sector_names:
        reasons.append(Note("sector_interest", f"In an industry you follow: {_join(sector_names)}."))

    skill_names = sorted(r.skill.name for r in version.skills.all() if r.skill_id in prefs.skills)
    if skill_names:
        match.skill_overlap = len(skill_names)
        reasons.append(Note("skills", f"Lists skills from your profile: {_join(skill_names)}."))

    places = sorted(version.locations.all(), key=lambda r: (not r.is_primary, r.location.name))
    preferred = next((r.location for r in places if r.location_id in prefs.preferred_places), None)
    home = next((r.location for r in places if r.location_id in prefs.home_places), None)
    if preferred is not None:
        reasons.append(Note("location", f"Located in {preferred.name}, one of your preferred places."))
    elif home is not None:
        reasons.append(Note("location", f"Located in {home.name}, where your profile says you are based."))

    if version.work_mode and version.work_mode in prefs.work_arrangements:
        label = WORK_LABEL[version.work_mode].lower()
        reasons.append(Note("work_arrangement", f"Offers {label} work, which you prefer."))

    if version.employment_type and version.employment_type in prefs.employment_types:
        label = EMPLOYMENT_LABEL[version.employment_type].lower()
        reasons.append(Note("employment_type", f"Employment type: {label}, one you chose."))

    if version.experience_level and version.experience_level == prefs.experience:
        label = EXPERIENCE_LABEL[version.experience_level].lower()
        reasons.append(Note("experience", f"States an experience level of {label}, as in your profile."))

    _compare_qualification(match, version, prefs)
    _unknowns(match, version, prefs, category.code)
    return match


def _compare_qualification(match: Match, version: OpportunityVersion, prefs: _Preferences) -> None:
    stated = (version.detail or {}).get("minimum_qualification")
    mine = prefs.qualification
    if not mine or not stated or stated == "not_stated" or stated not in QUALIFICATION_LABEL:
        return
    label = QUALIFICATION_LABEL[stated]
    if stated == mine:
        match.reasons.append(
            Note("education", f"Lists a minimum of {label}, the same level as your profile.")
        )
        return
    stated_rank, my_rank = QUALIFICATION_RANK.get(stated), QUALIFICATION_RANK.get(mine)
    if stated_rank is not None and my_rank is not None and stated_rank > my_rank:
        match.notes.append(Note("education", f"Lists a minimum of {label}, above the level in your profile."))


def _unknowns(match: Match, version: OpportunityVersion, prefs: _Preferences, category_code: str) -> None:
    """Things the person told us that this listing does not state. Never treated as satisfied."""
    if category_code not in EMPLOYMENT_CATEGORIES:
        return
    found = match.unknowns
    if prefs.experience and not version.experience_level:
        found.append(Note("experience", "The listing does not state an experience level."))
    stated = (version.detail or {}).get("minimum_qualification")
    if prefs.qualification and (not stated or stated == "not_stated"):
        found.append(Note("education", "The listing does not state a minimum qualification."))
    if prefs.skills and not version.skills.all():
        found.append(Note("skills", "The listing does not list skills."))
    if prefs.work_arrangements and not version.work_mode:
        found.append(Note("work_arrangement", "The listing does not state where the work is done."))
    del found[MAX_UNKNOWNS:]


def _order_key(match: Match) -> tuple[Any, ...]:
    version = match.version
    opportunity = version.opportunity
    assert opportunity.first_published_at is not None
    return (
        -match.signal_count,
        -match.skill_overlap,
        0 if version.deadline_at else 1,  # listings without a stated deadline come after those with one
        version.deadline_at.timestamp() if version.deadline_at else 0.0,
        -opportunity.first_published_at.timestamp(),
        str(opportunity.pk),
    )


def _suggestions(profile: SeekerProfile | None) -> list[Note]:
    have = set(filled_fields(profile))
    out: list[Note] = []
    if not ({"categories", "sectors"} & have):
        out.append(Note("interests", "Choose the categories or industries you want to see."))
    if "skills" not in have:
        out.append(Note("skills", "Add your skills to find listings that ask for them."))
    if not ({"preferred_locations", "home_location"} & have):
        out.append(Note("location", "Add where you want to work."))
    if "experience_level" not in have:
        out.append(Note("experience", "Add your experience level."))
    return out[:3]


def recommend(
    profile: SeekerProfile | None,
    now: datetime,
    *,
    category: str | None = None,
    location: str | None = None,
) -> Result:
    """The full ranked list (at most `CANDIDATE_CAP` candidates are looked at); callers page through it."""
    versions = list(_candidates(now, category, location))
    seen: set[tuple[Any, str]] = set()
    unique: list[OpportunityVersion] = []
    for version in versions:  # one listing per revision already; this also folds re-posted duplicates
        key = (version.organisation_id, version.title.strip().casefold())
        if key not in seen:
            seen.add(key)
            unique.append(version)
    filled = len(filled_fields(profile))
    if profile is not None and filled:
        prefs = _preferences(profile)
        matches = [m for m in (explain(v, prefs) for v in unique) if m.reasons]
        if matches:
            matches.sort(key=_order_key)
            return Result("matched", matches, filled, _suggestions(profile))
    return Result("newest", [Match(v) for v in unique], filled, _suggestions(profile))
