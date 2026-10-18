# Performance and load — DRAFT

Status: DRAFT (Phase 5, WS5, P5-08). Everything below was measured on one development machine (4 cores) with the production-mode stack behind a local TLS proxy, on resource-limited containers (API 1 CPU and 512 MiB, database 1 CPU and 1 GiB, web 1.5 CPU). **These are relative capacity figures for that setup. They are not a prediction for the shared VPS, whose capacity is unknown (OQ-10), and they were not run against any production system.** Raw files are in `docs/phase5/acceptance/`.

## 1. Method
`tools/perf/load.py` (standard library only): weighted scenario mix over TLS (anonymous list, category, search, closing-soon sort 80%, detail pages 10%, signed-in saved list 5%, sitemap and static pages 5%), a new connection per request, think time up to N seconds per user, 200 synthetic signed-in sessions made by `tools/perf/make_sessions.py`. Data: 24,012 listings, 2,006 users and 71,991 saved rows (`tools/perf/synthetic_load.sql`), vacuumed and analysed. Throttling for anonymous reads was raised for the runs, because one test machine looks like one client (see §4).

## 2. Results

| Run (users, max think) | Offered load | API p95 | List p50 / p95 | Page `/opportunities` p95 | Errors |
|---|---|---|---|---|---|
| 20, 4 s | 8.8 req/s | 91 ms | 37 / 60 ms | 73 ms | 0 |
| 50, 4 s | 21.5 req/s | 159 ms | 37 / 91 ms | 142 ms | 0 |
| 80, 4 s | 34.2 req/s | 252 ms | 52 / 215 ms | 272 ms | 0 |
| 100, 0.5 s (saturation, not a realistic user) | 45.5 req/s | 2,731 ms | 1,646 / 2,749 ms | 2,818 ms | 0 |

Reading: the stack holds the proposed target (API p95 under 300 ms, error rate under 0.1%) up to about 34 requests per second, and saturates near 45 requests per second, when the API container (one CPU) and the database (one CPU) are both at about 90% CPU. A page view costs about three API calls, and a person who is reading generates a page view every 10 to 20 seconds, so 34 req/s corresponds to a few hundred people actively reading at once. That is an estimate from a model of behaviour, not a measurement of people.

Soak (50 users, up to 4 s think): 6 minutes, 8,633 requests at 23.7 req/s, **0 errors**, API p95 140 ms; container memory stayed flat (API 233 to 245 MiB, web 259 to 270 MiB, database 145 to 124 MiB) and the database connection count stayed at 8 to 10 (`load-soak-6min.csv`, `load-soak-6min.json`). A 6-minute soak is a smoke test for leaks, not the 60-minute soak the plan asked for.

## 3. What the first load runs found and what changed
| Finding | Change |
|---|---|
| With the shipped settings, 100 fast users got 31 req/s and a 3 s median: two synchronous workers were blocked by slow requests | threaded workers (`--worker-class gthread --threads 4`) |
| `GET /api/v1/sitemap` takes about 540 ms and is public: a few requests tie up workers (cheap denial of service) | feed cached in process memory for 5 minutes (`UPNEXT_SITEMAP_API_CACHE_SECONDS`); the web app already caches the XML |
| Every anonymous read wrote to the database cache table to count the throttle (the known limitation from Phase 4: about two statements per request) | counters for **anonymous reads only** moved to process memory; login, e-mail, second-step counters stay in the database. Effect: 31 to 45 req/s at saturation. Each worker counts separately, so the effective limit is at most the rate times the number of workers |
| Missing nginx forwarding headers on the web route (inheritance rule) | fixed in both local proxy configurations |

## 4. Open risks and decisions
1. **The anonymous read limit (240 per minute per address) may be too tight for shared addresses.** Mobile networks often put many people behind one address. A 240/min limit is about 80 page views a minute for everyone behind it. The limit is a configuration value (`UPNEXT_THROTTLE_PUBLIC_READ`) and still a proposed default (OQ-17): the owner should decide it with the real network picture in Phase 7, and edge limits (Traefik) are a Phase 7 choice.
2. Database and API share the 1-CPU ceilings above; the real VPS may have more or less. Re-run `tools/perf/load.py` on the real stack in Phase 7 before any capacity claim.
3. The list endpoint still computes `total` on the first page; sort and filter paths are index-backed (Phase 4). Search is trigram/ILIKE style; revisit with real content.
4. Not measured: the 60-minute soak, a spike test, a staff-site load test, and the effect of the real network path.

## 5. Mobile budgets (regression guard)
`apps/web/tests/e2e/mobile-budget.spec.ts` (run with `E2E_PERF=1` against a production build): Chromium at 390 px with slow 4G (1.6 Mbit/s, 150 ms) and 4x CPU slowdown. Budgets: LCP at most 2.5 s, CLS at most 0.1, transfer at most 250 KiB, script at most 150 KiB. Last local run (`docs/phase5/acceptance/mobile-budget.txt`): home 464 ms, list 464 ms, sign-in 496 ms, a detail page 440 ms; transfer 161 to 169 KiB; script 142 KiB; CLS 0 on all. The script figure is close to its budget: a new dependency will trip it. **This is not a test on a real phone.**
