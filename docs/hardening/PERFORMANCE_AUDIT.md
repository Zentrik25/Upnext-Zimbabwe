# Performance audit — DRAFT

Status: DRAFT, 2026-10-30. **No performance measurement was made in this pass.** No Lighthouse run, no load run, no field data (nothing is live, so there are no field measurements at all). Lab and field results are kept separate below, as the brief requires; the "lab" entries are the ones already recorded in `docs/engineering/PERFORMANCE_AND_LOAD.md`, not new numbers.

Targets (Core Web Vitals, "good"): LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less.

## 1. Confirmed findings (from code and recorded results)

| # | Finding | Basis |
|---|---|---|
| HF-02 | Site-wide shared anonymous-read limit through server-side rendering (fixed on the web side) | Code and API-level test |
| HF-05 | All public pages are dynamic, one render plus several API reads per view. Correct for freshness, costly under load on the shared 4-vCPU host | `export const dynamic = "force-dynamic"` across pages; CSP nonce in `proxy.ts` |
| Index use | `newest` and `closing_soon` order by indexed listing columns so PostgreSQL can stop after one page; the relevance order sorts only matching rows | `public.py` comments; Phase 4 report |
| N+1 | A test asserts the saved list issues the same number of queries for 1 or 4 items; the fix for HF-01 keeps it passing | `test_saved_list_does_not_query_per_item` |
| Anonymous throttle cost | Counters moved to per-process memory after the Phase 5 load test showed two database writes per read | `throttles.py` |
| Sitemap | Cached for 5 minutes in the web tier | `catalog.ts` |
| Lab load result (recorded earlier, not repeated) | Soak of 50 users for 6 minutes, 8,633 requests, 0 errors, API p95 140 ms on a CPU-limited test stack | `PERFORMANCE_AND_LOAD.md` §2 |

## 2. Implemented fixes

HF-02 only. No performance claim is made for it beyond removing a shared ceiling.

## 3. Proposed improvements

1. Re-run `tools/perf/load.py` with realistic visitor spread after Phase 7 access exists; record API p95, web p95, memory and 429 counts.
2. Measure LCP, INP and CLS in a lab run per template (home, list, detail) before choosing optimisations, then collect field data with the browser's Core Web Vitals reporting only if analytics is approved (OQ-19).
3. If rendering cost proves high, consider a short server cache for the category and location reads (small, slow-changing), not for listing pages.
4. Bundle size, font loading (`src/fonts`), image loading and prefetch behaviour were **not inspected**.

## 4. Test evidence

None new for performance. Functional suites: API 933 passed; web 257 passed.

## 5. Unverified conditions

Everything about real hardware: 8 GB RAM, 4 vCPU shared host, connection counts, container memory limits under production traffic, TLS and network path effects. All Core Web Vitals values. Backend slow-query review on production-sized data.

## 6. Outstanding blockers

B-08 (deployment path; no real infrastructure to measure), B-09 (no real content).

## 7. Required owner decisions

Performance SLOs and KPIs (OQ-11); whether field measurement is allowed (OQ-19).
