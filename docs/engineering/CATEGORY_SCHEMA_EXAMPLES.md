# Category schemas, Zimbabwean examples and validation recommendations — DRAFT

Status: **DRAFT — proposed, not approved.** D-21 / OQ-06: the category-specific schemas stay drafts until you approve the field lists. Nothing here is binding; no table, migration or code exists. Files live under `docs/engineering/schemas-draft/` (documentation location only; the implementation copies, if approved, go to `apps/api/…/schemas/<category>/v1.json` in Phase 2).

**All organisations, notices, references, amounts, e-mail addresses and URLs in the examples are fictional** (`example.org` and similar reserved names). Real places are used only as locations. Domain-specific facts about Zimbabwe (currency codes, qualification names, procurement documents, organisation types) are marked **verify** — they come from general knowledge, not from research in this task, and must be confirmed with people who work in those fields before the enums are approved.

## 1. What was produced and how it was checked

| Artefact | Path |
|---|---|
| 6 draft JSON Schemas (draft 2020-12), one per launch category | `schemas-draft/<category>.v1.draft.schema.json` |
| 12 representative `createDraft` payloads (2 per category: one complete, one sparse with unknowns) | `schemas-draft/examples/<category>-<n>.json` |
| 18 negative cases (inputs that must be rejected) | `schemas-draft/negative-cases.json` |
| Placeholder taxonomy ids used by the examples | `schemas-draft/placeholder-ids.json` (ids are fakes; real ids are created in Phase 2, taxonomy contents are OQ-21) |

Checks run on 2026-10-17 with the `jsonschema` library (Draft 2020-12, format checking on): every schema is a valid 2020-12 schema; every example validates against its category schema **and** against the OpenAPI `createDraft` request body (`DraftContent` + `category`); all 18 negative cases are rejected. This exposed and fixed a real defect in the OpenAPI contract: `DraftContent` forbade extra properties, so a `createDraft` body containing `category` could never validate (now `unevaluatedProperties: false` on the request bodies). These checks prove structural validity only — not that the field choices are right.

## 2. Common-field applicability by category (proposal)

R = required for submit · A = allowed · F = must be absent. Rules enforced by the service at submit (VALIDATION_SPEC §6), not by the JSON Schema.

| Common field | Jobs | Internships | Graduate programmes | Scholarships | Tenders | Grants |
|---|---|---|---|---|---|---|
| employment_type | R: permanent/contract/temporary/part_time | R: `internship` | R: `trainee` | F | F | F |
| work_mode | A | A | A | F | A | F |
| experience_level | A | A | A | F | F | F |
| salary | A | A (use for stipend) | A | F | F | F |
| funding | F | F | F | A | A (estimated value, if published) | A |
| skills / sectors | A | A | A | A (sectors) | A (sectors) | A (sectors) |
| deadline_at | recommended | recommended | recommended | recommended | R (closing time) | recommended |
| application_method | R | R | R | R | R | R |
| reference_number | A | A | A | A | recommended | A |
| locations | R ≥1 | R ≥1 | R ≥1 | R ≥1 (`remote` allowed) | R ≥1 | R ≥1 |

"Recommended" means a publish-time warning to the reviewer, never a blocker and never a defaulted value (an unknown deadline stays `NULL`).

## 3. Cross-category validation recommendations

1. **Never invent:** missing salary, funding, deadline, duration, stipend or class requirement stays absent; the UI says "Not stated". The `not_stated` enum values exist only where the source explicitly gives no answer and the editor wants that recorded.
2. **Money:** decimal strings with two places (no floating point); `currency` required whenever an amount exists; keep the currency as published and never convert. Allowed set **verify (OQ-22)**: `USD` and `ZWG` (the Zimbabwe Gold code — confirm against the ISO 4217 list), plus `ZAR`, `GBP`, `EUR` where a foreign scholarship or grant states them. Legacy ZWL values are not accepted for new listings **[proposal]**.
3. **Dates and time zone:** instants with an offset plus IANA zone (`Africa/Harare`, UTC+2, no daylight saving — verify). Date-only closing dates ("31 December") use `deadline_is_date_only` with end-of-day semantics, which is not yet approved (OQ-22). Sub-dates must be consistent: `clarification_deadline_at` < `deadline_at` ≤ `bid_opening_at`; `site_visit_at` < `deadline_at`; `expected_start` within 24 months of publication; no date may be in the past at submit except historic `observed_on` (≤ 366 days).
4. **Qualification vocabulary:** `o_level`, `a_level` (Zimbabwean secondary levels), `certificate`, `diploma`, `bachelors_degree`, `honours_degree`, `masters_degree`, `doctorate`, `professional_qualification`, `not_stated` — **verify** with education and recruitment practitioners; the profile's `highest_qualification` enum in the API (secondary/diploma_certificate/degree/postgraduate) is coarser and should be aligned if this vocabulary is approved (OQ-21).
5. **Applicant payments (scam guard):** if the title/description of a job, internship, graduate programme, scholarship or grant mentions fees or payments from applicants (registration, processing, application, "deposit"), the reviewer must explicitly acknowledge or reject; tenders may legitimately charge a document fee (`tender_fee`). Editorial lint, not a hard database rule.
6. **Sources:** many Zimbabwean notices appear first in print, by e-mail or on social media. Allow a citation-only primary source for those (OQ-29) but require the reviewer to record whether the issuer's own channel was found; prefer an issuer URL when one exists (example listings jobs-2, scholarships-2, grants-2 use citation-only sources).
7. **Contacts and addresses:** keep free text (`contact_details`, `submission_location`): Zimbabwean phone numbers, P.O. boxes and street descriptions do not fit one structured format reliably. Validate length and absence of control characters only.
8. **Languages:** BCP 47/ISO 639 codes, 2–3 lowercase letters (`en`, `sn`, `nd`, 3-letter codes for languages without a 2-letter code) — **verify** the code list.
9. **Counts and durations:** integer ranges in the schemas are safety bounds, not business rules (e.g., vacancies 1–1000); tighten after real data is seen.
10. **Closed vocabularies are provisional:** enum values are proposals; changing them is a new schema version, not an edit.
11. **Versioning:** each schema `v1` gets a `detail_schema_version`; v2 only through a new reviewed file; published listings keep the version they were validated with (ADR-0005).

