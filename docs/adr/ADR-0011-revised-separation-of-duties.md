# ADR-0011: Revised editorial separation of duties

- **Status:** ACCEPTED (owner approval 2026-10-17). Supersedes parts of ADR-0002. Document status DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-18

## Context
ADR-0002 required three distinct people per listing (author, approver, publisher) and gave Administrators no editorial authority. The owner decided that this is heavier than the normal workflow needs.

## Decision
1. **The author cannot approve their own submission.** "Author" means the author of any version in the current review chain, or its submitter.
2. **An authorised Editor or Administrator may approve another person's submission and subsequently publish it.** The approving person may publish the same listing. **Two different people are sufficient** for the normal workflow (author, then approver-publisher).
3. Enforced on the backend only (policy service + database triggers); the UI merely reflects what the server reports as allowed.
4. **Every transition is audited** — actor, capacity (the role exercised), from/to status, version, reason, request id — in the same transaction as the change.
5. Retained from ADR-0002: no role implies another for drafting (only Contributors create and edit drafts); Editors do not edit content (they reject with reasons); versions are immutable and approvals bind to the content hash; verification may not be recorded by the author; Administrators cannot write state, content, verification or audit data directly and cannot approve or publish their own work; role grants are audited as `privileged`.
6. Administrators now hold approval and publication authority **by role**. They remain subject to every guard (they cannot approve or publish what they authored, and cannot skip states).
7. A **publish-only Publisher role** is kept as an optional narrower role pending OQ-32. Whether an author holding approval/publish authority may publish their own listing after another person approved it is OQ-33; until decided, it is **denied**.
8. Residual risk acknowledged: one person operating two accounts could play both parts. Mitigations are named staff accounts, audited account creation and role grants, optional MFA (OQ-16), and a periodic report of author/approver pairs (OQ-13).

## Consequences
- Minimum staffing falls from three people to two; the staffing blocker recorded in the first package is removed.
- Test changes: the old SOD-04 (approver cannot publish) is replaced; new cases cover Administrator approval of another's work, denial for own work, and the OQ-33 interpretation.
- Trigger design simplifies: `published_by ≠ author_id` and `decided_by ≠ author_id`; no approver/publisher comparison.
- A single compromised Editor or Administrator account can now push another person's draft live; detection relies on audit and the author's visibility into transitions (notification of the author on approve/publish is recommended and tracked in the acceptance criteria).

## Alternatives considered
Keep three-person separation (rejected by owner); allow Administrators to bypass guards (rejected: D-18 keeps them subject to the author rule and the audit requirement).
