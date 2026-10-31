# Job editor and job page (D-55) — DRAFT

Status: DRAFT for owner review. Branch `ccr-9d9ecf81-ozrhfg`, draft pull request only: nothing is merged or deployed. Decision: D-55 in `docs/governance/DECISION_REGISTER.md`. Screenshots: `docs/design/job-editor/`.

## 1. Before and after

**Before** (`draft-editor.tsx` and `new-draft-form.tsx`): a create form of four inputs, then an editor with about 38 inputs open at once for a job (plus one checkbox per sector): 10 in "Basics" and "Where and what kind", 8 for pay and funding, 5 for deadline and apply, 9 category detail fields, 6 per source. Eight sections, cards in a 820px column.

**After** (`job-editor.tsx`): one column, 11 essential fields in order, then three collapsed sections.

| # | Main form (always visible) | Stored in | Note |
|---|---|---|---|
| – | Category (new drafts only, then fixed) | `Opportunity.category` | immutable by a database trigger, so it is chosen once, up front |
| 1 | Job title | `title` | |
| 2 | Organisation | `organisation` | search; an editor or contributor may add one (`org.create`) |
| 3 | Vacancies | `detail.vacancies` | shown only where the category schema has it; no new column |
| 4 | Location | `locations` (first = primary) | search, up to 5; Zimbabwe (nationwide) and Remote in one click |
| 5 | Job type | `employment_type` | optional; per category; `full_time` is new |
| 6 | Salary | `salary_*` or `salary_text` | not stated / amount / range / the source's own wording; wording never with an amount |
| 7 | Closing date | `deadline_*` | optional; end of that day, Harare time |
| – | Job overview (optional) | `summary` | no longer required |
| 8 | Key responsibilities | `description_md` | bullet helper; "Description" for non-job categories |
| 9 | Qualifications & experience | `requirements_md` | optional |
| 10 | How to apply | `application_method`, `application_url`, `application_email`, `application_email_subject`, `application_instructions` | website / e-mail / both / instructions only; only the needed fields appear |
| 11 | Original source | primary row of `sources` | link, type, or a written reference; name from the address; dated today when new or changed |

Collapsed sections: **More details** (work arrangement, experience level, reference, contact, who may apply, location as written, funding where pay does not apply, sectors, every other category detail: contract duration, minimum qualification and experience, registration, languages, driving licence, benefits, documents); **Media & SEO** (address, search title and description, sharing title and description, sharing preview); **Source & verification** (checked-on date, further sources, verification status and history, a note that a source is not proof).

Nothing stored is dropped: a draft saved with the old editor opens with its values in the same fields, and fields the main form no longer shows are kept and sent back unchanged (tests: "drafts saved before the simplified editor").

## 2. What changed in the data (additive only)
Migrations `opportunities.0007`, `0008` and `profiles.0002` add nullable columns and choices: `salary_text`, `application_email_subject`, `seo_title`, `seo_description`, `og_title`, `og_description`, `slug_hint`; job type `full_time`; application method `both`. No column is altered, renamed, dropped or back-filled.

- **Hashing.** The new columns enter the revision hash only when set, so every revision approved before keeps its hash; a test asserts it. The database freeze trigger compares whole rows, so it already protects them.
- **Validation relaxed (publish rules).** Summary: optional, but 20–300 characters when given. Body: responsibilities and qualifications together must hold 50 characters. Job type: optional, but must fit the category when stated. Unchanged: title, location, deadline, source, duplicate and category-schema rules, the fee lint and every separation-of-duties rule.
- **Address.** Chosen before first publication, checked at save time against listings and other open drafts, malformed or reserved addresses refused, used at first publication; a published address never changes (permanent URLs and redirects are untouched).
- **Employers** cannot set the address or the search and sharing text (`staff_only_field`); their moderation path is unchanged.

## 3. Publishing safeguards (unchanged)
Publish uses the existing `publish_direct` action (Editors and Administrators, staff-created listings only) and Submit uses `submit`; both run the same publish-grade validation, duplicate check, checklist and audit. A contributor sees "Submit for review"; nobody approves their own work except under D-46. Verification stays a separate, independent record. A source link is not proof.

## 4. The public page
Order: title; organisation with its genuine verification level; one line of the facts present (location, job type, work arrangement, salary or wording, vacancies, deadline); apply action(s); overview; key responsibilities; qualifications; more details; how to apply; where it came from; related verified opportunities. Each fact appears once.

| Method | Button(s) | Destination |
|---|---|---|
| website | Apply Now | the https address, new tab, `rel=noopener nofollow ugc` |
| e-mail | Apply via Email | `mailto:` with the recipient and, if set, the encoded subject |
| both | both | each its own |
| instructions | View Application Instructions | `#how-to-apply`; no destination is invented |

Closed, withdrawn and past-deadline listings show their status and no apply action or How to apply section. Share uses the device share sheet or copies the link and says so; a phone-only Apply bar appears above the tab bar once the main button has scrolled away. Metadata uses the staff-set search and sharing text, otherwise the title, summary or the start of the body.

## 5. Not built, and why
- **Featured image, social image, uploaded source evidence.** There is no file storage anywhere in the system. An upload path needs a decision on storage, type and size limits, malware scanning, retention and privacy, and it cannot be built honestly as a button. Until then links are shared with the standard UPNEXT image and the source is a link or a written reference. **Owner decision needed (new OQ).**
- **Organisation logos.** There is no field and none is invented; the page shows the name.
- **Autosave on a brand-new draft** starts once a category, organisation and title exist (they are what a draft needs); before that the editor says so.

## 6. Tests
Backend: `tests/test_job_editor.py` (30): optional fields, salary wording, both and instructions-only, addresses (malformed, reserved, duplicate, two drafts, permanent), search text limits, employers refused, hash stability, frozen revisions, amendments, staff and public API, preview. Frontend: `tests/unit/job-editor.test.ts` (17, payload and state), `tests/unit/job-view.test.tsx` (18, page order, every apply method, closed, missing fields, share, sticky bar). Browser: the CMS journey drives the new form; the account and a11y specs are unchanged. Run locally: axe at 320, 390, 768 and 1440 px on the editor and the public page (no violations, no horizontal overflow), light and dark.
