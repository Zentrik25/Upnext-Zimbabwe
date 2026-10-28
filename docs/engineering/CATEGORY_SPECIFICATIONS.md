# Category specifications — review and approval pack (OQ-06) — DRAFT

Status: **DRAFT — a proposal for the owner. Nothing here is approved or implemented.** Prepared in Milestone M2 (2026-10-28). OQ-06 (category-specific fields) stays **OPEN** until the owner approves; this pack exists so that approval can be one reviewed decision.

**What M2 did and did not do.** It reviewed the six launch categories against the code. It changed **no** schema file, **no** migration, **no** validation rule and **no** meaning of any published listing. The six schemas in `apps/api/catalog/schemas/<category>/v1.json` are still the unchanged DRAFT v1 loaded as version 1 (P2-07). Every proposal below is marked **PROPOSED** and needs a decision in section 7. After approval, a change is a **new version (v2)** through a new reviewed schema file; published listings keep the version they were validated with (ADR-0005, P2-07).

Related: `CATEGORY_SCHEMA_EXAMPLES.md` (the original drafts, 12 Zimbabwean-style examples and per-field rationale), `VALIDATION_SPEC.md` §4 and §7, `schemas-draft/`, ADR-0005 (hybrid data model).

## 1. How category data is stored today

* **Common fields** are columns on each listing revision: title, summary, description, requirements, locations, employment type, work mode, experience level, salary range, funding range, deadline, application method, reference number, sources.
* **Category-specific attributes** live in one JSON document per revision (`detail`), validated against the category's active schema (`additionalProperties: false`, so an unknown field is refused). The schema version is recorded on every revision (`detail_schema_version`).
* Checks run twice: structurally (JSON Schema) and by service rules that a schema cannot express (section 3). A draft only needs to be well-formed; **submit** runs the full publish-grade rules.

## 2. Review result: does the code match the drafts?

| Check (run 2026-10-28) | Result |
|---|---|
| The six loaded v1 schemas have the same properties, limits, enums and required lists as the six draft files in `schemas-draft/` | **Identical** (compared programmatically, ignoring only title, description and id text) |
| Every schema is marked DRAFT / OQ-06 and `additionalProperties: false` | Yes |
| Required detail fields | internships `placement_type`; scholarships `study_level`; tenders `procuring_entity`, `procurement_reference`; grants `funder`, `applicant_types`; jobs and graduate programmes none |
| Common-field applicability (employment type, work mode, experience level, salary, funding) enforced at submit | **Yes**, as in `CATEGORY_SCHEMA_EXAMPLES.md` §2 (`opportunities/validation.py`) |
| Tender closing time required; clarification deadline and site visit before closing; bid opening not before closing | **Yes** |
| Grants: `cofunding_percent` only when co-funding is required | **Yes** |
| Money in detail: currency must be on the allowed list | **Yes**; the list in code is `USD` and `ZWG` only (see F-8) |
| Applicant-payment wording in non-tender listings raises an editorial lint (reviewer must acknowledge) | **Yes** (warning, not a blocker) |
| Rules written in the drafts but **not** enforced in code | See findings F-1 to F-6 below |

### Findings

