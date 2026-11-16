"""Duplicate detection (P2-09, D-62): is this the same vacancy as one that is already open?

The test is the organisation, the normalised job title and the listing's own details. Sharing an
organisation, a website, an application e-mail address or a source address says nothing: one employer
routinely advertises several different jobs through the same address, and those are separate vacancies.

* `hard`: same organisation and category, the same job title once normalised, and no clear difference in
  place, closing date or reference. This needs one confirmation before it is submitted or published.
* `soft`: a similar title, or the same title with a clearly different place, date or reference. This is
  shown as a warning and never blocks.

Only listings still open (in review, approved or live, not past their closing date) are compared, so a vacancy
advertised again next year is new.

Issuer identifiers (D-79, DRAFT; AdSense audit 2026-11-16, which found two live pairs of the same vacancy):

* `identifier`: the same organisation's vacancy reference (job id, requisition or reference number, once
  normalised), or the same *specific* application or primary-source address (once tracking parameters are
  removed), in any category. This is the strongest signal there is, so it is `hard` whatever the title, place
  or date say. It needs the confirmation and is never published on one person's authority: another person
  reviews it (`workflow._validate_for_submission`, `publish_direct`). A generic address such as a careers home
  page or `/apply` identifies no vacancy and is ignored, as before.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.db import connection
from django.db.models import Q
from django.utils import timezone

from .models import ListingStatus, OpportunityVersion, VersionState

LIVE_OR_PIPELINE = (VersionState.IN_REVIEW, VersionState.APPROVED, VersionState.PUBLISHED)
OPEN_STATUSES = (ListingStatus.IN_REVIEW, ListingStatus.APPROVED, ListingStatus.PUBLISHED)
SIMILAR_RATIO = 0.85
_FILLER = frozenset({"vacancy", "vacancies", "urgent", "wanted", "required", "needed", "hiring", "position"})
_NON_WORD = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class Duplicate:
    opportunity_id: str
    level: str  # "hard" | "soft"
    reason: str
    title: str = ""
    status: str = ""
    match: str = "title"  # "title" | "identifier" (an issuer reference or a specific application address)


# --- issuer identifiers ---------------------------------------------------------------------------------
# Query parameters that only say where a visitor came from (`?src=LinkedIn`, `utm_*`, click ids). They are
# removed before two addresses are compared, but only these exact names: any other parameter may be what
# identifies the vacancy (`?jobId=82490`) and is kept. `ref` is deliberately NOT here: some applicant
# systems use it for the requisition number.
TRACKING_PARAMS = frozenset(
    {
        "src", "source", "sourcetype", "gclid", "fbclid", "dclid", "msclkid", "igshid", "mc_cid", "mc_eid",
        "_hsenc", "_hsmi", "trk", "trkinfo", "trackingid", "refid", "lipi", "li_fat_id", "originalsubdomain",
        "si", "s_cid", "cmpid",
    }
)  # fmt: skip
_REF_PREFIX = re.compile(
    r"^\s*(?:job\s*(?:id|no|number|ref)|vacancy\s*(?:id|no|number|ref)|requisition(?:\s*(?:id|no|number))?"
    r"|req(?:\s*id)?|reference(?:\s*(?:no|number))?|ref(?:\s*no)?|advert\s*(?:no|number)|post\s*(?:no|number)"
    r"|no|number|id)(?![a-z])\s*[.:#-]*\s*",
    re.IGNORECASE,
)
_ID_TOKEN = re.compile(r"(?<![0-9])[0-9]{4,}(?![0-9])")


def normalise_reference(value: str | None) -> str:
    """An issuer's vacancy reference reduced to letters and digits ("Job ID: 82490", "REF 82490" -> "82490").

    Empty when the value cannot identify a vacancy: blank, placeholder words, or no digit at all ("N/A",
    "TBA")."""
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().strip()
    text = _REF_PREFIX.sub("", text, count=1)
    key = re.sub(r"[^a-z0-9]+", "", text.lower())
    if len(key) < 3 or not any(c.isdigit() for c in key):
        return ""
    return key


def normalise_url(url: str | None) -> str:
    """A comparable form of an http(s) address: https, lower-case host without `www.`, no port, fragment or
    trailing slash, the tracking parameters above removed and the rest sorted. Empty for anything else."""
    raw = (url or "").strip()
    try:
        parts = urlsplit(raw)
    except ValueError:
        return ""
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        return ""
    host = parts.hostname.lower().removeprefix("www.")
    query = sorted(
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=False)
        if k.lower() not in TRACKING_PARAMS and not k.lower().startswith("utm_")
    )
    path = re.sub(r"/{2,}", "/", parts.path or "/").rstrip("/") or "/"
    return urlunsplit(("https", host, path, urlencode(query), ""))


def url_identifies_vacancy(normalised: str, references: frozenset[str] = frozenset()) -> bool:
    """Whether an address (from `normalise_url`) points at one vacancy rather than a careers home page or a
    shared form: its path or query carries an id (five or more digits, or four that are not a year), or one of
    the listing's own references."""
    if not normalised:
        return False
    parts = urlsplit(normalised)
    tail = f"{parts.path}?{parts.query}".lower()
    if any(len(t) > 4 or not 1900 <= int(t) <= 2099 for t in _ID_TOKEN.findall(tail)):
        return True
    flat = re.sub(r"[^a-z0-9]+", "", tail)
    return any(ref and len(ref) >= 4 and ref in flat for ref in references)