## 4. Category sections

Field level: **R** required by the schema · **E** required by editorial rule at submit · **O** optional.

### 4.1 Jobs — `jobs.v1.draft.schema.json`

| Field | Type / constraint | Level | Validation recommendation and rationale |
|---|---|---|---|
| vacancies | integer 1–1000 | O | Often unstated; do not default to 1 |
| contract_duration_months | integer 1–120 | O (warn when employment_type is contract/temporary) | Only meaningful for fixed-term |
| minimum_qualification | enum (§3.4) | O | Aligns with profile matching; `not_stated` when the notice is silent |
| minimum_experience_years | integer 0–40 | O | Distinct from common `experience_level` (coarse band) |
| professional_registration | up to 5 free-text items, 2–120 chars | O | Registration with statutory professional bodies is common in engineering, health, law, accounting; free text until bodies are agreed (**verify**) |
| languages_required | up to 6 language codes | O | English, Shona and Ndebele are the common cases (**verify**) |
| driving_licence_required | boolean | O | |
| benefits | up to 15 items, 2–80 chars | O | Free text; never turned into a salary |
| application_documents | up to 20 items, 2–100 chars | O | e.g. CV, certified copies, cover letter |
Cross-field: `employment_type ∈ {permanent, contract, temporary, part_time}`; salary pair rules (VALIDATION_SPEC §4); deadline in the future.
Examples: `jobs-1` (complete: Harare engineering graduate role with USD salary range, reference number, issuer URL); `jobs-2` (sparse: contract post in Masvingo, **no salary, no deadline, citation-only newspaper source**).
Zimbabwean considerations (verify): salaries are frequently quoted in USD or "negotiable"; closing dates are sometimes missing ("until filled"); many notices say "certified copies".

### 4.2 Internships and attachments — `internships.v1.draft.schema.json`

| Field | Type / constraint | Level | Recommendation |
|---|---|---|---|
| placement_type | enum: industrial_attachment, internship, practicum, apprenticeship | **R** | "Industrial attachment" is the common local term for student placements (**verify**) |
| duration_months | integer 1–36 | O | |
| expected_start | date | O | within 24 months |
| stipend_provided | enum yes/no/not_stated | O | Records whether pay is mentioned **without** inventing an amount; amount, if stated, goes in common `salary` with period `month` |
| eligible_study_levels | up to 5 enum values | O | |
| requires_current_enrolment | boolean | O | Attachments usually require enrolment |
| institution_letter_required | boolean | O | Common requirement for attachments (**verify**) |
| vacancies | integer 1–1000 | O | |
| application_documents | list | O | |
Cross-field: `employment_type = internship`; if `requires_current_enrolment` then `eligible_study_levels` recommended.
Examples: `internships-1` (complete, **date-only deadline**, hybrid, Bulawayo); `internships-2` (sparse: Gweru, allowances not stated, application by instructions).

### 4.3 Graduate programmes — `graduate-programmes.v1.draft.schema.json`

| Field | Type / constraint | Level | Recommendation |
|---|---|---|---|
| programme_length_months | integer 3–60 | O | |
| intake_year | integer 2024–2100 | O | ≥ current year − 1 at submit |
| rotations | boolean | O | |
| minimum_degree_class | enum first, upper_second, lower_second, third, pass, not_stated | O | Local usage ("2.1", "2.2") maps to the enum for display and matching (**verify**) |
| eligible_fields_of_study | up to 15 free-text items | O | Free text until the fields-of-study taxonomy is decided (OQ-21) |
| max_years_since_graduation | integer 0–15 | O | |
| service_bond_stated | boolean | O | Records an explicit bond/retention clause; unknown = absent |
| vacancies | integer 1–1000 | O | |
| application_documents | list | O | |
Cross-field: `employment_type = trainee`.
Examples: `graduate-programmes-1` (complete: Harare/Bulawayo, 24 months, lower-second, rotations); `graduate-programmes-2` (sparse: no deadline, class `not_stated`, aggregator source).

