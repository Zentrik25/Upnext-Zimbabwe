# Start here: production UPNEXT

1. Keep `reference/approved-flat.html` unchanged as the approved visual reference.
2. Read `CLAUDE.md`, `docs/governance/DECISION_REGISTER.md` and `docs/phase0/PHASE0_REVIEW_PACKAGE.md`.
3. Phase 0 (documentation) is complete and awaiting review. Do not implement later phases autonomously.

Prompt used for Phase 0:
Read CLAUDE.md, all docs/, and reference/approved-flat.html. Treat these as binding. Execute Phase 0 ONLY. Produce a modular-monolith architecture proposal, domain and data model, API outline, security threat model, test strategy, capacity assumptions, and an ADR list. Inspect the repository before proposing changes. Do not write application code, alter infrastructure, deploy, or proceed to Phase 1. Identify open decisions and stop for my approval.