@dataclass(frozen=True)
class Identity:
    """What identifies the vacancy a revision advertises, independent of its wording."""

    organisation_id: str
    references: frozenset[str]
    addresses: frozenset[str]  # normalised application and primary-source addresses that identify a vacancy

    def lock_keys(self) -> list[str]:
        """Keys for the transaction-scoped advisory locks that serialise checks on the same vacancy."""
        keys = {f"vacancy:{self.organisation_id}:{ref}" for ref in self.references}
        keys |= {f"address:{addr}" for addr in self.addresses}
        return sorted(keys)

    def __bool__(self) -> bool:
        return bool(self.references or self.addresses)


def lock_identity_keys(keys: list[str]) -> None:
    """Take the advisory locks for these identity keys (sorted, so every caller locks in the same order)."""
    if not keys:
        return
    with connection.cursor() as cursor:
        for key in sorted(keys):
            cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", [f"upnext:{key}"])


def identity_of(
    organisation_id: object,
    *,
    reference_number: str | None,
    application_url: str | None,
    source_urls: list[str] | tuple[str, ...] = (),
) -> Identity:
    ref = normalise_reference(reference_number)
    refs = frozenset({ref} if ref else set())
    addresses = set()
    for url in (application_url, *source_urls):
        key = normalise_url(url)
        if url_identifies_vacancy(key, refs):
            addresses.add(key)
    return Identity(str(organisation_id), refs, frozenset(addresses))


def version_identity(version: OpportunityVersion) -> Identity:
    primary = [s.url for s in version.sources.all() if s.is_primary and s.url]
    return identity_of(
        version.organisation_id,
        reference_number=version.reference_number,
        application_url=version.application_url,
        source_urls=primary,
    )


def titles_compatible(a: str | None, b: str | None) -> bool:
    """Whether two titles can name the same post: equal or similar once normalised, or one contained in the
    other ("Supply Assistant" and "TotalEnergies Supply Assistant - Harare"). An empty title is compatible
    with any."""
    x, y = normalise_title(a), normalise_title(b)
    if not x or not y or x == y:
        return True
    xs, ys = set(x.split()), set(y.split())
    if xs <= ys or ys <= xs:
        return True
    return SequenceMatcher(None, x, y).ratio() >= SIMILAR_RATIO


