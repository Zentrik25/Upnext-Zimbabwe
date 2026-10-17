# Screen specifications — DRAFT
For each screen, review desktop (1440px), tablet (768px) and mobile (390px) against approved HTML.

| Screen | Required sections | Key states |
|---|---|---|
| Home | compact search, category navigation, recent/featured opportunities | loaded, empty, error |
| Search/results | query, filters, sort, cards, pagination | loading, zero results, invalid filter |
| Opportunity detail | title, organisation, category, location, source, deadline, requirements, application CTA | active, expired, unknown deadline, unavailable source |
| Registration/login | accessible fields, errors, password reset link | success, validation, rate-limited |
| Onboarding/profile | optional qualifications, interests, skills, location | incomplete, saved, validation |
| For You | match explanation, results, profile-edit action | incomplete profile, no matches |
| Saved | saved list and remove control | empty, expired listing |
| Editorial | draft form, provenance, approval queue, history | conflict, rejection, publish failure |

**Design signoff:** pixel/visual comparison with `reference/approved-flat.html`; deviations require an explicit design decision record.
