"""Merge a duplicate public listing into the listing to keep, with a dry run first (D-79).

Read-only unless `--apply` is given. A dry run prints both listings side by side, the identifiers they share,
every
fact they disagree on (these become review notes for an editor), the redirect that would be created, and
anything
that blocks the merge. `--apply` performs `workflow.merge_duplicate` (T16): the duplicate is archived with its
history, its address moves permanently (308) to the listing kept, saved copies move with it. Rerunning an
applied
merge changes nothing and says so.

    python manage.py merge_duplicate_listings --duplicate supply-assistant-nmk7k5 \
        --keep totalenergies-supply-assistant-harare
    python manage.py merge_duplicate_listings --duplicate supply-assistant-nmk7k5 \
        --keep totalenergies-supply-assistant-harare --actor editor@example.org \
        --evidence "TotalEnergies notice, job ID 82490, checked on the issuer's careers site" --apply
    python manage.py merge_duplicate_listings --scan     # public listings that share an issuer identifier

Nothing here verifies a listing or edits its content: the kept listing's facts and verification stay as they
are
until an editor amends them through the normal workflow.
"""

from __future__ import annotations

import json
from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from access.registry import DEFAULT_REGISTRY, Permission
from accounts.models import User
from opportunities import workflow
from opportunities.duplicates import (
    identifier_matches,
    normalise_reference,
    normalise_url,
    version_identity,
)
from opportunities.errors import WorkflowError
from opportunities.models import (
    Opportunity,
    OpportunityRedirect,
    OpportunityVersion,
    SavedOpportunity,
    VerificationRecord,
)

PUBLIC = workflow.MERGEABLE


def _find(slug: str) -> Opportunity:
    opp = (
        Opportunity.objects.select_related("category", "live_version", "live_version__organisation")
        .filter(slug=slug.strip().lower())
        .first()
    )
    if opp is None:
        raise CommandError(f"No listing has the address /opportunities/{slug}.")
    return opp


def _facts(opp: Opportunity) -> dict[str, Any]:
    v = opp.live_version
    records = VerificationRecord.objects.filter(opportunity=opp).order_by("-checked_at")
    latest = records.first()
    primary = v.sources.filter(is_primary=True).first() if v else None
    identity = version_identity(v) if v else None
    return {
        "id": str(opp.pk),
        "slug": opp.slug,
        "status": opp.status,
        "archive_reason": opp.archive_reason,
        "category": opp.category.code,
        "title": v.title if v else None,
        "organisation": v.organisation.name if v else None,
        "organisation_id": str(v.organisation_id) if v else None,
        "location_text": v.location_text if v else None,
        "deadline_at": v.deadline_at.isoformat() if v and v.deadline_at else None,
        "reference_number": v.reference_number if v else None,
        "reference_normalised": normalise_reference(v.reference_number) or None if v else None,
        "application_method": v.application_method if v else None,
        "application_url": v.application_url if v else None,
        "application_url_normalised": normalise_url(v.application_url) if v else None,
        "application_email": v.application_email if v else None,
        "employment_type": v.employment_type if v else None,
        "work_mode": v.work_mode if v else None,
        "primary_source": {"name": primary.name, "url": primary.url} if primary else None,
        "verified": opp.is_verified,
        "verification_level": opp.verification_level,
        "reverification_required": opp.reverification_required,
        "verification_records": records.count(),
        "latest_verification": (
            {"method": latest.method, "outcome": latest.outcome, "checked_at": latest.checked_at.isoformat()}
            if latest
            else None
        ),
        "first_published_at": opp.first_published_at.isoformat() if opp.first_published_at else None,
        "last_published_at": opp.last_published_at.isoformat() if opp.last_published_at else None,
        "saved_by": SavedOpportunity.objects.filter(opportunity=opp).count(),
        "pending_revision": opp.pending_version.state if opp.pending_version else None,
        "identifiers": {
            "references": sorted(identity.references) if identity else [],
            "addresses": sorted(identity.addresses) if identity else [],
        },
    }


COMPARED = (
    ("title", "title"),
    ("organisation", "organisation"),
    ("location_text", "location"),
    ("deadline_at", "closing date"),
    ("reference_normalised", "reference"),
    ("application_url_normalised", "application address"),
    ("application_email", "application e-mail"),
    ("employment_type", "employment type"),
    ("work_mode", "work arrangement"),
)