def identifier_matches(
    identity: Identity, candidates: list[OpportunityVersion], title: str | None = None
) -> dict[str, tuple[str, str]]:
    """{opportunity id: (level, reason)} for each candidate that shares an issuer identifier with `identity`.

    `hard` when the titles can name the same post; `soft` when they clearly differ, because one reference or
    notice sometimes covers several posts (a recruitment drive, a PDF listing many vacancies): that is sent
    for review as a warning, never blocked."""
    found: dict[str, tuple[str, str]] = {}
    if not identity:
        return found
    for other in candidates:
        theirs = version_identity(other)
        same_ref = (
            other.organisation_id is not None
            and str(other.organisation_id) == identity.organisation_id
            and identity.references & theirs.references
        )
        same_address = identity.addresses & theirs.addresses
        if not same_ref and not same_address:
            continue
        if same_ref:
            what = f"vacancy reference ({sorted(identity.references & theirs.references)[0]})"
        else:
            what = "application or source address"
        if titles_compatible(title, other.title):
            found[str(other.opportunity_id)] = (
                "hard",
                f"Same organisation and {what}." if same_ref else f"Same {what} for one vacancy.",
            )
        else:
            found[str(other.opportunity_id)] = (
                "soft",
                f"Same {what} but a different job title: check whether one notice covers several posts.",
            )
    return found


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


def _places_differ(a: str | None, b: str | None) -> bool:
    """Two places are clearly different only when neither names the other: "Harare" and "Harare, Zimbabwe" are
    one place written twice (D-79: the audit's ACBF pair), "Harare" and "Bulawayo" are two."""
    x, y = set(_plain(a).split()), set(_plain(b).split())
    return bool(x) and bool(y) and not (x <= y or y <= x)


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


def _open_candidates(
    version: OpportunityVersion, identity: Identity, now: datetime
) -> list[OpportunityVersion]:
    """Live or pipeline revisions of other open listings, in any category, that could share an identifier:
    the same organisation (a reference is scoped to its issuer) or an application or primary-source address on
    the same host. The exact comparison happens in Python on this short list."""
    near = Q(organisation_id=version.organisation_id) if identity.references else Q(pk__in=[])
    for host in sorted({urlsplit(a).hostname or "" for a in identity.addresses} - {""}):
        near |= Q(application_url__icontains=host) | Q(sources__is_primary=True, sources__url__icontains=host)
    rows = (
        OpportunityVersion.objects.filter(
            near, state__in=LIVE_OR_PIPELINE, opportunity__status__in=OPEN_STATUSES
        )
        .exclude(opportunity_id=version.opportunity_id)
        .distinct()
        .select_related("opportunity")
        .prefetch_related("sources")
    )
    return [r for r in rows if r.deadline_at is None or r.deadline_at >= now]


def find_identifier_duplicates(version: OpportunityVersion, now: datetime | None = None) -> list[Duplicate]:
    """Other open listings that advertise the same vacancy by issuer reference or a specific address."""
    identity = version_identity(version)
    if not identity:
        return []
    candidates = _open_candidates(version, identity, now or timezone.now())
    by_id = {str(c.opportunity_id): c for c in candidates}
    return [
        Duplicate(key, level, reason, by_id[key].title, by_id[key].opportunity.status, "identifier")
        for key, (level, reason) in identifier_matches(identity, candidates, version.title).items()
    ]


def find_duplicates(version: OpportunityVersion) -> list[Duplicate]:
    now = timezone.now()
    found: dict[str, Duplicate] = {d.opportunity_id: d for d in find_identifier_duplicates(version, now)}
    mine = normalise_title(version.title)
    if not mine:
        return list(found.values())
    candidates = (
        OpportunityVersion.objects.filter(
            state__in=LIVE_OR_PIPELINE,
            organisation_id=version.organisation_id,
            opportunity__category_id=version.opportunity.category_id,
            opportunity__status__in=OPEN_STATUSES,
        )
        .exclude(opportunity_id=version.opportunity_id)
        .select_related("opportunity")
    )
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
        if key in found and found[key].level == "hard":  # an identifier match already decided it
            continue
        if difference is None and same:
            found[key] = Duplicate(key, "hard", "Same organisation and job title.", other.title, status)
        elif difference is None:
            found.setdefault(key, Duplicate(key, "soft", "A similar job title.", other.title, status))
        elif same:
            reason = f"Same job title with {difference}."
            found.setdefault(key, Duplicate(key, "soft", reason, other.title, status))
    return list(found.values())
