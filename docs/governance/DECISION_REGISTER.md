# Decision register — SOURCE OF TRUTH
Authoritative per D-16. Status of every other document is DRAFT until the owner approves it. Proposals are not approvals; unresolved items stay **OPEN** and are never defaulted. Last updated 2026-10-17 (second Phase 0 round).

## CONFIRMED
| ID | Decision | Date |
|---|---|---|
| D-01 | UPNEXT, Zimbabwe-first; categories: jobs, internships, graduate trainees, scholarships, tenders, grants | pack |
| D-02 | Approved flat/minimalist visual direction and HTML reference | pack |
| D-03 | Public browsing; accounts for personalisation and saved listings | pack |
| D-04 | Next.js/TypeScript/Tailwind; Django/DRF; PostgreSQL; Docker Compose | pack |
| D-05 | Modular monolith with extensible versioned APIs | pack |
| D-06 | Same VPS as The Granite Post; Traefik in front of Nginx; no disruption to existing service | pack |
| D-07 | Documentation and explicit approval before coding | pack |
| D-08 | `reference/approved-flat.html` is the definitive design source. Preserve blue accent, Arial, sizing, spacing, square corners. Extract exact tokens, invent none. **Amended by D-19.** (ADR-0001) | 2026-10-17 |
| D-09 | Editorial separation of duties with Contributor / Editor / Publisher / Administrator roles. **Superseded in part by D-18** (the approver-may-not-publish and administrator-has-no-authority elements). (ADR-0002) | 2026-10-17 |
| D-10 | Monorepo: `apps/web` (Next.js), `apps/api` (Django), `docs/`, `reference/`, `infrastructure/`, optional `packages/`. (ADR-0003) | 2026-10-17 |
| D-11 | Redis and Celery deferred until reliable background processing requires them. Email delivery interface designed now; verification and password-reset emails handled reliably via the documented outbox design. (ADR-0004) | 2026-10-17 |
| D-12 | Hybrid opportunity data model: relational searchable fields plus validated, versioned category-specific JSONB. (ADR-0005) | 2026-10-17 |
| D-13 | Immutable internal identifiers and stable public slugs. (ADR-0006) | 2026-10-17 |
| D-14 | Source provenance and verification status are kept separate. (ADR-0007) | 2026-10-17 |
| D-15 | Deferred until justified: automatic eligibility decisions, public organisation pages, advanced related-opportunity recommendations, object storage. (ADR-0008) | 2026-10-17 |
| D-16 | `docs/governance/DECISION_REGISTER.md` is the authoritative decision register. (ADR-0009) | 2026-10-17 |
| D-17 | The existing CLAUDE.md traceability and unresolved-question rules are preserved when reconciling documentation. (ADR-0010) | 2026-10-17 |
| D-18 | **Editorial separation of duties (revised):** the author cannot approve their own submission. An authorised Editor or Administrator may approve another person's submission and subsequently publish it. Two different people are sufficient for the normal publishing workflow. Restrictions are enforced on the backend and every transition is audited. (ADR-0011) | 2026-10-17 |
| D-19 | **Accessibility precedence:** where the approved reference conflicts with WCAG 2.2 AA, accessibility takes precedence over exact visual fidelity. The flat design, Arial, blue accent, square corners and compact layout are preserved; only the minimum necessary corrections are made and every deviation is documented (`ACCESSIBILITY_DEVIATIONS.md`). (ADR-0012) | 2026-10-17 |
| D-20 | **Runtime versions (OQ-28) are chosen by researched, evidence-backed recommendation, never arbitrarily:** Python, Django, Django REST Framework, Node.js, Next.js and PostgreSQL pins with compatibility evidence and security-support analysis are to be recommended for approval. (ADR-0013). *The decision is the method; the pins themselves await approval — see OQ-28.* | 2026-10-17 |
| D-21 | **Category-specific schemas remain drafts.** Representative Zimbabwean examples and field-level validation recommendations are prepared for every launch category; none is treated as approved until the owner approves it. (ADR-0014) | 2026-10-17 |

## RESOLVED (formerly open)
| ID | Question | Resolution |
|---|---|---|
| OQ-12 | May the approving Editor also publish? | **Yes** — D-18: approver ≠ author is the rule; the approver may publish |
| OQ-25 | Pixel fidelity vs WCAG 2.2 AA where the reference conflicts | **Accessibility wins, minimally** — D-19. The deviation log DEV-01…DEV-04 awaits your confirmation in the approval checklist |

## OPEN — owner decisions required
"Blocks" = earliest phase that cannot start (or finish) without the answer. Documents carry **PROPOSED** values for some of these; a proposal is not a decision.

