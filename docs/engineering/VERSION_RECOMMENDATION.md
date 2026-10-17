# Runtime version recommendation (OQ-28) — DRAFT, for owner approval

Status: **RECOMMENDATION, not a decision.** D-20 asked for researched, evidence-backed pins; nothing is installed or pinned in any repository, and OQ-28 stays open until you approve the pins below. Research date: **2026-10-17**. Structured evidence: `docs/engineering/evidence/runtime-versions-2026-10-17.json`.

## 1. Recommended stack

| Component | Exact pin | Release / metadata date | Support window (security) |
|---|---|---|---|
| Python (CPython) | **3.14.8** | Docker official image updated 2026-10-14 | 3.14 final 2025-10-07; bugfix ≈ until Oct 2027; **security until Oct 2030** (PEP 745) |
| Django | **5.2.18** (LTS) | PyPI 2026-10-06 | LTS: security/data-loss fixes "at least three years" from April 2025 (5.2 release notes); download page lists **April 2028** |
| Django REST Framework | **3.18.3** | PyPI 2026-10-06 | follows Django; supports Django 5.2, 6.0, 6.1 |
| psycopg (PostgreSQL driver, required by Django) | **3.3.6** (`psycopg[binary]`; C build is an option for production images) | PyPI 2026-09-18 | Python ≥3.10, classifiers 3.10–3.15 |
| PostgreSQL | **18.6** (major 18) | minor released 2026-08-13 | 18.0 released 2025-09-25 → **end of life ≈ November 2030** (5-year project policy, derived) |
| Node.js | **24.22.0** (LTS "Krypton", npm 11.19.1 bundled) | nodejs.org 2026-10-14 | Maintenance LTS from 2026-10-20; **end of life 2028-04-30** (nodejs/Release schedule) |
| Next.js | **16.4.2** | npm 2026-10-15 | Active LTS while 16 is the latest major; Maintenance LTS afterwards (secondary sources; the official support-policy page was unreachable) |
| React / React DOM | **19.3.1** | npm latest | required by Next 16 (`^19`) |

Re-pin to the then-latest patch of the same series at Phase 1 start (security patches ship continuously), record the result, and commit lockfiles. Do not move to a newer minor/major series without a new decision.

## 2. Compatibility evidence

| Pair | Evidence | Verdict |
|---|---|---|
| Python 3.14 ↔ Django 5.2.18 | PyPI classifiers 3.10–3.14; 5.2 release notes: "supports Python 3.10 … 3.14 (as of 5.2.8)" | compatible |
| DRF 3.18.3 ↔ Django 5.2 | DRF README: "Python 3.10+; Django 5.2, 6.0, 6.1"; PyPI Django classifiers 5.2/6.0/6.1; Python classifiers 3.10–3.15 | compatible |
| psycopg 3.3.6 ↔ Django 5.2 / Python 3.14 | Django 5.2 databases doc: "psycopg 3.1.8+ or psycopg2 2.8.4+"; psycopg classifiers include 3.14 | compatible |
| Django 5.2 ↔ PostgreSQL 18 | Django 5.2 databases doc: "supports PostgreSQL 14 and higher". **No Django document or release note names PostgreSQL 18 explicitly** | compatible by stated policy; **not explicitly tested by evidence found** → Phase 1 must run the project's migrations and test-suite against `postgres:18` before relying on it (task V-01) |
| Next.js 16.4.2 ↔ Node 24 | npm `engines.node >=20.9.0`; peer `react ^19` | within the declared range (declared, not CI-evidenced) |
| React 19.3.1 ↔ Next 16.4.2 | peer dependency range | compatible |
| Node 24 ↔ npm 11.19.1 | bundled in the Node 24.22.0 release index | compatible |
| Python 3.14 ↔ Node/Next | independent services | n/a |

Known-vulnerability check on the exact pins: PyPI's per-release `vulnerabilities` field is empty for Django 5.2.18, DRF 3.18.3 and psycopg 3.3.6; the npm bulk advisory API returned no advisories for next 16.4.2, react 19.3.1 and react-dom 19.3.1. This is a point-in-time check, not a guarantee; CI must repeat it.

## 3. Why these, and the alternatives

