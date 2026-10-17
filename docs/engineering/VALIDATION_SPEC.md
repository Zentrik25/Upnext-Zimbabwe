# Field-level validation specification — DRAFT

Status: DRAFT. Limits and patterns are **PROPOSED** engineering values for review (they are not business decisions). Items that depend on an owner decision are tagged `[OQ-n]` and are not defaulted. Validation is enforced twice: at the API boundary (serializers → machine-readable field errors) and in the service/database (constraints in ERD.md). The client may mirror rules for UX but is never trusted.

## 1. General rules

| Rule | Spec |
|---|---|
| Text normalisation | Unicode NFC; trim leading/trailing whitespace; collapse internal whitespace to one space for single-line fields; reject control characters (U+0000–U+001F, U+007F) except `\n` in multiline fields; reject unpaired surrogates |
| Length | counted in Unicode code points after normalisation |
| Required vs optional | "required" = present and non-empty after trim. Optional empty strings are stored as `NULL`, never as `""` |
| Unknown values | never defaulted: an unknown salary/deadline/requirement is `NULL` and rendered as "Not stated" |
| Unknown input fields | rejected (`unknown_field`) on writes |
| Enums | exact match, lower snake case |
| Error shape | `{error:{code:"validation_failed", message, request_id, fields:{<path>:[{code, message}]}}}`; codes in §11 |
| Draft vs publish-grade | `save_draft` enforces types and maximum lengths only; `submit` enforces the full publish-grade rules (§6) |
| Rich text | Markdown subset only (§5); no raw HTML |

## 2. Identity and account

| Field | Type | Rules |
|---|---|---|
| email | string | trim; lowercase domain; single `@`; ≤254; local part ≤64; no whitespace/control; basic RFC 5322 addr-spec (no quoted local parts, no comments, no display names); stored `citext`, unique. Deliverability is proven only by verification, not syntax |
| password | string | length 10–128 code points `[PROPOSED, OQ-17]`; no composition rules; reject if in the common-password list, if numeric-only, or if too similar to email/display name; not logged; NFKC-normalised before hashing; Argon2id |
| display_name | string | 1–80; no control chars; no URLs/emails (anti-spam) |
| token (verification / reset) | string | `<base64url(id)>.<base64url(HMAC)>` (SECURITY_ARCHITECTURE §3.5); ≤200 chars; MAC verified in constant time before any database lookup result is revealed |
| remember/consent flags | — | none in Release 1 |

## 3. Profile

| Field | Rules |
|---|---|
| country | ISO 3166-1 alpha-2 uppercase; default `ZW` |
| highest_qualification | enum `secondary, diploma_certificate, degree, postgraduate` or null; "prefer not to say" = null |
| experience_level | enum `none, entry, mid, senior, executive` or null `[value set to confirm]` |
| work_arrangements | subset of `on_site, hybrid, remote`; unique values; ≤3 |
| category_interests | ≤6 distinct active `category.code`s; ≥1 required **only** to enable For You |
| sector_interests | ≤10 distinct active sector ids |
| preferred_locations | ≤10 distinct active location ids |
| skills | ≤30 distinct active, approved skill ids `[OQ-21: free-text skill suggestions undecided]` |
| fields_of_study | ≤5 distinct ids `[OQ-21]` |
| whole profile | PATCH is partial; `null` clears an optional field; omitted = unchanged; a user can remove any item; no field is required to browse or save |

## 4. Opportunity — common fields (publish-grade, at submit)

| Field | Req. | Rules |
|---|---|---|
| category | yes | active `category.code`; immutable after creation |
| organisation | yes | existing organisation id; or created inline with name 2–200 |
| title | yes | 5–200; must not be all caps (reject if >60% letters uppercase); no emoji-only; no URL; no trailing "!!!" patterns (editorial lint, warning not error) |
| summary | yes | 20–300; plain text |
| description_md | yes | 50–20,000; Markdown subset (§5) |
| requirements_md | no | ≤10,000; Markdown subset |
| locations | yes (≥1) | 1–5 active location ids; exactly one primary; `remote` location allowed with others |
| location_text | no | ≤200 |
| geographic_eligibility | no | ≤500; required by scholarship/grant schemas `[OQ-06]` |
| work_mode | no | enum |
| employment_type | no | enum; required for category `jobs` `[OQ-06]` |
| experience_level | no | enum |
| salary_min / salary_max | no | decimal ≥0, max 12 integer digits, 2 decimals; both optional; `min ≤ max`; **never inferred or defaulted** |
| salary_currency | cond. | required if any salary value; ISO 4217 alpha-3 uppercase; allowed set `[OQ-22]` |
| salary_period | cond. | required if any salary value; enum `hour, day, month, year, once` |
| funding_min / funding_max / funding_currency | no | same rules as salary (funding for scholarships/grants/tenders) |
| deadline_at | no | timezone-aware; NULL = unknown (shown as "Deadline not stated"); at submit and at publish must be **> now**; ≤ now + 3 years |
| deadline_timezone | cond. | required if deadline_at; valid IANA name; default suggestion `Africa/Harare` is a UI hint only |
| deadline_is_date_only | no | boolean; when true the instant is derived as end of that calendar day in `deadline_timezone` `[OQ-22 — semantics not yet approved]` |
| application_method | yes | enum `external_url, email, instructions` `[OQ-05 external-only handoff not confirmed]` |
| application_url | cond. | required for `external_url`; §4.1 |
| application_email | cond. | required for `email`; email rules; displayed as given |
| application_instructions | cond. | required for `instructions`; 20–2,000 plain text |
| reference_number | no | ≤100; plain text |
| contact_details | no | ≤500; plain text |
| skills (version_skill) | no | ≤30 approved skill ids with required flag |
| sectors | no | ≤5 ids |
| detail (JSONB) | yes (may be `{}` if the schema allows) | validated against the active category schema (§7); `detail_schema_version` recorded; additional properties rejected |

