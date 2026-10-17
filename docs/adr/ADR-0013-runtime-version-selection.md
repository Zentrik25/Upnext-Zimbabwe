# ADR-0013: Runtime versions are selected by researched recommendation

- **Status:** ACCEPTED as a method (owner approval 2026-10-17). The pins themselves are a recommendation awaiting approval (OQ-28).
- **Date:** 2026-10-17
- **Decision register:** D-20

## Context
The specification said versions must be pinned to compatible, maintained releases when development begins. Choosing arbitrarily risks unsupported or incompatible combinations on a long-lived production system.

## Decision
1. Versions are chosen from primary-source evidence: package-registry metadata for exact releases, framework documentation and release notes for compatibility, official schedules/PEPs for support windows, and advisory databases for known vulnerabilities.
2. Every pin comes with compatibility evidence, support-window and end-of-life dates, security-patching expectations, and the alternatives rejected.
3. The recommendation is in `docs/engineering/VERSION_RECOMMENDATION.md`: Python 3.14.8, Django 5.2.18 LTS, DRF 3.18.3, psycopg 3.3.6, PostgreSQL 18.6, Node.js 24.22.0, Next.js 16.4.2, React 19.3.1. Node.js uses a decision rule (newest LTS on the day Phase 1 starts that the pinned Next.js supports) so the choice between 24 and 26 is not arbitrary.
4. Exact versions are committed in lockfiles (hash-checked) with images pinned by digest; builds fail when a runtime is within 90 days of end of life or has a known high/critical advisory.
5. Anything that could not be verified (e.g., official pages unreachable from the research environment, PostgreSQL 18 not named explicitly in Django 5.2's documentation) is listed as a Phase 1 verification task rather than assumed.

## Consequences
- Phase 1 begins only after the owner approves the pins (or amends them).
- A scheduled upgrade plan exists: Django 5.2 → next LTS; Node 24 → 26 before April 2028.
- The research data are dated 2026-10-17 and must be refreshed if Phase 1 starts much later.

## Alternatives considered
Pin the newest of everything (rejected: Django 6.1 has the shortest support window and Python 3.15 is a day-old .0 release); pin the oldest still-supported (rejected: shorter remaining support).
