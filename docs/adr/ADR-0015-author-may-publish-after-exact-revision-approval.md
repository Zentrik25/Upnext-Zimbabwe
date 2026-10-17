# ADR-0015: An author may publish their own listing only after another person approves the exact revision

- **Status:** ACCEPTED (owner approval 2026-10-17). Refines ADR-0011.
- **Date:** 2026-10-17
- **Decision register:** D-22 (resolves OQ-33)

## Context
ADR-0011 left open whether an author who also holds approval/publication authority may publish their own listing after someone else approved it.

## Decision
1. **Authors cannot approve their own submissions** (nor reject, return or verify them). "Author" = author of any version in the chain, and the submitter.
2. **An author may publish their own listing only after another authorised person (Editor or Administrator) has approved the exact revision being published.** "Exact revision" = the immutable version whose `content_hash` equals the hash recorded at approval.
3. **Material changes after approval invalidate the approval.** Versions are immutable once submitted; any change creates a new version and a new review. A publish attempt on a changed or unapproved revision fails with `approval_stale` / `invalid_transition`.
4. The approver may publish; a third authorised person may publish; the author may publish — provided rule 2 holds. There is no author ≠ publisher constraint.
5. **Enforcement is transactional on the backend:** the publish transaction locks the listing row, re-reads the version, re-verifies `approved_by` ≠ author chain, the hash and the actor's permission, performs the state change and writes the audit rows; all-or-nothing. Database triggers re-assert the invariants as a last line of defence.
6. **Every transition (and every refused attempt) is recorded** in the audit log with actor, capacity, transition, versions and request id.
7. Phase 1 implements the pure policy functions and tests for these rules; Phase 2 wires them into the workflow.

## Consequences
- A solo Editor/Administrator who is also the author still needs a second person to approve; the two-person minimum is preserved.
- One person controlling two accounts could satisfy the rule alone; detective controls remain in OQ-13/OQ-16.
- The earlier SOD-10 test (author may not publish) is replaced.

## Alternatives considered
Forbid author publication outright (rejected by owner); allow self-approval by administrators (rejected: D-18).