### 4.1 URL validation (`application_url`, `source.url`, `organisation.website_url`)
- ≤2,048 chars; parseable; scheme must be `https` (`http` rejected `[OQ-29]`); `javascript:`, `data:`, `file:`, `ftp:`, `mailto:` and others are always rejected.
- Host required; IDN converted to punycode for storage and shown in Unicode with the punycode form available; no userinfo (`user:pass@`); no IP-literal hosts; no `localhost`/internal suffixes; port only 443.
- Normalised: lowercase scheme/host, drop fragment, strip default port, remove tracking parameters on a maintained deny-list (`utm_*`, `fbclid`, `gclid`).
- **No server-side fetch** of these URLs in Release 1 (no SSRF surface). Display shows the destination domain; rendered with `rel="noopener noreferrer nofollow ugc"`, `target=_blank`.

## 5. Markdown subset (description_md, requirements_md)
Allowed: paragraphs, line breaks, headings h3–h5, bold, italic, ordered/unordered lists, blockquote, links (https only, same URL rules), inline code. Disallowed: raw HTML, images, tables, iframes, footnotes, autolinks to non-https, `javascript:` anywhere. The server renders to sanitised HTML with an allow-list sanitiser (library chosen at Phase 2); the client never renders unsanitised HTML and never uses `dangerouslySetInnerHTML` on user content. Maximum **20** links per field.

## 6. Submit-grade rules and duplicate handling

At T03 (submit) and again at T07 (publish) the service verifies, returning all failures at once:
1. every required field above; 2. `detail` valid against the active schema; 3. ≥1 source and exactly one primary (§8); 4. deadline in the future if present; 5. URLs valid; 6. content passes the Markdown sanitiser; 7. duplicate check.

**Duplicate check (candidate rules, `[OQ-08]`):**
- *Hard duplicate (blocks submit unless the author links the listing as an intentional separate item with a reason):* an existing non-archived listing with the same normalised primary source URL; or same normalised application URL and same organisation.
- *Soft duplicate (warning shown to author and Editor):* same organisation and trigram title similarity ≥ 0.8 within 90 days; same reference number + organisation.
- The result is recorded in the review checklist; the Editor makes the final call.

## 7. Category detail schemas (versioned JSON Schema, draft 2020-12) — **candidate v1, OQ-06**

Rules for all categories: `additionalProperties: false`; integer `schema_version` mirrored in the row; a published version keeps the schema version it was validated with; schema changes create a new version (never edit an active one); old versions stay readable. Fields below are **candidate** and require owner approval before Phase 2; `*` = required by the candidate schema.

| Category | Candidate `detail` properties |
|---|---|
| jobs | `seniority` enum, `contract_duration_months` int 1–120, `vacancies` int 1–1000, `qualification_required` enum (as profile), `application_documents` string[] ≤10 |
| internships | `duration_months` int 1–36, `stipend_stated` bool, `eligible_study_levels` enum[], `placement_type` enum (`industrial_attachment, internship, practicum`), `accepts_current_students` bool |
| graduate-programmes | `programme_length_months` int 1–60, `intake_year` int, `rotations` bool, `minimum_degree_class` string ≤50, `graduation_window` string ≤100 |
| scholarships | `study_level`* enum[], `institution` string ≤200, `eligible_countries` ISO-2[] ≤60, `coverage` enum[] (`tuition, living, travel, research, other`), `award_count` int, `renewable` bool |
| tenders | `procuring_entity`* string ≤200, `procurement_reference`* string ≤100, `procurement_category` enum, `mandatory_documents` string[] ≤20, `submission_location` string ≤300, `bid_security_required` bool, `site_visit_at` timestamptz |
| grants | `funder`* string ≤200, `applicant_types`* enum[] (`individual, registered_business, ngo, research_institution, community_group`), `thematic_areas` string[] ≤10, `cofunding_required` bool |