**Django: 5.2 LTS rather than 6.1.** Django 6.1 (2026-08-05) is the newest, but its release notes state mainstream support ends April 2027 and extended support December 2027. 5.2 LTS is the only line with a guaranteed multi-year window (to April 2028 per the download page) and is explicitly supported by DRF 3.18.3 and Python 3.14. The next LTS (6.2) is expected on Django's roughly eight-month cadence around April 2027 — **expectation, not a published date** — leaving a planned upgrade path inside 5.2's window. Cost of choosing 5.2: no 6.x features; Python 3.10/3.11 would also be allowed but are not used. Django 6.1 requires PostgreSQL 15+ and Python 3.12+, compatible with the rest of this stack if you prefer it.

**Python: 3.14 rather than 3.13 or 3.15.** 3.13 has just moved to security-only (its final bugfix release coincides with 3.15.0 final per PEP 719); 3.15.0 was released only on 2026-10-17 per the Docker image and is not yet listed in Django's or DRF's Python classifiers for Django 5.2/6.x. 3.14 is mainstream, supported by every other component, and secured until October 2030.

**PostgreSQL: 18 rather than 17.** PostgreSQL 19 is not released (its release notes read "2026-??-??, AS OF 2026-10-09"). 18 gives the longest support (≈ Nov 2030) versus 17 (≈ Nov 2029), and Django's policy states "and higher". 17 is the fallback if the V-01 verification finds a problem. **PostgreSQL 14 must not be used:** its final release is due November 2026 (derived from the 5-year policy). Docker official images exist for `18.6` and `17.11`. Check the image documentation for the PG 18 data-directory/volume layout before writing Compose files (Phase 1/7).

**Node.js: 24 now; conditional alternative 26.** Node 24 is the only LTS release today. Node 26 (current: 26.12.0) is scheduled to enter LTS on **2026-10-28** with end of life 2029-04-30 — one year longer than Node 24 (2028-04-30). Decision rule, so the pin is not arbitrary: *use the newest Node line that is LTS on the day Phase 1 starts and that the pinned Next.js declares support for.* If Phase 1 starts before 2026-10-28, pin Node 24.22.0 (above). If it starts afterwards and 26 has been promoted, 26 is the better choice for support length; its exact pin must then be taken from the release index at that time (Next.js `engines` already allows it). Node 22 (maintenance to 2027-04-30) is rejected: too short.

**Next.js: 16.x rather than 15.x.** Next.js 15 is in Maintenance LTS ending around 2026-10-21 (third-party lifecycle tracker; official policy page unreachable), so it should not be adopted. 14 is end of life.

## 4. Security-support operating rules

1. **Patch cadence:** apply security releases promptly: Django publishes security patches on a pre-announced basis (subscribe to django-announce); Node.js shipped security releases on 2026-03-24, 2026-06-17 and 2026-07-28 (24.x: 24.14.1, 24.17.0, 24.18.1); PostgreSQL ships minor releases quarterly (observed 2026-05-14 and 2026-08-13; next expected mid-November 2026) and 18.6's notes reference 19 CVE identifiers — the database must be patched every minor release; PyPI/npm advisories checked in CI on every build and weekly on a schedule.
2. **Pinning policy:** exact versions in lockfiles with hashes (`pip` hash-checking or an equivalent lockfile tool chosen in Phase 1; `package-lock.json` with `npm ci`); base images pinned by digest; Debian release for images chosen in Phase 1.
3. **End-of-life watch:** a calendar/CI check fails the build when a pinned runtime is within 90 days of end of life: Django 5.2 (April 2028), Node 24 (2028-04-30), Python 3.14 (Oct 2030), PostgreSQL 18 (Nov 2030).
4. **Planned upgrades:** Django 5.2 → next LTS in 2027–2028; Node 24 → 26 (or newer LTS) before April 2028; Next.js follow-the-latest-LTS-major with a regression gate.
5. **Evidence limits:** the Django download page, Python devguide, PostgreSQL versioning page, Next.js support-policy page and endoflife.date were not reachable from this environment. Where dates come from the project's PEPs, release notes, release-schedule JSON or the 5-year rule, they are marked; the Django April 2028 date and Next.js maintenance windows come from secondary summaries of the official pages and **must be re-verified against the official pages before approval is relied on**.

## 5. Phase 1 verification tasks (not done)
V-01 run migrations and tests against `postgres:18.x` with Django 5.2.18 + psycopg 3.3.6; V-02 build and run Next.js 16.4.2 on the chosen Node line in CI; V-03 resolve and lock the full dependency tree, confirming no conflict with the pins; V-04 repeat vulnerability scans; V-05 re-check official support pages when reachable.

## 6. What I need from you
Approve the pins in §1 (or choose: Django 6.1 instead of 5.2; Node 26 after promotion; PostgreSQL 17). Until then OQ-28 remains open and Phase 1 cannot start.