| # | Finding | Effect today | Proposed handling |
|---|---|---|---|
| F-1 | Jobs: `contract_duration_months` is meaningful only for contract or temporary work; the draft says warn when it is absent for those types. No warning exists. | A fixed-term job can be published without a duration. | Reviewer warning (never a blocker, never defaulted). |
| F-2 | Internships: the draft says `expected_start` should be within 24 months of publication. Not enforced. | A start date years away is accepted. | Reviewer warning. |
| F-3 | The currency check also looks at a key `application_fee`, but **no v1 schema defines `application_fee`**, so it can never be reached (the schema refuses the key first). Only `tender_fee` is live. | None. Dead code, not a defect. | Remove when v2 is created, or define the field in v2 for the categories that need it (decision CS-06). |
| F-4 | Tenders: `site_visit_mandatory = true` does not require `site_visit_at`; `bid_security_note` is allowed without `bid_security_required`. | An inconsistent notice can be published. | Cross-field rules (section 3). |
| F-5 | Graduate programmes: `intake_year` can be earlier than the listing's deadline year. | A past intake can be published. | Reviewer warning when `intake_year` is before the deadline year. |
| F-6 | The original draft expects scholarships and grants to say who may apply from where (`geographic_eligibility`), but the code treats it as optional. | A scholarship can be published without saying who may apply from where. | Decision CS-04: make it required for these two categories, or keep it optional with a warning. |
| F-7 | The profile enum for the seeker's highest qualification (secondary, diploma or certificate, degree, postgraduate) is coarser than the listing vocabulary (`o_level` … `doctorate`). | For You compares two different scales. | Align after CS-02 (vocabulary) is decided. |
| F-8 | `CATEGORY_SCHEMA_EXAMPLES.md` suggests `ZAR`, `GBP` and `EUR` for foreign scholarships and grants, but the code accepts only `USD` and `ZWG` for money inside `detail` (only `tender_fee` today). | No scholarship or grant detail field holds money in v1, so nothing is blocked. | Decision CS-08 before any v2 field carries an amount. |

## 3. Validation rules (what exists, what is proposed)

Existing rules are in force and unchanged. **PROPOSED** rules would be added only as reviewer warnings or in v2, after approval.

| Rule | Status |
|---|---|
| Unknown field refused; types, ranges and enums as in the tables below | Existing |
| Employment type required and limited by category (jobs: permanent, contract, temporary, part time; internships: internship; graduate programmes: trainee; the others: none) | Existing |
| Work mode not for scholarships or grants; experience level and salary not for scholarships, tenders or grants; funding not for jobs, internships or graduate programmes | Existing |
| Tender: closing time required; clarification deadline and site visit before closing; bid opening on or after closing | Existing |
| Grants: co-funding percentage only when co-funding is required | Existing |
| Tender fee: decimal amount, currency from the allowed list | Existing |
| Applicant-payment wording outside tenders: reviewer acknowledgement | Existing (lint) |
| Fixed-term job without duration: warning | **PROPOSED** (F-1) |
| Internship start date more than 24 months away: warning | **PROPOSED** (F-2) |
| Tender: a mandatory site visit needs a site-visit date; a bid-security note needs bid security to be required | **PROPOSED** (F-4) |
| Graduate programme: intake year before the deadline year: warning | **PROPOSED** (F-5) |
| Scholarship and grant: eligibility by country or region stated | **PROPOSED** (F-6, CS-04) |
| Counts and durations are safety bounds, not business rules | Existing; tighten after real data (CS-07) |

Every value that is unknown stays **absent** and is shown as "Not stated". No rule may invent, default or convert a value, salary, deadline or currency.

## 4. Fields by category (v1, generated from the loaded schemas)

Common fields (title, summary, description, locations, deadline, application method, sources and so on) apply to all categories as described in `VALIDATION_SPEC.md` §4; the tables list only the category-specific attributes. "Required at submit" means the schema requires it; other requirements come from the rules in section 3.

#### Jobs (`jobs`) — v1 detail fields as loaded

| Field | Accepted values | Required at submit |
|---|---|---|
| `vacancies` | whole number 1–1000 | no |
| `contract_duration_months` | whole number 1–120 | no |
| `minimum_qualification` | one of: `o_level`, `a_level`, `certificate`, `diploma`, `bachelors_degree`, `honours_degree`, `masters_degree`, `doctorate`, `professional_qualification`, `not_stated` | no |
| `minimum_experience_years` | whole number 0–40 | no |
| `professional_registration` | list of 0–5 unique; text 2–120 | no |
| `languages_required` | list of 0–6 unique; pattern `^[a-z]{2,3}$` | no |
| `driving_licence_required` | yes/no | no |
| `benefits` | list of 0–15 unique; text 2–80 | no |
| `application_documents` | list of 0–20 unique; text 2–100 | no |

