# Domain model — DRAFT
Entities: User, Profile, Skill, Qualification, Interest, LocationPreference, Organisation, Opportunity, OpportunityCategory, OpportunityRequirement, OpportunitySource, VerificationRecord, EditorialRevision, SavedOpportunity, MatchExplanation, AuditEvent.

Opportunity common fields: UUID, slug, title, category, organisation, summary, body, location, work mode, published/closing timestamps with timezone, application URL, source URL, editorial status, verification status, created/updated timestamps. Category-specific typed attributes must be validated by category rather than stored as ambiguous free text.

Key invariants: source provenance required for publishing; no fabricated deadlines; only approved roles publish; saved items unique per user/opportunity; changes to published data auditable; no irreversible destructive migrations without explicit review.

Open: taxonomy and exact field requirements for scholarship/tender/grant; soft deletion and retention policy; organisation identity verification rules.
