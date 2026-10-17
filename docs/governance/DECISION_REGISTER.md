# Decision register — SOURCE OF TRUTH
Authoritative per D-16. Status of every other document is DRAFT until the owner approves it. Proposals are not approvals; unresolved items stay **OPEN** and are never defaulted. Last updated 2026-10-17 (Phase 3 authorised as D-27 with provisional defaults P3-01…P3-08; Phase 2 provisional defaults added; Phase 0 approved as baseline; Phase 1 implemented, awaiting review).

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
| D-18 | **Editorial separation of duties (revised; publication rule refined by D-22):** the author cannot approve their own submission. An authorised Editor or Administrator may approve another person's submission and subsequently publish it. Two different people are sufficient for the normal publishing workflow. Restrictions are enforced on the backend and every transition is audited. (ADR-0011) | 2026-10-17 |
| D-19 | **Accessibility precedence:** where the approved reference conflicts with WCAG 2.2 AA, accessibility takes precedence over exact visual fidelity. The flat design, Arial, blue accent, square corners and compact layout are preserved; only the minimum necessary corrections are made and every deviation is documented (`ACCESSIBILITY_DEVIATIONS.md`). (ADR-0012) | 2026-10-17 |
| D-20 | **Runtime versions (OQ-28) are chosen by researched, evidence-backed recommendation, never arbitrarily:** Python, Django, Django REST Framework, Node.js, Next.js and PostgreSQL pins with compatibility evidence and security-support analysis are to be recommended for approval. (ADR-0013). *The decision is the method; the pins themselves await approval — see OQ-28.* | 2026-10-17 |
| D-21 | **Category-specific schemas remain drafts.** Representative Zimbabwean examples and field-level validation recommendations are prepared for every launch category; none is treated as approved until the owner approves it. (ADR-0014) | 2026-10-17 |
| D-22 | **Publication of one's own listing (resolves OQ-33):** an opportunity author may publish their own listing only after another authorised person has approved the **exact revision** being published. Authors cannot approve their own submissions. Material changes after approval invalidate approval and require a new review. Enforced transactionally on the backend; all transitions are audited. (ADR-0015) | 2026-10-17 |
| D-23 | **No Publisher role in the initial implementation (resolves OQ-32).** Editors and Administrators may approve and publish according to the separation-of-duties rules. The permission model stays extensible for future roles. (ADR-0016) | 2026-10-17 |
| D-24 | **Accessibility corrections approved:** DEV-04 (`#7693b7` borders for inputs, selects and the search group) and the minimum text-colour corrections DEV-01…DEV-03. Flat design, Arial, blue accent, compact layout and square corners are preserved. The save-heart glyph stays classified as a conforming graphical object (DEV-05 not applied). (ADR-0012) | 2026-10-17 |
| D-25 | **Runtime versions (resolves the choice in OQ-28):** Node.js **24 LTS** is selected (not 26). The other recommended versions are provisionally accepted; before dependencies are locked the pins are verified for availability, compatibility, advisories and runtime behaviour, and any unavailable or incompatible pin is reported with evidence and replaced by a compatible maintained version without changing major architectural decisions. Verification record: `docs/engineering/PHASE1_VERSION_VERIFICATION.md`. (ADR-0013) | 2026-10-17 |
| D-26 | **Phase 0 package approved as the development baseline; Phase 1 authorised** (application foundation only — not the opportunity CMS, matching, employer portal, payments or notifications; no deployment; no change to The Granite Post or the existing Traefik/Nginx). Quality gates and delivery rules are in `docs/phase1/PHASE1_SCOPE_AND_GATES.md`. Unresolved Phase 2+ decisions are not Phase 1 blockers unless they materially affect the foundation. (ADR-0017) | 2026-10-17 |
| D-27 | **Phase 3 authorised (2026-10-17), re-scoped by the owner:** user authentication, accounts and saved opportunities, together with staff security improvements, on the existing design and architecture; all CI gates; stop for review after Phase 3; no production deployment. This **re-sequences** `ROADMAP.md`: the accounts work (roadmap phases 4 and the save part of 5) is done now, while the roadmap's "Phase 3" public-website items (SEO sitemap and structured data, static pages, derived-component design review) and profile/For You are **not** part of it. Open questions it depends on are answered by the provisional defaults P3-01…P3-08 below, not by owner decisions. | 2026-10-17 |