#### Internships and attachments (`internships`) — v1 detail fields as loaded

| Field | Accepted values | Required at submit |
|---|---|---|
| `placement_type` | one of: `industrial_attachment`, `internship`, `practicum`, `apprenticeship` | yes |
| `duration_months` | whole number 1–36 | no |
| `expected_start` | date | no |
| `stipend_provided` | one of: `yes`, `no`, `not_stated` | no |
| `eligible_study_levels` | list of 0–5 unique; one or more of: `certificate`, `diploma`, `bachelors_degree`, `honours_degree`, `masters_degree` | no |
| `requires_current_enrolment` | yes/no | no |
| `institution_letter_required` | yes/no | no |
| `vacancies` | whole number 1–1000 | no |
| `application_documents` | list of 0–20 unique; text 2–100 | no |

#### Graduate programmes (`graduate-programmes`) — v1 detail fields as loaded

| Field | Accepted values | Required at submit |
|---|---|---|
| `programme_length_months` | whole number 3–60 | no |
| `intake_year` | whole number 2024–2100 | no |
| `rotations` | yes/no | no |
| `minimum_degree_class` | one of: `first`, `upper_second`, `lower_second`, `third`, `pass`, `not_stated` | no |
| `eligible_fields_of_study` | list of 0–15 unique; text 2–100 | no |
| `max_years_since_graduation` | whole number 0–15 | no |
| `service_bond_stated` | yes/no | no |
| `vacancies` | whole number 1–1000 | no |
| `application_documents` | list of 0–20 unique; text 2–100 | no |

#### Scholarships (`scholarships`) — v1 detail fields as loaded

| Field | Accepted values | Required at submit |
|---|---|---|
| `study_level` | list of 1–8 unique; one or more of: `certificate`, `diploma`, `bachelors_degree`, `honours_degree`, `masters_degree`, `doctorate`, `postdoctoral`, `short_course` | yes |
| `study_destination` | one of: `zimbabwe`, `abroad`, `either` | no |
| `host_institutions` | list of 0–20 unique; text 2–200 | no |
| `eligible_countries` | list of 0–60 unique; pattern `^[A-Z]{2}$` | no |
| `coverage` | list of 0–8 unique; one or more of: `tuition`, `accommodation`, `living_allowance`, `travel`, `books_and_materials`, `research_costs`, `health_insurance`, `other` | no |
| `award_count` | whole number 1–10000 | no |
| `award_duration_months` | whole number 1–96 | no |
| `renewable` | yes/no | no |
| `maximum_age` | whole number 15–80 | no |
| `target_groups` | list of 0–6 unique; one or more of: `women`, `persons_with_disabilities`, `rural_applicants`, `orphans_and_vulnerable_children`, `first_generation_students`, `other` | no |
| `fields_of_study` | list of 0–15 unique; text 2–100 | no |
| `application_documents` | list of 0–20 unique; text 2–100 | no |

#### Tenders (`tenders`) — v1 detail fields as loaded

| Field | Accepted values | Required at submit |
|---|---|---|
| `procuring_entity` | text 2–200 | yes |
| `procurement_reference` | text 1–100 | yes |
| `procurement_method` | one of: `open_tender`, `restricted_tender`, `request_for_quotations`, `request_for_proposals`, `expression_of_interest`, `prequalification`, `other` | no |
| `procurement_category` | one of: `goods`, `services`, `works`, `consultancy`, `other` | no |
| `lots` | whole number 1–500 | no |
| `bidder_requirements` | list of 0–20 unique; text 2–200 | no |
| `mandatory_documents` | list of 0–25 unique; text 2–200 | no |
| `submission_location` | text 2–300 | no |
| `clarification_deadline_at` | date and time with offset | no |
| `site_visit_at` | date and time with offset | no |
| `site_visit_mandatory` | yes/no | no |
| `bid_opening_at` | date and time with offset | no |
| `tender_document_url` | https web address, ≤2048 | no |
| `tender_fee` | amount (decimal text, ≤2 places) and 3-letter currency from the allowed list | no |
| `bid_security_required` | yes/no | no |
| `bid_security_note` | text 2–300 | no |

