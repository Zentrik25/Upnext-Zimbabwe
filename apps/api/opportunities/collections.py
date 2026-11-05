"""Named collections of open listings behind the organic landing pages (`/jobs/<slug>`, D-68).

A collection is a fixed, reviewed filter over facts staff record on every listing: its category, its places,
its sectors, its experience level and the words of its title. Nothing is guessed or scored, so a visitor who
opens a listing from "Jobs in Harare" finds a listing that says Harare. The filters only narrow
`public.visible_versions` (the one entry point to public data), so a collection can never show a draft, a
closed or an archived listing.

Every collection holds employment listings only (jobs, internships, graduate programmes): tenders,
scholarships and grants are not "jobs" and stay on their own category lists. Whether a landing page is
offered to search engines is decided by the web app from the count this module reports (an almost empty
collection is `noindex`), never here.

The former "graduate-trainee" collection was consolidated into the graduate programmes category list (D-69):
the web app redirects `/jobs/graduate-trainee` there. Adding a collection is a product decision: the web app
needs its copy (`apps/web/src/lib/landing-pages.ts`) and the decision register an entry. Keep the slugs in
step with that file; a test on each side pins the list."""

from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Q

from catalog.models import Location

EMPLOYMENT_CATEGORIES = ("jobs", "internships", "graduate-programmes")


def _employment() -> Q:
    return Q(opportunity__category__code__in=EMPLOYMENT_CATEGORIES)


def _in_city(city: str, province: str) -> Q:
    """Listings placed in the city (or a place inside it) or at the level of its own metropolitan province:
    Harare and Bulawayo are both cities and provinces: a notice for "Harare Province" is one for Harare."""
    places = Location.objects.filter(Q(slug=city) | Q(parent__slug=city) | Q(slug=province)).values("pk")
    return Q(locations__location__in=places)


def _sector_or_title(sector: str, title_pattern: str) -> Q:
    """Tagged with the sector, or titled with one of the words (PostgreSQL word boundaries, any case)."""
    return Q(sectors__sector__slug=sector) | Q(title__iregex=title_pattern)


@dataclass(frozen=True)
class Collection:
    slug: str
    description: str  # what it holds, in plain words (documentation and the staff-facing schema only)

    def condition(self) -> Q:
        return _employment() & _CONDITIONS[self.slug]()


_CONDITIONS = {
    "harare": lambda: _in_city("harare", "harare-province"),
    "bulawayo": lambda: _in_city("bulawayo", "bulawayo-province"),
    "engineering": lambda: _sector_or_title("engineering", r"\mengineer(s|ing)?\M"),
    "finance-and-accounting": lambda: _sector_or_title("finance", r"\maccount(s|ant|ants|ancy|ing)\M"),
    "ngo": lambda: Q(sectors__sector__slug="ngo"),
}

COLLECTIONS: dict[str, Collection] = {
    c.slug: c
    for c in (
        Collection("harare", "Employment listings placed in Harare or Harare Province."),
        Collection("bulawayo", "Employment listings placed in Bulawayo or Bulawayo Province."),
        Collection(
            "engineering", "Employment listings in the Engineering sector or titled engineer/engineering."
        ),
        Collection(
            "finance-and-accounting",
            "Employment listings in the Finance and banking sector or titled accounts/accountant/accounting.",
        ),
        Collection("ngo", "Employment listings in the NGO and development sector."),
    )
}
assert set(COLLECTIONS) == set(_CONDITIONS)
