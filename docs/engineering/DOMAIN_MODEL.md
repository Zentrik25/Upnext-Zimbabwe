# Domain model — DRAFT
Authoritative detail: `ERD.md` (tables, constraints, relationships), `EDITORIAL_WORKFLOW.md` (states), `VALIDATION_SPEC.md` (fields), `ROLE_PERMISSION_MATRIX.md` (who may do what). This file states the domain concepts and invariants only.

## Concepts
- **Identity:** User (account status), StaffRoleAssignment, AuthToken, UserSession.
- **Seeker data:** Profile with category/sector interests, preferred locations, skills, fields of study; SavedOpportunity.
- **Reference data (taxonomies):** Category, Location, Sector, Skill, FieldOfStudy, DetailSchema (versioned JSON Schema per category).
- **Content:** Organisation; Opportunity (lifecycle aggregate: slug, status, live and pending version); OpportunityVersion (immutable snapshot: relational searchable fields + versioned category JSONB).
- **Trust:** OpportunitySource (provenance), VerificationRecord (separate, evidence-based), ReviewDecision.
- **History and operations:** PublishingEvent, AuditEvent, EmailOutbox, JobRun.
- **Computed, not stored:** match explanations (returned with a model version), deadline state.

## Key invariants
1. Immutable internal uuid ids; public listing slug assigned once at first publication and never changed (D-13).
2. Source provenance is required to publish; verification is a separate label and is never implied by publication (D-14).
3. No fabricated deadlines, salaries or requirements: unknown = NULL, displayed as not stated.
4. Nobody approves or verifies their own listing. Publication requires approval of the exact revision by a different authorised person (D-22); an Editor or Administrator may then publish, including the author. Every transition is audited.
5. Non-draft versions are immutable; changes are new versions; approval is bound to the content hash.
6. Saved items unique per (user, opportunity); personal data is scoped to its owner.
7. Every change to published data and every privileged or security action is audited, append-only.
8. No irreversible destructive migration without explicit review.

## Open (see register)
Category-specific fields (OQ-06); taxonomies (OQ-21); verification policy (OQ-07); duplicate rules (OQ-08); retention and deletion (OQ-09); deadline semantics (OQ-22).

## Deferred (D-15)
Eligibility assessment, public organisation pages, related-opportunity engine, object storage, alerts/notification preferences, employer accounts, payments.