| ID | Question | Blocks |
|---|---|---|
| OQ-01 | Domain, subdomains, brand copy (also drives cookie-prefix/topology) | Phase 3 / 7 |
| OQ-02 | Employer submissions — deferred by the PRD launch exclusion; revisit at Release 3 | none now |
| OQ-03 | Email provider (SMTP/API), sender domain, deliverability set-up | Phase 4 |
| OQ-04 | Is a verified email required before a session is issued? (documents propose yes) | Phase 4 |
| OQ-05 | Application handoff: external-only for launch (proposed, not confirmed) | Phase 2 |
| OQ-06 | **Category-specific fields.** Drafts, examples and validation recommendations delivered (`CATEGORY_SCHEMA_EXAMPLES.md`); owner approval of the field lists outstanding | Phase 2 |
| OQ-07 | Source verification policy: what evidence earns `source_checked` and `issuer_verified`; whether verification carries over to amendments (documents propose: it does not) | Phase 2 |
| OQ-08 | Duplicate rules (candidate rules in VALIDATION_SPEC §6) | Phase 2 |
| OQ-09 | Privacy notice, retention periods, deletion process incl. cooling-off, audit pseudonymisation; Zimbabwean legal review | Phase 4 / launch |
| OQ-10 | Actual VPS capacity, Traefik/Nginx routing, deployment path (needs read-only inspection) | Phase 7 |
| OQ-11 | Quantified KPIs, performance SLOs, accessibility audit process | Phase 6 |
| OQ-13 | Administrator controls (narrowed by D-18): second-administrator confirmation for granting the administrator role, break-glass access, bootstrap with a single administrator, and detective controls against one person operating several accounts | Phase 2 |
| OQ-14 | Scheduled publishing (`publish_at`) in Release 1? Needs a scheduler | Phase 2 |
| OQ-15 | Account-state semantics (restricted, suspended, deactivated) and login behaviour while pending verification | Phase 4 |
| OQ-16 | Staff MFA; restricting the staff interface by network/IP; final staff-UI choice | Phase 2 |
| OQ-17 | Numeric security parameters (session lifetimes, token expiries, throttle rates, password rules; PROPOSED in SECURITY_ARCHITECTURE) | Phase 4 |
| OQ-18 | Launch languages (no language other than what the owner confirms is assumed) | Phase 3 |
| OQ-19 | Analytics, cookie consent, and how the outbound-click KPI is measured | Phase 3 |
| OQ-20 | URL/indexing policy for expired, withdrawn and archived listings | Phase 3 |
| OQ-21 | Taxonomy contents: locations, sectors, fields of study; qualification vocabulary (Zimbabwean levels proposed in the category document); skills taxonomy ownership and user suggestions | Phase 2 |
| OQ-22 | Date-only deadline semantics (proposed: end of day Africa/Harare); permitted currency codes (USD and ZWG proposed — verify the ISO code) | Phase 2 |
| OQ-23 | Match display (reasons only vs numeric score), weights, behaviour for incomplete profiles | Phase 5 |
| OQ-24 | Reference features outside launch scope: "For employers" link, alerts widget, "Apply unavailable" demo; how the organisation filter works without public organisation pages | Phase 3 |
| OQ-26 | Hosting of error tracking and metrics (off-server vs self-hosted) | Phase 6 |
| OQ-27 | Backup RPO/RTO, retention, off-server target | Phase 6 |
| OQ-28 | **Runtime version pins.** Recommendation delivered (`VERSION_RECOMMENDATION.md`): Python 3.14.8, Django 5.2.18 LTS, DRF 3.18.3, psycopg 3.3.6, PostgreSQL 18.6, Node.js 24.22.0 (conditional alternative: Node 26 LTS if Phase 1 starts after 2026-10-28), Next.js 16.4.2, React 19.3.1. **Awaiting your approval of the pins**; the Django-5.2/PostgreSQL-18 pairing and official support dates need re-verification (Phase 1 tasks V-01, V-05) | Phase 1 |
| OQ-29 | Source rules: may a source lack a URL (print/email citation)? https-only for application and source URLs? | Phase 2 |
| OQ-30 | Review thresholds for moving email delivery from the DB outbox to Celery/Redis | Phase 4 |
| OQ-31 | Whether a seeker may save an expired opportunity, and the per-user saved-item cap | Phase 5 |
| OQ-32 | Keep a **publish-only Publisher role** now that Editors and Administrators may approve and publish (D-18)? Documents keep it as an optional narrower role; drop it if you want fewer roles | Phase 2 |
| OQ-33 | May an author who also holds approval/publish authority publish **their own** listing after someone else approved it? Documents specify **no** (author ≠ approver and author ≠ publisher) — D-18 states only the approval restriction | Phase 2 |

## Change control
Any change to a CONFIRMED decision requires a dated ADR with rationale, impact and explicit approval. Claude Code may propose but not silently approve changes. D-18 changes parts of D-09, D-19 amends D-08; both are recorded by ADR-0011 and ADR-0012, and the earlier ADRs carry a pointer.