## PROVISIONAL — Phase 2 implementation defaults (NOT owner decisions)
Phase 2 (Opportunity Catalog and Editorial CMS) was authorised on 2026-10-17 without answers to every open question. To build without inventing facts, the implementation uses the defaults below. They are **engineering defaults, easy to change, and remain OPEN** until the owner decides; each is isolated in one place (named in the last column) so reversing it does not need a migration unless stated. Rationale: ADR-0018.

| ID | Open question | Default used in Phase 2 | Where |
|---|---|---|---|
| P2-01 | OQ-20 visibility of expired/withdrawn/archived | Lists show `published` only (`include_expired=true` adds `expired`); detail pages of `published`, `expired` and `withdrawn` listings stay readable and show their status; `archived` is never public (404) | `opportunities/public.py` |
| P2-02 | OQ-21 taxonomy contents | Locations: Zimbabwe, its 10 provinces, 8 principal cities/towns, and `remote`; sectors and skills: small starter sets. All editable by Administrators | `catalog/management/commands/seed_taxonomies.py` |
| P2-03 | OQ-22 currencies and date-only deadlines | Allowed currencies USD and ZWG; a date-only deadline is the end of that calendar day in the stated time zone, evaluated as a UTC instant | `catalog/validators.py` |
| P2-04 | OQ-29 source/URL rules | A source needs a URL or a citation; every URL is `https` only (VALIDATION_SPEC §4.1); no server-side fetching | `catalog/validators.py` |
| P2-05 | OQ-14 scheduled publishing | Not implemented (T08 absent); publication is an explicit action | workflow service |
| P2-06 | OQ-16 staff interface | Django Admin only, role-scoped; no editorial or administration API is exposed; MFA and network restriction are deferred | `opportunities/admin.py` |
| P2-07 | OQ-06 category field lists | The six draft v1 JSON Schemas are loaded unchanged as version 1 and are marked "pending owner approval"; a change after approval requires a new version | `catalog/schemas/` |
| P2-08 | OQ-07 verification policy | `source_checked` needs method `source_page_review` or `document_review`, `issuer_verified` needs method `issuer_contact` only (stricter than the VALIDATION_SPEC proposal so a document or page check can never read as direct confirmation with the issuer), each with outcome `confirmed`; a verifier is never the author; verification does not carry over to amendments | `opportunities/workflow.py` |
| P2-09 | OQ-08 duplicate rules | Hard duplicate = same normalised primary source URL, or same application URL and organisation, on a non-archived listing: blocks submit unless acknowledged with a reason. Soft duplicate = same organisation and similar title: warning only | `opportunities/duplicates.py` |
| P2-10 | Markdown renderer ("library chosen at Phase 2") | An in-house, escape-first renderer for the approved subset (no HTML pass-through), so no new dependency; the sanitiser corpus is in the tests | `catalog/markdown.py` |

### Owner direction on P2-01…P2-10 (Phase 2 acceptance review, 2026-10-17)

The owner directed that all ten defaults are **retained provisionally for MVP development**. They are **not permanently approved**: each stays PROVISIONAL until the owner approves it in writing, and P2-07, P2-09 and P2-10 remain subject to validation and security testing.

