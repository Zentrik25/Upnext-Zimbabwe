"""Reading, changing, resetting and deleting a seeker profile (all scoped to one account).

Every function takes the account explicitly and never looks anyone else up, so there is no code path from a
request to another person's profile. Validated input arrives as plain values from the serializer.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction

from accounts.models import User
from audit import services as audit
from audit.models import Severity
from catalog.models import Category, Location, Sector, Skill

from .models import SeekerProfile

# Keys that are about the person (kept by "reset preferences") and keys that are preferences (cleared by it).
ABOUT_FIELDS = ("home_location", "highest_qualification", "experience_level", "skills")
PREFERENCE_FIELDS = ("categories", "sectors", "preferred_locations", "employment_types", "work_arrangements")
ALL_FIELDS = (*ABOUT_FIELDS, *PREFERENCE_FIELDS)
TOTAL_FIELDS = len(ALL_FIELDS)


def get(user: User) -> SeekerProfile | None:
    return (
        SeekerProfile.objects.filter(user=user)
        .select_related("home_location")
        .prefetch_related("categories", "sectors", "preferred_locations", "skills")
        .first()
    )


def filled_fields(profile: SeekerProfile | None) -> list[str]:
    if profile is None:
        return []
    values: dict[str, Any] = {
        "home_location": profile.home_location_id,
        "highest_qualification": profile.highest_qualification,
        "experience_level": profile.experience_level,
        "skills": profile.skills.all(),
        "categories": profile.categories.all(),
        "sectors": profile.sectors.all(),
        "preferred_locations": profile.preferred_locations.all(),
        "employment_types": profile.employment_types,
        "work_arrangements": profile.work_arrangements,
    }
    return [name for name in ALL_FIELDS if values[name]]


def _apply(profile: SeekerProfile, data: dict[str, Any]) -> None:
    scalar = {"highest_qualification", "experience_level", "employment_types", "work_arrangements"}
    for name in scalar & data.keys():
        setattr(profile, name, data[name])
    if "home_location" in data:
        profile.home_location = data["home_location"]
    profile.save()
    if "categories" in data:
        profile.categories.set(data["categories"])
    if "sectors" in data:
        profile.sectors.set(data["sectors"])
    if "preferred_locations" in data:
        profile.preferred_locations.set(data["preferred_locations"])
    if "skills" in data:
        profile.skills.set(data["skills"])


def update(user: User, data: dict[str, Any]) -> SeekerProfile:
    """Partial update: keys present are replaced (lists replace, null clears), keys absent are unchanged.
    `data` holds model instances for taxonomy fields (the serializer resolved and validated them)."""
    with transaction.atomic():
        User.objects.select_for_update().get(pk=user.pk)  # serialise this person's edits
        profile, _ = SeekerProfile.objects.get_or_create(user=user)
        _apply(profile, data)
        audit.record(
            action="profile.updated",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.INFO,
            changes={"fields": sorted(data)},  # which parts changed, never their values
        )
    return get(user) or profile


def reset_preferences(user: User) -> SeekerProfile | None:
    """Clear the preference fields and keep the about-you fields."""
    with transaction.atomic():
        profile = SeekerProfile.objects.select_for_update().filter(user=user).first()
        if profile is None:
            return None
        profile.employment_types, profile.work_arrangements = [], []
        profile.save()
        profile.categories.clear()
        profile.sectors.clear()
        profile.preferred_locations.clear()
        audit.record(
            action="profile.preferences_reset",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
        )
    return get(user)


def delete(user: User, *, actor_id: uuid.UUID | None = None, record: bool = True) -> bool:
    """Remove the profile and everything in it. Returns False when there was none."""
    with transaction.atomic():
        deleted, _ = SeekerProfile.objects.filter(user=user).delete()
        if deleted and record:
            audit.record(
                action="profile.deleted",
                object_type="user",
                object_id=user.pk,
                actor_id=actor_id if actor_id is not None else user.pk,
            )
    return bool(deleted)


# --- lookups used by the serializer -------------------------------------------------------------
def active_categories(codes: list[str]) -> list[Category]:
    rows = {c.code: c for c in Category.objects.filter(active=True, code__in=codes)}
    return [rows[code] for code in codes if code in rows]


def active_sectors(ids: list[uuid.UUID]) -> list[Sector]:
    return list(Sector.objects.filter(active=True, pk__in=ids))


def active_locations(ids: list[uuid.UUID]) -> list[Location]:
    return list(Location.objects.filter(active=True, pk__in=ids))


def approved_skills(ids: list[uuid.UUID]) -> list[Skill]:
    return list(Skill.objects.filter(active=True, status="approved", pk__in=ids))
