# Search quality report — DRAFT

Status: DRAFT, 2026-10-30. Based on reading the search code and its tests. **No relevance measurement was done**: the catalogue holds demo data only (`B-09`), so there is no real query set to judge against, and none was invented.

## 1. Confirmed findings (from code)

| Topic | What exists |
|---|---|
| Engine | PostgreSQL full text. `search_vector` is stored on each published revision with weights title A, organisation name plus summary B, description, requirements and location text C, `english` configuration. GIN index `ver_search_idx`, partial on published revisions |
| Query syntax | `websearch` (quoted phrases, `-exclude`, `or`) |
| Ranking | `ts_rank` descending, then id; keyset pagination with a signed cursor bound to the query fingerprint |
| Filters | category, location (with its parent and grandparent area), work mode, employment type, experience level, organisation, posted within N days, deadline state; unknown parameters and values are rejected with a 400, never ignored |
| Closed listings | Excluded by default, including a listing whose deadline has passed before the expiry job runs; included only on request |
| Employer name | Matched as a word (organisation name is in the vector). Renaming an organisation refreshes the vectors |
| Not present | **Typo tolerance; prefix matching** (a fragment of a word matches nothing); synonyms |
| Duplicate requests, URL persistence, filter reset, empty states | Not reviewed in this pass |

## 2. Proposed improvements

See HF-03 in `docs/hardening/PRODUCT_QUALITY_AUDIT.md`. In order of preference, each shown to the person as a suggestion when a search is empty, never as a silent widening:

1. Prefix on the last word being typed (no extension needed).
2. `pg_trgm` "Did you mean" from existing titles and organisation names (needs the extension, so a database-privilege decision).

Elasticsearch, OpenSearch and similar are **not** justified: nothing measured shows a need, and the host is shared with other services.

## 3. Implemented fixes

None for search. The one lifecycle fix that touches discovery (HF-01) concerns saved items, not search.

## 4. Test evidence

Boundary behaviour of search at the deadline instant is pinned by `apps/api/tests/test_listing_freshness.py` (passes on unmodified code). Existing search, filter, cursor and N+1 tests in `test_public_api.py` pass (full suite 933 passed).

## 5. Unverified conditions

Relevance on real content; query plans on a realistic row count (an earlier synthetic-data check is recorded in the Phase 4 report); browser behaviour of the mobile filter, input debounce and duplicate requests (needs the Playwright suite, not run here).

## 6. Outstanding blockers

Real content (B-09). Without it, any "relevance improved" claim would be invented.

## 7. Required owner decisions

Which of the two suggestion mechanisms, if either; whether the database role may create extensions; a sample of real search terms once the first listings exist (OQ-21 for taxonomy).