def _differences(dup: dict[str, Any], keep: dict[str, Any]) -> list[str]:
    """Facts the two pages disagree on, worded for an editor to settle (never resolved here)."""
    notes = []
    for key, label in COMPARED:
        a, b = dup.get(key), keep.get(key)
        if (a or None) == (b or None):
            continue
        if not a or not b:
            stated = "kept listing" if b else "duplicate"
            notes.append(
                f"{label.capitalize()} is stated only on the {stated} ({a or b!s}); confirm it on the "
                f"issuer's notice."
            )
        else:
            notes.append(
                f"{label.capitalize()} differs: duplicate {a!s} / kept {b!s}; confirm on the issuer's notice."
            )
    if (dup["verified"], dup["verification_level"]) != (keep["verified"], keep["verification_level"]):
        notes.append(
            "Verification labels differ: duplicate "
            f"{'Verified' if dup['verified'] else 'Not verified'} ({dup['verification_level']}, "
            f"{dup['verification_records']} record(s)) / kept "
            f"{'Verified' if keep['verified'] else 'Not verified'} ({keep['verification_level']}, "
            f"{keep['verification_records']} record(s)). Both histories are kept and the kept listing's "
            "label is not changed: re-check it under the verification standard."
        )
    return notes


def _shared(dup: Opportunity, keep: Opportunity) -> list[str]:
    if not dup.live_version or not keep.live_version:
        return []
    found = identifier_matches(
        version_identity(dup.live_version), [keep.live_version], dup.live_version.title
    )
    return [f"{reason} ({level})" for level, reason in found.values()]