| ID | Owner direction | Still needs owner input |
|---|---|---|
| P2-01 | Expired listings must not appear in active listings or search results. Withdrawn listings must not appear as active; a direct URL may show a clearly labelled withdrawal notice. | Whether the API's `include_expired=true` and `deadline_state=expired` opt-ins should be removed (the default and the website never use them, but they are a way to list expired items). Whether withdrawn or expired pages stay `noindex`. Retention before a listing becomes `archived` (404). |
| P2-02 | No direction beyond keeping the defaults. | Final location, sector and skill contents. |
| P2-03 | Keep USD and ZWG. | Any other currency; whether a date-only deadline should mean end of day. |
| P2-04 | Strict HTTPS for application URLs; properly attributed citation-only sources are allowed. | Whether non-HTTPS source URLs are ever acceptable, and the minimum attribution a citation-only source needs. |
| P2-05 | Manual publishing; scheduled publishing deferred. | A later decision, if scheduling is wanted. |
| P2-06 | Django Admin is the initial editorial interface. | MFA for staff, network restriction, and the launch policy for staff accounts (see PHASE2_ACCEPTANCE_REVIEW.md). |
| P2-07 | Category-specific schemas retained provisionally, subject to validation. | Final field list per category. |
| P2-08 | Clearly distinguish source-checked from directly issuer-verified (implemented in the public UI: only "Verified with the issuer" uses the green tone). | Final verification policy, and the re-verification period. |
| P2-09 | Duplicate rules retained provisionally, subject to validation. | Whether hard duplicates should be blocked outright rather than acknowledged. |
| P2-10 | Markdown renderer retained provisionally, subject to security testing. | Approval after the review's security findings. |


## PROVISIONAL — Phase 3 implementation defaults (NOT owner decisions)
Phase 3 (accounts, saved opportunities, staff security) was authorised under D-27 without answers to every question it touches (OQ-03, OQ-04, OQ-09, OQ-15, OQ-16, OQ-17, OQ-31). As in Phase 2, the build uses the defaults below. They are **engineering defaults, easy to change, and remain OPEN** until the owner decides. Rationale: ADR-0019.

| ID | Question | Default used | Where |
|---|---|---|---|
| P3-01 | OQ-04 verified e-mail before a session | **Yes.** Correct credentials on an unconfirmed account return `403 email_not_verified` (no session). The confirmation link never signs anyone in; confirming is an explicit click on the page, so mail scanners cannot use the link up | `api/views.py`, `accounts/services.py`, web `/verify-email` |
| P3-02 | OQ-15 account states | `pending_verification` cannot sign in; `active` can; `restricted`, `suspended` and `deactivated` all return `403 account_unavailable` and hold no session. Nothing in the product sets the last three yet (no administration screen) | `api/views.py` |
| P3-03 | OQ-17 numeric parameters | The values proposed in `SECURITY_ARCHITECTURE.md`: password 10–128 characters (NFKC-normalised, Argon2id, common/numeric/similar passwords refused); confirmation link 24 h, reset link 60 min, single use; seeker sessions 7 days idle and 30 days absolute; staff sessions 30 minutes idle and 8 hours absolute (the §3 table proposed 12 h; 8 h from Phase 2 is kept as the stricter value); register 5/hour per IP; resend and reset request 3/hour and 60 s apart per address and 10/hour per IP; link use 10/hour per IP; account writes 60/minute per user; failed passwords 5 per 15 minutes per address (sign-in and re-entry share it); the password is required again for every sensitive action (no 10-minute freshness window); outbox retries at about 30 s, 2 min, 10 min, 1 h, 6 h, then `dead` after 6 attempts | `config/settings/base.py`, `accounts/tokens.py`, `notifications/services.py` |
| P3-04 | OQ-03 e-mail provider | None chosen. Application code talks to an `EmailSender` port; adapters: `file` and `console` (development, CI), `smtp` (generic, unconfigured and untested against any provider) and `none`, the production default, which sends nothing so rows wait in the outbox. Mail is sent by the `process_email_outbox` worker (Compose `worker` service), never in a request | `notifications/` |
| P3-05 | OQ-09 deletion | A signed-in person can **request** deletion (password required), cancel it, and gets a notice. The request is recorded and audited; **nothing is deleted**, no cooling-off or retention period exists, and there is no data export. No privacy notice or terms page exists | `accounts/services.py`, web `/account` |
| P3-06 | OQ-31 saved-item rules | Only `published` listings can be newly saved; saving again is a no-op; at most 200 per person; saved rows stay when a listing closes, and the list reports `open`, `expired`, `withdrawn` or `unavailable` (archived or taken down: no content shown); saving a listing that is not public is a 404. Public listing endpoints stay anonymous and cacheable; the web fetches saved states separately per signed-in request | `opportunities/saved.py` |
| P3-07 | OQ-16 staff protections | **Two-step verification is required by default** (`UPNEXT_STAFF_MFA_REQUIRED`) for any account with a staff role: a time-based code (RFC 6238, 6 digits, no new dependency) or one of 8 single-use recovery codes, in the session, before any `/staff/` page; first sign-in enrols a device. The secret is derived from a server key and a stored random nonce, never stored. Wrong codes limited to 5 per 15 minutes and audited; reset by an Administrator (or break-glass on the server) is audited and ends the person's sessions. `/staff/` also sends a Content-Security-Policy, noindex and the shorter session limits. **Not done:** network restriction, WebAuthn, second-administrator confirmation (OQ-13) | `accounts/mfa.py`, `core/staff_mfa.py`, `core/middleware.py` |
| P3-08 | Session records | The "manage my sessions" table stores the session key (not a hash, unlike the ERD draft) so revocation is a keyed delete; it is the same value Django's own session table already holds | `accounts/models.py` |

