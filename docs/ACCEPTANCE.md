# MVP acceptance gates

- Public browsing/search/detail pages work without authentication.
- Personalized feed/bookmarks/profile changes require authentication and prevent cross-account access.
- Editorial publishing requires reviewer/admin permission; unpublished content is not publicly accessible or indexed.
- Opportunity page shows source, status, deadline or unknown state, and external application destination.
- Matching explanations align with actual deterministic scoring; no guarantee-of-eligibility language.
- Design conforms to reference: square corners, no shadows/gradients, compact controls, responsive at 320/375/768/1440 widths.
- API tests cover permissions, filtering, search, editorial transitions, expiry and invalid inputs.
- E2E tests cover visitor discovery, registration, profile, save/unsave and editor publishing.
- Automated checks run with reported commands/results; no critical security findings.
- Deployment changes documented and approved, with tested backup and rollback approach.
