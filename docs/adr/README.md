# Architecture decision records

Format: Context · Decision · Consequences · Alternatives. Decisions are recorded in `docs/governance/DECISION_REGISTER.md` first; an ADR explains the reasoning. A change to an ACCEPTED ADR needs a new, dated ADR.

## Accepted (owner-approved 2026-10-17; 0011–0014 in the second round; 0015–0017 at Phase 1 authorisation)
| ADR | Title | Register |
|---|---|---|
| [0001](ADR-0001-flat-reference-is-design-source.md) | Approved flat HTML reference is the definitive design source | D-08 |
| [0002](ADR-0002-editorial-separation-of-duties.md) | Editorial separation of duties (superseded in part by 0011) | D-09 |
| [0003](ADR-0003-monorepo-structure.md) | Monorepo structure | D-10 |
| [0004](ADR-0004-defer-redis-celery-reliable-email-outbox.md) | Defer Redis and Celery; reliable email through a database outbox | D-11 |
| [0005](ADR-0005-hybrid-opportunity-data-model.md) | Hybrid opportunity data model | D-12 |
| [0006](ADR-0006-identifiers-and-slugs.md) | Immutable internal identifiers and stable public slugs | D-13 |
| [0007](ADR-0007-provenance-and-verification-are-separate.md) | Source provenance and verification status are separate | D-14 |
| [0008](ADR-0008-deferred-capabilities.md) | Capabilities deferred until justified | D-15 |
| [0009](ADR-0009-decision-register-authority.md) | DECISION_REGISTER.md is the authoritative register | D-16 |
| [0010](ADR-0010-preserve-claude-md-rules.md) | Preserve CLAUDE.md traceability and unresolved-question rules | D-17 |
| [0011](ADR-0011-revised-separation-of-duties.md) | Revised editorial separation of duties (supersedes parts of 0002) | D-18 |
| [0012](ADR-0012-accessibility-precedence.md) | Accessibility takes precedence over exact visual fidelity (amends 0001) | D-19 |
| [0013](ADR-0013-runtime-version-selection.md) | Runtime versions are selected by researched recommendation | D-20 |
| [0014](ADR-0014-category-schemas-remain-draft.md) | Category-specific schemas remain drafts | D-21 |
| [0015](ADR-0015-author-may-publish-after-exact-revision-approval.md) | An author may publish their own listing only after another person approves the exact revision | D-22 |
| [0016](ADR-0016-no-publisher-role-initially.md) | No Publisher role in the initial implementation | D-23 |
| [0017](ADR-0017-phase-1-foundation-choices.md) | Phase 1 foundation choices and verified pins | D-25, D-26 |
| [0018](ADR-0018-phase-2-catalog-and-editorial-cms.md) | Phase 2 catalog and editorial CMS approach | D-12, D-18, D-22, D-23; P2-01…P2-10 |
| [0019](ADR-0019-phase-3-accounts-saved-and-staff-security.md) | Phase 3 accounts, saved opportunities and staff security approach | D-11, D-27; P3-01…P3-08 |
| [0020](ADR-0020-phase-4-launch-readiness.md) | Phase 4 launch readiness: SEO, deletion lifecycle, e-mail provider architecture, safeguards | D-28; P4-01…P4-11 |
| [0021](ADR-0021-phase-5-launch-readiness-and-hardening.md) | Phase 5 launch readiness and hardening: preflight, least-privilege roles, rehearsed backups, monitoring, verified delivery, draft-only import | D-31, D-32; P5-01…P5-12 |
| [0024](ADR-0024-staff-console-and-direct-publication.md) | Staff console and direct publication by Administrators and Editors (the /staff console part is superseded by 0025) | D-46 |
| [0025](ADR-0025-staff-workspace-nextjs.md) | Staff workspace in Next.js at /workspace on a thin staff API; Django Admin and the /staff console retired (two-step gated, same workflow service and visibility rule) | D-49 |
| [0026](ADR-0026-staff-interface-redesign-in-django-admin.md) | Staff interface redesign inside Django Admin (superseded by 0025) | D-49 |

## Proposed or open (not accepted — no file until drafted for review)
| Ref | Subject | Depends on |
|---|---|---|
| P-01 | Django module boundaries and names (specification proposes accounts, profiles, organisations, opportunities, taxonomies, discovery, bookmarks, publishing, verification, notifications, audit; the cross-module dependency rules) | owner approval of names |
| P-02 | Same-origin path-routed topology, cookie names/prefix, CSRF configuration | OQ-01, OQ-10 |
| P-03 | Search: PostgreSQL FTS behind an internal interface; cursor pagination; relevance keyset | — |
| P-04 | Deterministic matching engine, model versioning, explanation parity, score display | OQ-23 |
| P-05 | Expiry via scheduled command; derived deadline state at read time | OQ-14 |
| P-06 | Deadline/timezone semantics (`Africa/Harare`, date-only deadlines), currency set | OQ-22 |
| P-07 | Deployment isolation on the shared VPS and the read-only inspection protocol | OQ-10 |
| P-08 | Staff interface: Django Admin first, state fields read-only, actions call services | OQ-16 |
| P-09 | Data retention, deletion cooling-off, audit pseudonymisation | OQ-09 |
| P-10 | Error tracking and metrics hosting | OQ-26 |
| P-11 | Expired/withdrawn/archived URL and indexing policy | OQ-20 |
| P-12 | Analytics/consent and outbound click measurement | OQ-19 |