**Still open and not built in Phase 3:** profile and onboarding (SC-08), For You (OQ-23), change of e-mail address, deletion execution and data export (OQ-09), account-status administration, analytics and cookie consent (OQ-19), SEO sitemap and structured data, static pages, launch languages (OQ-18), domain and cookie-prefix topology (OQ-01; `__Host-` cookies stay off by default).

## RESOLVED (formerly open)
| ID | Question | Resolution |
|---|---|---|
| OQ-12 | May the approving Editor also publish? | **Yes** — D-18: approver ≠ author is the rule; the approver may publish |
| OQ-25 | Pixel fidelity vs WCAG 2.2 AA where the reference conflicts | **Accessibility wins, minimally** — D-19; deviations DEV-01…DEV-04 **approved** (D-24) |
| OQ-28 | Runtime version pins | **Resolved at Phase 1** — Node.js 24 LTS selected (D-25) and every recommended pin verified for availability, compatibility, advisories and runtime behaviour with none replaced; record in `docs/engineering/PHASE1_VERSION_VERIFICATION.md`. Residual: official support-window pages could not be re-checked from the build environment (task V-05) |
| OQ-32 | Keep the optional Publisher role? | **No** — D-23 |
| OQ-33 | May an author publish their own listing after another person approved it? | **Yes, only for the exact revision another authorised person approved** — D-22 |

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
| OQ-13 | Administrator controls (narrowed by D-18/D-22): second-administrator confirmation for granting the administrator role, break-glass access, bootstrap with a single administrator, and detective controls against one person operating several accounts | Phase 2 |
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
| OQ-29 | Source rules: may a source lack a URL (print/email citation)? https-only for application and source URLs? | Phase 2 |
| OQ-30 | Review thresholds for moving email delivery from the DB outbox to Celery/Redis | Phase 4 |
| OQ-31 | Whether a seeker may save an expired opportunity, and the per-user saved-item cap | Phase 5 |

## Change control
Any change to a CONFIRMED decision requires a dated ADR with rationale, impact and explicit approval. Claude Code may propose but not silently approve changes. D-18 changes parts of D-09, D-19 amends D-08; both are recorded by ADR-0011 and ADR-0012, and the earlier ADRs carry a pointer.