class Command(BaseCommand):
    help = (
        "Merge a duplicate listing into the one to keep (dry run unless --apply), or --scan for duplicates."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--duplicate", help="Slug of the listing to retire.")
        parser.add_argument("--keep", help="Slug of the listing to keep (its address is the canonical one).")
        parser.add_argument(
            "--actor", help="E-mail of the active Editor or Administrator applying the merge."
        )
        parser.add_argument(
            "--evidence",
            default="",
            help="What showed they are one vacancy (the issuer's notice, job id, where it was checked). "
            "Required with --apply.",
        )
        parser.add_argument(
            "--note", action="append", default=[], help="An extra fact for editorial review (repeatable)."
        )
        parser.add_argument(
            "--apply", action="store_true", help="Make the change. Without it nothing is written."
        )
        parser.add_argument(
            "--scan", action="store_true", help="List public listings that share an identifier."
        )
        parser.add_argument("--json", action="store_true", help="Print JSON instead of text.")

    def handle(self, *args: Any, **options: Any) -> None:
        if options["scan"]:
            self._scan(as_json=options["json"])
            return
        if not options["duplicate"] or not options["keep"]:
            raise CommandError("Give --duplicate and --keep (or --scan).")
        dup, keep = _find(options["duplicate"]), _find(options["keep"])
        report = self._plan(dup, keep, options["note"])
        if not options["apply"]:
            report["mode"] = "dry-run (nothing was changed)"
            self._print(report, options["json"])
            if report["conflicts"]:
                raise CommandError("The merge is blocked; see conflicts.")
            return
        if report["status"] == "already merged":
            report["mode"] = "apply"
            self._print(report, options["json"])
            return
        if report["conflicts"]:
            self._print(report, options["json"])
            raise CommandError("The merge is blocked; see conflicts. Nothing was changed.")
        evidence = options["evidence"].strip()
        if len(evidence) < 10:
            raise CommandError(
                "--apply needs --evidence: what showed these are the same vacancy (10+ characters)."
            )
        actor = self._actor(options["actor"])
        try:
            result = workflow.merge_duplicate(
                actor,
                dup.pk,
                into_id=keep.pk,
                expected_row_version=dup.row_version,
                reason=f"Duplicate of /opportunities/{keep.slug}. Evidence: {evidence}",
                review_notes=report["review_notes"],
            )
        except WorkflowError as exc:
            raise CommandError(f"Refused ({exc.code}): {exc.message}") from exc
        report.update(
            mode="apply",
            status="merged" if result.created else "already merged",
            redirect_id=str(result.redirect.pk),
            saved_moved=result.saved_moved,
            saved_already_on_kept_listing=result.saved_already_on_canonical,
        )
        self._print(report, options["json"])

    # --- helpers
    # ---------------------------------------------------------------------------------------------
    def _actor(self, email: str | None) -> User:
        if not email:
            raise CommandError("--apply needs --actor (the e-mail of an active Editor or Administrator).")
        user = User.objects.filter(email__iexact=email.strip()).first()
        if user is None or not user.is_active:
            raise CommandError("No active user has that e-mail address.")
        if not DEFAULT_REGISTRY.has(user.active_roles(), Permission.OPP_TAKEDOWN):
            raise CommandError("That person may not merge listings (Editor or Administrator only).")
        return user

    def _plan(self, dup: Opportunity, keep: Opportunity, notes: list[str]) -> dict[str, Any]:
        existing = OpportunityRedirect.objects.filter(from_opportunity=dup).first()
        a, b = _facts(dup), _facts(keep)
        shared = _shared(dup, keep)
        conflicts = workflow.merge_conflicts(dup, keep)
        review = [*_differences(a, b), *[n.strip() for n in notes if n.strip()]]
        warnings = []
        if not shared:
            warnings.append(
                "The records share no issuer identifier (reference or specific address), so nothing "
                "stored proves these are one vacancy. Confirm it on the issuer's original notice before "
                "applying."
            )
        if existing is not None and existing.to_opportunity_id == keep.pk:
            status = "already merged"
        else:
            status = "blocked" if conflicts else "would merge"
        return {
            "status": status,
            "duplicate": a,
            "keep": b,
            "shared_identifiers": shared,
            "review_notes": review,
            "warnings": warnings,
            "conflicts": [] if status == "already merged" else conflicts,
            "redirect": {
                "from": f"/opportunities/{dup.slug}",
                "to": f"/opportunities/{keep.slug}",
                "status": 308,
                "exists": existing is not None,
            },
            "effects": [
                f"/opportunities/{dup.slug} answers 308 to /opportunities/{keep.slug} (one hop, also "
                f"with capitals)",
                "the duplicate leaves search, the home page, category lists, related listings and "
                "the sitemap",
                "the duplicate's revisions, sources, verification records, reviews and history are kept",
                f"{a['saved_by']} saved cop(ies) move to the kept listing",
                "the kept listing's content and verification label are not changed",
            ],
        }

    def _scan(self, *, as_json: bool) -> None:
        """Public listings sharing an issuer identifier with another public listing (read-only). Grouped by
        the same
        keys the workflow locks on, so it costs one pass over the live revisions."""
        versions = (
            OpportunityVersion.objects.filter(live_for__status__in=PUBLIC)
            .select_related("opportunity", "organisation")
            .prefetch_related("sources")
        )
        buckets: dict[str, list[OpportunityVersion]] = {}
        for v in versions:
            for key in version_identity(v).lock_keys():
                buckets.setdefault(key, []).append(v)
        pairs: dict[tuple[str, str], dict[str, Any]] = {}
        for key, group in sorted(buckets.items()):
            for i, a in enumerate(group):
                for b in group[i + 1 :]:
                    ids = (str(a.opportunity_id), str(b.opportunity_id))
                    pair = (min(ids), max(ids))
                    entry = pairs.setdefault(
                        pair,
                        {
                            "shared": [],
                            "listings": [
                                {"slug": x.opportunity.slug, "title": x.title, "status": x.opportunity.status}
                                for x in (a, b)
                            ],
                        },
                    )
                    entry["shared"].append(key.split(":", 2)[-1] if key.startswith("vacancy:") else key)
        found = list(pairs.values())
        if as_json:
            self.stdout.write(json.dumps({"pairs": found}, indent=2))
            return
        if not found:
            self.stdout.write("No public listings share an issuer identifier.")
        for entry in found:
            a, b = entry["listings"]
            self.stdout.write(
                f"- shared: {', '.join(entry['shared'])}\n"
                f"    {a['slug']} ({a['status']}): {a['title']}\n    {b['slug']} ({b['status']}): "
                f"{b['title']}"
            )

    def _print(self, report: dict[str, Any], as_json: bool) -> None:
        if as_json:
            self.stdout.write(json.dumps(report, indent=2, default=str))
            return
        w = self.stdout.write
        w(f"Merge {report['redirect']['from']}  ->  {report['redirect']['to']}")
        w(f"  mode: {report.get('mode')}   status: {report['status']}")
        for side in ("duplicate", "keep"):
            f = report[side]
            w(f"  [{side}] {f['slug']} ({f['status']}) id={f['id']}")
            for key in (
                "title", "organisation", "category", "location_text", "deadline_at", "reference_number",
                "application_url", "application_url_normalised", "application_email", "primary_source",
                "verified", "verification_level", "reverification_required", "verification_records",
                "latest_verification", "first_published_at", "saved_by", "pending_revision", "identifiers",
            ):  # fmt: skip
                w(f"      {key}: {f[key]}")
        w("  shared identifiers: " + ("; ".join(report["shared_identifiers"]) or "none"))
        for label in ("warnings", "conflicts", "review_notes", "effects"):
            if report.get(label):
                w(f"  {label.replace('_', ' ')}:")
                for line in report[label]:
                    w(f"    - {line}")
        for key in ("redirect_id", "saved_moved", "saved_already_on_kept_listing"):
            if key in report:
                w(f"  {key}: {report[key]}")