Example fragment (shape only, jobs v1): `{ "$schema": "https://json-schema.org/draft/2020-12/schema", "type":"object", "additionalProperties": false, "properties": { "seniority": {"enum":["entry","mid","senior","executive"]}, "vacancies": {"type":"integer","minimum":1,"maximum":1000} } }`. Searchable attributes (location, deadline, employment type, work mode, experience level, salary/funding, sector, skills, organisation) remain relational columns; nothing the filters need lives only inside JSONB.

## 8. Sources, verification and review records

| Field | Rules |
|---|---|
| source.kind | enum as ERD |
| source.name | 2–200 |
| source.url | §4.1 or NULL |
| source.citation | ≤500; required when url is NULL `[OQ-29]` |
| source.observed_on | date, not in the future, not older than 366 days at submit |
| source.is_primary | exactly one per version |
| verification.level | `source_checked` or `issuer_verified` |
| verification.method | enum; `issuer_verified` requires `issuer_contact` or `document_review` `[OQ-07]` |
| verification.outcome | enum |
| verification.evidence_note | 20–2,000; plain text; no file upload in Release 1 |
| review.reason | 10–2,000 for reject/return |
| review.checklist | object with boolean keys `source_reviewed, duplicates_reviewed, content_matches_source` — all true to approve |
| transition.reason (takedown/withdraw/manual expire) | enum code + text 10–1,000 |

## 9. Identifiers, slugs, queries

| Item | Rules |
|---|---|
| ids in URLs/bodies | canonical lowercase UUID; invalid → 404 for GET by id, `validation_failed` in bodies |
| **slug** | generated at first publication from the title: ASCII-fold, lowercase, non-alphanumerics → `-`, collapse, truncate to 60 chars at a word boundary, then append `-` + 6 random chars from `[a-z2-9]` (no look-alikes); regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`; 8–80 chars; unique; **immutable once assigned**; reserved words (`new, edit, search, saved, api, admin, account, category, categories`) cannot be a whole slug; lookups are case-insensitive but responses always use the canonical lowercase slug |
| q (keyword) | trim; 1–100 chars after normalisation; empty/missing = browse; parsed with PostgreSQL `websearch_to_tsquery` (no operators executed as SQL; unsupported syntax treated as text); control chars rejected |
| filters | `category` ∈ category codes; `location` = location slug or id; `work_mode`, `employment_type`, `experience_level` enums; `deadline_state` ∈ `open, closing_soon, unknown, expired`; `organisation_id` uuid `[OQ-24]`; `posted_within_days` int 1–365; unknown parameter or value → 400 `invalid_filter` with the parameter name; multi-value filters comma-separated, ≤10 values |
| sort | `relevance` (only valid with `q`), `newest`, `closing_soon`; default `newest` without `q`, `relevance` with `q` |
| pagination | `limit` int 1–50, default 20; opaque `cursor` ≤512 chars; tampered cursor → 400 `invalid_cursor`; cursors are signed, versioned and tied to sort+filters |
| deadline_state (derived) | `expired` if `deadline_at ≤ now`; `closing_soon` if within 7 days `[window PROPOSED]`; `open` if later; `unknown` if NULL; computed per request as a UTC instant comparison against `deadline_at` (timezone is for display only) |

## 10. Saved items, sessions, outbox
- Saved: `opportunity_id` uuid of a listing that has been publicly visible `[OQ-31]`; idempotent PUT; cap **500** per user `[PROPOSED, OQ-31]`.
- Session revoke: id must belong to caller (else 404).
- Account deletion request: requires current password; confirms intent with the phrase "DELETE" typed in the UI (client convenience, server checks password).
- Outbox: `idempotency_key` = `<kind>:<token_id or event_id>`; `to_address` validated as email; payload ≤10 KB.

## 11. Error code catalogue (field level)
`required, blank, too_short, too_long, out_of_range, invalid_format, invalid_choice, invalid_url, disallowed_scheme, invalid_email, invalid_timezone, invalid_currency, invalid_date, in_past, too_many_items, duplicate_item, unknown_field, schema_violation, source_required, primary_source_required, weak_password, password_in_breach_list, not_found_reference, immutable_field, markdown_disallowed`.

## 12. Test requirements
Boundary tests for every limit (min−1, min, max, max+1), normalisation tests (NFC, whitespace, control chars), URL fuzz corpus (schemes, userinfo, IP hosts, unicode hosts, overlong), Markdown sanitisation corpus (XSS payloads), enum exhaustiveness, JSON Schema fixtures per category/version, slug collision and immutability, search-query injection corpus, cursor tamper tests.
