# ADR-0020: Phase 4 — launch readiness, SEO, deletion lifecycle and provider architecture

- **Status:** ACCEPTED as an implementation approach (Phase 4 authorised by the owner, 2026-10-17, D-28). The provisional defaults it relies on (P4-01…P4-11) are **not** owner decisions.
- **Decision register:** D-28; P4-01…P4-11. Builds on ADR-0004, ADR-0018, ADR-0019.

## Decision
1. **Indexing is decided by the page, not by a blanket rule.** The web app emits `robots.txt`, a sitemap rendered from one API feed (`GET /api/v1/sitemap`: open published listings only, slug order, at most 50,000), a canonical URL on every public page (origin from `UPNEXT_PUBLIC_BASE_URL`) and `noindex` on every view of the list that is not the plain list. Closed and withdrawn listings remain reachable but are neither indexed nor listed.
2. **Structured data states only what the listing states.** JobPosting for the three job-like categories, with absent fields left out rather than guessed. The JSON-LD component is the single `dangerouslySetInnerHTML` use in the app: it receives only `JSON.stringify` output with `<`, `>` and `&` escaped, and is covered by unit tests with hostile input.
3. **Deletion is a two-step, reversible-then-final process run by the worker.** The request records a date; execution is a separate, idempotent, row-locked job that tombstones the user, deletes dependent personal data, scrubs the person's outbox rows and writes a system audit event. Keeping a tombstone row (instead of deleting the user) preserves foreign keys from history and audit tables without keeping any personal data on it. Retention of everything else is a daily job with provisional windows.
4. **E-mail providers plug into a port.** Adapters register under a name; `smtp` is generic. A suppression list holds keyed hashes only. Operators validate a configuration with `check_email_config` before enabling delivery; monitoring is by `outbox_status`, a warning log and an Administrator-only outbox page. Provider webhooks are out of scope until a provider exists.
5. **Production refuses unsafe configuration** instead of warning, keyed on `UPNEXT_ENVIRONMENT`; throwaway stacks must name themselves `local-prod-like`.
6. **Query shape for the public list.** The one-to-one `live_version` link lets the public query join on `live_version_id` alone (the ORM's extra `opportunity_id = id` condition made PostgreSQL estimate one row and choose a full sort), and the two default orderings use partial indexes, so a page of 20 no longer sorts every live listing.

## Consequences
- A new additive endpoint (`getSitemapEntries`), two additive fields on `User`/deletion responses, one new e-mail kind and template, a suppression table, and migrations `notifications/0002-0003` and `opportunities/0005`.
- The Compose worker runs `run_worker` (outbox every cycle; deletions and retention every five minutes).
- Cursors issued before the ordering change are invalid (they expire after 24 hours anyway).

## Alternatives considered
Deleting the user row outright (rejected: PROTECT foreign keys from editorial history, and audit rows must keep a stable opaque id); a third-party sitemap or SEO package (rejected: small amount of code, no dependency); a cache table for the public list (rejected: the index fix removed the problem); provider-specific webhooks now (rejected: no provider chosen).
