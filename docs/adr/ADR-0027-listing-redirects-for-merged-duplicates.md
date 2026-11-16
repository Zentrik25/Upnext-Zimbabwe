# ADR-0027 — Permanent redirects for merged duplicate listings (D-79) — DRAFT

Status: DRAFT, recorded with D-79 (owner instruction, 2026-11-16). Not merged, not deployed. Relaxes ADR-0006 §5 ("slug history/redirects are unnecessary in Release 1") for one case only.

## Context
The AdSense audit of 2026-11-16 found two vacancies each published twice under different addresses. Both addresses have been shared (WhatsApp, social posts). ADR-0006 makes slugs immutable and says a removed listing simply stops answering; that breaks shared links and leaves two indexed pages for one vacancy. ADR-0006 named the remedy: "Relaxing this requires a redirect table and a new ADR."

## Decision
1. A new append-only table `opportunities_opportunityredirect` (`from_slug` unique, `from_opportunity` one-to-one, `to_opportunity`, reason, review notes, actor, time; UPDATE and DELETE rejected by trigger). Rows are written only by `workflow.merge_duplicate` (T16), in the same transaction that archives the duplicate (`archive_reason = merged`).
2. Slugs stay immutable and are never reused: the archived duplicate keeps its slug; the redirect points from it.
3. The public detail endpoint returns the kept listing for a retired address (following chains of merges, at most five hops, refusing loops and non-public targets). The web page sees that the returned slug differs from the address asked for and answers `308 Permanent Redirect` to the canonical address before rendering, exactly as it already does for an address typed in capitals. One hop, no client-side redirect, query strings (tracking parameters) dropped.
4. Nothing else redirects: takedowns, withdrawals and expiries keep their existing behaviour (OQ-20).

## Consequences
- Old shared links keep working; search engines see one permanent move to one canonical page with JobPosting.
- A merge cannot be undone by editing rows; a mistaken merge is corrected by publishing a new listing (a new slug) and, if needed, a further merge.
- The kept listing must be public; a redirect never exposes an archived or taken-down listing.

## Alternatives considered
Nginx or Next.js config redirects (rejected: not persistent with the data, needs a deployment for each merge, no audit); a middleware lookup on every request (rejected: an extra API call on every listing view; the detail request already happens); changing the duplicate's slug (rejected: slugs are immutable, ADR-0006).
