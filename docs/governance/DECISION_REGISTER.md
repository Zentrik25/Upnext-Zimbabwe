# Decision register — SOURCE OF TRUTH
Authoritative per D-16. Status of every other document is DRAFT until the owner approves it. Proposals are not approvals; unresolved items stay **OPEN** and are never defaulted. Last updated 2026-10-17.

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
| D-08 | `reference/approved-flat.html` is the definitive design source. Preserve blue accent, Arial, sizing, spacing, square corners. Extract exact tokens, invent none. (ADR-0001) | 2026-10-17 |
| D-09 | Editorial separation of duties: Contributors create drafts; Editors approve submissions other than their own; Publishers publish approved listings; Administrators manage permissions but cannot silently bypass the approval policy. (ADR-0002) | 2026-10-17 |
| D-10 | Monorepo: `apps/web` (Next.js), `apps/api` (Django), `docs/`, `reference/`, `infrastructure/`, optional `packages/`. (ADR-0003) | 2026-10-17 |
| D-11 | Redis and Celery deferred until reliable background processing requires them. Email delivery interface designed now; verification and password-reset emails handled reliably via the documented outbox design. (ADR-0004) | 2026-10-17 |
| D-12 | Hybrid opportunity data model: relational searchable fields plus validated, versioned category-specific JSONB. (ADR-0005) | 2026-10-17 |
| D-13 | Immutable internal identifiers and stable public slugs. (ADR-0006) | 2026-10-17 |
| D-14 | Source provenance and verification status are kept separate. (ADR-0007) | 2026-10-17 |
| D-15 | Deferred until justified: automatic eligibility decisions, public organisation pages, advanced related-opportunity recommendations, object storage. (ADR-0008) | 2026-10-17 |
| D-16 | `docs/governance/DECISION_REGISTER.md` is the authoritative decision register. (ADR-0009) | 2026-10-17 |
| D-17 | The existing CLAUDE.md traceability and unresolved-question rules are preserved when reconciling documentation. (ADR-0010) | 2026-10-17 |

## OPEN — owner decisions required
"Blocks" = earliest phase that cannot start (or finish) without the answer. Documents carry **PROPOSED** values for some of these; a proposal is not a decision.

| ID | Question | Blocks |
|---|---|---|
| OQ-01 | Domain, subdomains, brand copy (also drives cookie-prefix/topology) | Phase 3 / 7 |
| OQ-02 | Employer submissions — deferred by the PRD launch exclusion; revisit at Release 3 | none now |
| OQ-03 | Email provider (SMTP/API), sender domain, deliverability set-up | Phase 4 |
| OQ-04 | Is a verified email required before a session is issued? (documents propose yes) Token/session/password numeric parameters (OQ-17) | Phase 4 |
| OQ-05 | Application handoff: external-only for launch (proposed, not confirmed) | Phase 2 |
| OQ-06 | Category-specific fields for each category (candidate v1 schemas in VALIDATION_SPEC §7 are DRAFT) | Phase 2 |
| OQ-07 | Source verification policy: what evidence earns `source_checked` and `issuer_verified`; whether verification carries over to amendments (documents propose: it does not) | Phase 2 |
| OQ-08 | Duplicate rules (candidate rules in VALIDATION_SPEC §6) | Phase 2 |
| OQ-09 | Privacy notice, retention periods, deletion process incl. cooling-off, audit pseudonymisation; Zimbabwean legal review | Phase 4 / launch |
| OQ-10 | Actual VPS capacity, Traefik/Nginx routing, deployment path (needs read-only inspection) | Phase 7 |
| OQ-11 | Quantified KPIs, performance SLOs, accessibility audit process | Phase 6 |
| OQ-12 | May the Editor who approved a listing also publish it (same person, same listing)? Until decided the stricter reading (deny) is specified | Phase 2 |
| OQ-13 | Administrator controls: self-grant of editorial roles, second-admin confirmation, break-glass, bootstrap with a single admin | Phase 2 |
| OQ-14 | Scheduled publishing (`publish_at`) in Release 1? Needs a scheduler (management command + cron or later Celery) | Phase 2 |
| OQ-15 | Account-state semantics (restricted, suspended, deactivated) and login behaviour while pending verification | Phase 4 |
| OQ-16 | Staff MFA; restricting the staff interface by network/IP | Phase 2 |
| OQ-17 | Numeric security parameters: session idle/absolute lifetimes, token expiries, throttle rates, password rules (PROPOSED values in SECURITY_ARCHITECTURE §10) | Phase 4 |
| OQ-18 | Launch languages (no language other than what the owner confirms is assumed) | Phase 3 |
| OQ-19 | Analytics, cookie consent, and how outbound-click KPI is measured | Phase 3 |
| OQ-20 | URL/indexing policy for expired, withdrawn and archived listings | Phase 3 |
| OQ-21 | Taxonomy contents: locations, sectors, fields of study; skills taxonomy ownership and whether users may suggest skills | Phase 2 |
| OQ-22 | Date-only deadline semantics (proposed: end of day Africa/Harare); permitted currency codes | Phase 2 |
| OQ-23 | Match display (reasons only vs numeric score), weights, behaviour for incomplete profiles (departure from reference lock panel) | Phase 5 |
| OQ-24 | Reference features outside launch scope: "For employers" link, alerts widget, "Apply unavailable" demo; how the organisation filter works without public organisation pages | Phase 3 |
| OQ-25 | Pixel fidelity vs WCAG 2.2 AA where the reference conflicts (10–11px text, 4.4:1 muted on pale surface, off-palette `#3658a4`, hover filter); grey consolidation | Phase 3 |
| OQ-26 | Hosting of error tracking and metrics (off-server vs self-hosted) | Phase 6 |
| OQ-27 | Backup RPO/RTO, retention, off-server target | Phase 6 |
| OQ-28 | Version pins for Python, Django, DRF, Node, Next.js, PostgreSQL (to be chosen from maintained releases at Phase 1 start) | Phase 1 |
| OQ-29 | Source rules: may a source lack a URL (print/email citation)? https-only for application and source URLs? | Phase 2 |
| OQ-30 | Review thresholds for moving email delivery from the DB outbox to Celery/Redis | Phase 4 |
| OQ-31 | Whether a seeker may save an expired opportunity, and the per-user saved-item cap | Phase 5 |

## Change control
Any change to a CONFIRMED decision requires a dated ADR with rationale, impact and explicit approval. Claude Code may propose but not silently approve changes. Entries D-08…D-17 record approvals given in conversation on 2026-10-17; the matching ADRs are in `docs/adr/`.