### 4.4 Scholarships — `scholarships.v1.draft.schema.json`

| Field | Type / constraint | Level | Recommendation |
|---|---|---|---|
| study_level | 1–8 enum values | **R** | The one fact every scholarship seeker filters on |
| study_destination | enum zimbabwe, abroad, either | O (E recommended) | Key for Zimbabwean applicants |
| host_institutions | up to 20 items, 2–200 chars | O | Free text; no institution registry yet |
| eligible_countries | up to 60 ISO 3166-1 alpha-2 codes | O | Absent = not stated, **not** "open to all" |
| coverage | up to 8 enum values | O | Tuition, accommodation, living allowance, travel, books, research, insurance |
| award_count | integer 1–10000 | O | |
| award_duration_months | integer 1–96 | O | |
| renewable | boolean | O | |
| maximum_age | integer 15–80 | O | |
| target_groups | up to 6 enum values | O | e.g. women, rural applicants; eligibility restrictions must be stated by the issuer, never inferred |
| fields_of_study | up to 15 items | O | |
| application_documents | list | O | |
Common fields: `funding_min/max/currency/period` hold the award value (period `year` or `once`); `geographic_eligibility` free text complements `eligible_countries`.
Examples: `scholarships-1` (complete: master's, USD 8,000–12,000 per year, Zimbabwe-only, 24 months); `scholarships-2` (sparse: rural girls bursary, **value and deadline unknown**, print source).

### 4.5 Tenders — `tenders.v1.draft.schema.json`

| Field | Type / constraint | Level | Recommendation |
|---|---|---|---|
| procuring_entity | string 2–200 | **R** | Issuer of the procurement, may differ from the common organisation |
| procurement_reference | string 1–100 | **R** | Exact reference as published; used with entity for duplicate detection |
| procurement_method | enum open_tender, restricted_tender, request_for_quotations, request_for_proposals, expression_of_interest, prequalification, other | O (E recommended) | |
| procurement_category | enum goods, services, works, consultancy, other | O (E recommended) | |
| lots | integer 1–500 | O | |
| bidder_requirements | up to 20 items | O | Free text now; do **not** hard-code names of regulators or certificates until a procurement-literate reviewer confirms them (**verify**: supplier registration, tax clearance and company registration are typical) |
| mandatory_documents | up to 25 items | O | |
| submission_location | string 2–300 | O | Physical submission is still common; free text |
| clarification_deadline_at, site_visit_at, bid_opening_at | date-time | O | ordering rules in §3.3 |
| site_visit_mandatory | boolean | O | |
| tender_document_url | https URL | O | URL rules of VALIDATION_SPEC §4.1; never fetched server-side |
| tender_fee | {amount, currency} | O | Legitimate here; applicant-payment lint is suppressed for this field only |
| bid_security_required, bid_security_note | boolean, ≤300 chars | O | |
Cross-field: closing time (`deadline_at`) is required for tenders; `application_method` is `instructions` or `email` in the examples.
Examples: `tenders-1` (complete: Mutare, sealed bids, site visit, document fee); `tenders-2` (RFP by e-mail, document URL, minimal detail).
Zimbabwean considerations (verify): public notices carry strict closing times; physical tender boxes; procurement reference formats vary by entity.

### 4.6 Grants — `grants.v1.draft.schema.json`

| Field | Type / constraint | Level | Recommendation |
|---|---|---|---|
| funder | string 2–200 | **R** | |
| applicant_types | 1–7 enum values | **R** | individual, registered_business, cooperative, ngo_pvo, community_group, research_institution, other — **verify** (private voluntary organisation terminology) |
| thematic_areas | up to 10 items | O | |
| cofunding_required | boolean | O | |
| cofunding_percent | number 0–100 | O | only when `cofunding_required` is true (service rule) |
| grant_duration_months | integer 1–120 | O | |
| application_stages | up to 4 enum values | O | concept note → full proposal → interview → due diligence |
| reporting_requirements | string ≤500 | O | |
| application_documents | list | O | |
Common fields: `funding_*` for the amount range.
Examples: `grants-1` (complete: Gweru community grant, USD 2,000–10,000, two stages); `grants-2` (sparse: research fund, no amount/deadline, e-mailed circular as source).

## 5. Decisions needed from you (all remain OPEN)
1. Approve, amend or reject each category's field list (OQ-06) — especially which fields are **R**.
2. Currency allow-list and date-only deadline rule (OQ-22).
3. Qualification vocabulary and whether to refine the profile's `highest_qualification` (OQ-21).
4. Whether citation-only sources are acceptable (OQ-29) and the duplicate rules (OQ-08).
5. Who can confirm the domain facts marked **verify** (procurement, education, professional bodies, ISO currency codes).
