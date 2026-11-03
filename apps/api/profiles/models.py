"""The optional, private jobseeker profile (Phase 6B, D-38, ADR-0023).

One row per account, holding taxonomy references and enums only: no free text, no contact detail, no
protected characteristic. It is read only through `/me/profile` by its owner and by the For You engine on
that owner's behalf. It is deliberately not registered in Django Admin.
"""

from __future__ import annotations

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.utils import timezone

from catalog.models import Category, Location, Sector, Skill
from opportunities.models import EmploymentType, ExperienceLevel, WorkMode


class Qualification(models.TextChoices):
    """Same vocabulary as the jobs detail schema's `minimum_qualification`, in ascending order."""

    O_LEVEL = "o_level"
    A_LEVEL = "a_level"
    CERTIFICATE = "certificate"
    DIPLOMA = "diploma"
    BACHELORS_DEGREE = "bachelors_degree"
    HONOURS_DEGREE = "honours_degree"
    MASTERS_DEGREE = "masters_degree"
    DOCTORATE = "doctorate"
    PROFESSIONAL_QUALIFICATION = "professional_qualification"


# Rank on the academic ladder. `professional_qualification` is not on it: it cannot be ordered against the
# others, so it is only ever compared for equality.
QUALIFICATION_RANK: dict[str, int] = {
    Qualification.O_LEVEL: 1,
    Qualification.A_LEVEL: 2,
    Qualification.CERTIFICATE: 3,
    Qualification.DIPLOMA: 4,
    Qualification.BACHELORS_DEGREE: 5,
    Qualification.HONOURS_DEGREE: 6,
    Qualification.MASTERS_DEGREE: 7,
    Qualification.DOCTORATE: 8,
}

MAX_CATEGORIES, MAX_SECTORS, MAX_LOCATIONS, MAX_SKILLS = 6, 10, 10, 30


class SeekerProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField("accounts.User", on_delete=models.CASCADE, related_name="seeker_profile")
    home_location = models.ForeignKey(
        Location, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )  # a city or province
    highest_qualification = models.CharField(
        max_length=32, choices=Qualification.choices, null=True, blank=True
    )
    experience_level = models.CharField(max_length=12, choices=ExperienceLevel.choices, null=True, blank=True)
    categories = models.ManyToManyField(Category, blank=True, related_name="+")
    sectors = models.ManyToManyField(Sector, blank=True, related_name="+")
    preferred_locations = models.ManyToManyField(Location, blank=True, related_name="+")
    skills = models.ManyToManyField(Skill, blank=True, related_name="+")
    employment_types = ArrayField(
        models.CharField(max_length=12, choices=EmploymentType.choices), default=list, blank=True, size=6
    )
    work_arrangements = ArrayField(
        models.CharField(max_length=10, choices=WorkMode.choices), default=list, blank=True, size=3
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return str(self.user_id)
