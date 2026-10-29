# ADR-0024 — Direct staff publishing (D-46)

Status: ACCEPTED by owner instruction of 2026-10-29. Not deployed.

## Context
D-18 and D-22 required a second authorised person to approve the exact revision of every listing before publication. For listings that UPNEXT staff research and write themselves, this made a single Editor unable to publish what they had verified at the source. The owner instructed that Administrators and Editors must be able to create, edit and publish staff-created jobs directly from `/staff/`.

## Decision
* New permission `opp.publish_direct`, held by Editor and Administrator. Editors and Administrators also hold the draft codes (`opp.draft.create`, `opp.draft.edit_own`, `opp.submit`, `opp.discard_own`, `opp.amend`) so they can write listings.
* New transition **T16** `publish_direct` (`opportunity.publish_direct`) in `opportunities.workflow`, the only writer of status. It moves the actor's **own** draft straight to `published`.
* The pure rule is `access.policy.can_publish_direct`: the actor holds the permission, the revision is a draft authored by the actor, and the listing is **not employer-originated**. Anything else is refused (`separation_of_duties`, `invalid_transition` or `permission_denied`).
* PostgreSQL `upnext_version_guard` re-asserts it: a draft may become `published` without approval only if `published_directly` is set, the publisher is the author, no approver is recorded, the content hash is set, no employer listing exists for the opportunity and the publisher holds an active Editor or Administrator role. The flag is illegal on every other transition. The reviewed path keeps its original checks.
* Everything else a publication needs is unchanged: source provenance, category schema, deadline in the future, hard-duplicate acknowledgement, applicant-payment confirmation, immutable content hash, search index refresh, slug assigned once (a staff-requested slug is honoured at first publication only if free).
* Audit: the revision carries `published_directly`, `published_by`, `published_at`; a `PublishingEvent` and an `AuditEvent` record the publisher, time, source, content hash and organisation.
* Editing a published staff listing remains T15 (amend) followed by T16; unpublishing is withdraw (T10) or takedown (T09); expiry is T11.
* Organisations entered manually are created unverified with no verification record; a logo is a Pillow-validated PNG/JPEG/WebP re-encoded to a small PNG and stored as a data URI (no SVG, no file storage, no third-party fetch).

## Consequences
* The invariant "nobody publishes without another person's approval" now has exactly one exception, bounded as above. Review of employer submissions and of Contributors' work is unchanged.
* The permission matrix, the editorial workflow document, the OpenAPI contract and CLAUDE.md are updated accordingly; tests cover the service, the policy, the database guard, the staff forms and the public site.
* An Editor can now publish what they wrote without a second pair of eyes; the compensating controls are the audit trail, the immutable revision, the source requirement and the ability of any other Editor or Administrator to take the listing down.