#### Grants (`grants`) — v1 detail fields as loaded

| Field | Accepted values | Required at submit |
|---|---|---|
| `funder` | text 2–200 | yes |
| `applicant_types` | list of 1–7 unique; one or more of: `individual`, `registered_business`, `cooperative`, `ngo_pvo`, `community_group`, `research_institution`, `other` | yes |
| `thematic_areas` | list of 0–10 unique; text 2–100 | no |
| `cofunding_required` | yes/no | no |
| `cofunding_percent` | number 0–100 | no |
| `grant_duration_months` | whole number 1–120 | no |
| `application_stages` | list of 0–4 unique; one or more of: `concept_note`, `full_proposal`, `interview`, `due_diligence` | no |
| `reporting_requirements` | text 2–500 | no |
| `application_documents` | list of 0–20 unique; text 2–100 | no |

## 5. Compatibility with published data

* No migration is needed to **approve** v1: it is already loaded as version 1 and every published listing carries `detail_schema_version = 1`.
* A **change** to any field list creates v2 for that category. Published listings stay on v1 and keep validating against v1 (ADR-0005). Moving existing listings to v2 would be a separate, owner-approved data step, and is not proposed.
* Adding an optional field, or loosening a limit, is backward compatible. Removing a field, tightening a limit, renaming a value or making a field required is **not**: existing listings could no longer be re-validated on amendment unless they are updated. Those changes need an explicit owner decision per category.
* The public listing page and search read `detail` generically; no screen depends on a particular field list except the facts shown for each category. A v2 field the page does not know is simply not shown until a screen change is approved.

## 6. What the owner is asked to confirm for each category

For every category the owner confirms three things: (1) the field list above is right for Zimbabwe, (2) which fields should become required, and (3) the vocabulary values. The practitioner checks recommended in `CATEGORY_SCHEMA_EXAMPLES.md` §3 (qualification names, language codes, procurement terms, currency codes) are still outstanding and are part of the approval, not assumed.

## 7. Decisions needed (all OPEN)

| ID | Decision | Recommended answer (proposal only) |
|---|---|---|
| CS-01 | Approve the six v1 field lists as the launch lists (OQ-06)? | Approve as they are; add the section 3 warnings as reviewer warnings, which need no schema change |
| CS-02 | Approve the qualification vocabulary (`o_level` … `professional_qualification`) after a check with education and recruitment practitioners? | Approve after the check; then align the profile enum (F-7) |
| CS-03 | Required fields: keep the current required set (internships `placement_type`; scholarships `study_level`; tenders `procuring_entity`, `procurement_reference`; grants `funder`, `applicant_types`)? | Keep |
| CS-04 | Scholarships and grants: require `geographic_eligibility` (F-6)? | Make it required for both |
| CS-05 | Add the PROPOSED warnings F-1, F-2, F-4, F-5 as reviewer warnings? | Yes; warnings only, never blockers |
| CS-06 | Remove the unreachable `application_fee` check, or define an application-fee field in v2 for some categories? | Remove it; do not model applicant fees (keeps the scam guard simple) |
| CS-07 | Tighten safety bounds (vacancies, award count, durations) after real data? | Review after the first 200 live listings |
| CS-08 | Allowed currencies (OQ-22): keep `USD` and `ZWG` only, or add `ZAR`, `GBP`, `EUR` for foreign scholarships and grants (F-8)? | Keep `USD` and `ZWG` until a field needs more; verify the `ZWG` code against ISO 4217 |
| CS-09 | Date-only deadlines (end of day in Africa/Harare, OQ-22): confirm? | Confirm |

Until these are decided, nothing changes in the code, the schemas or published listings.
