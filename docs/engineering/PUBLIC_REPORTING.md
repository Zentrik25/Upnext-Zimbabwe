# Public reporting and staff moderation — DRAFT

Status: DRAFT (M2, owner instruction 2026-10-28, D-41). Implemented in `apps/api/reports/`, `apps/api/api/report_views.py`, `apps/web/src/components/opportunities/report-form.tsx` and the Django Admin. Nothing is deployed. Legal text is for review (B-02).

## 1. What a visitor can do

On every public opportunity page there is **Report this opportunity** (`/opportunities/{slug}/report`). No account is needed. The form has:

* a reason: *Suspected fake job*, *Recruitment scam or payment request*, *Incorrect application information*, *Expired listing*, *Misleading content*, *Duplicate listing*, *Other concern*;
* details, 10 to 2000 characters of plain text;
* an optional https link as evidence (stored, shown to staff as a link with `rel="noopener noreferrer nofollow"`, **never fetched**);
* an optional e-mail address, only if the person is happy to be asked one question.

There is **no file upload**. The visitor gets a reference such as `R-7KQ2M9XA` and is told plainly that the listing is not removed automatically.

API: `POST /api/v1/opportunities/{slug}/reports` (`createListingReport`): 202 with `{reference, message}`; 400 field errors; 404 for an unknown **or non-public** listing (the two look the same); 413; 429.

## 2. Abuse protection (no third-party service)

| Measure | Detail |
|---|---|
| Server-side validation | Same limits as the form; control characters refused; the link must be https; the e-mail must be valid |
| Rate limit per client | 5 reports per hour per client network address (`UPNEXT_THROTTLE_REPORT`, shared database cache, keyed hash of the address) |
| Cap per listing | At most 30 new reports per listing in 24 hours (`UPNEXT_REPORT_LISTING_DAILY_CAP`); beyond that the reporter is told staff already see it |
| Repeats collapse | The same client reporting the same listing for the same reason while that report is open adds nothing to the queue: it returns the same reference and raises a repeat counter. Enforced by a partial unique index, so concurrent requests cannot create two |
| Honeypot | A field people and assistive technology never see; if filled, the answer looks like success and nothing is stored |
| No cookie, no CSRF token needed | The endpoint reads no session, so it cannot be driven by a signed-in browser's cookies |
| Hidden listings | Drafts and unpublished listings cannot be reported and look the same as a missing listing |

## 3. What is stored

`reports_listingreport`: reference, listing, the live revision at the time, reason, details, evidence link, optional contact e-mail, a keyed hash for collapsing repeats, repeat count, status, outcome, who closed it and when. `reports_reportevent`: every step, append-only (a database trigger refuses UPDATE and DELETE). The audit log gets `report.created` and one row per staff step with **no free text**. **No IP address or browser string is stored.** The contact e-mail and the repeat hash are cleared 30 days after the report is closed (worker retention step) and at once when the account with that address is deleted. See `docs/legal/DATA_INVENTORY.md` section B3.

## 4. Staff handling (staff workspace, `/workspace/records/reports`)

* **Queue:** escalated first, then new, investigating, closed; filter by work queue (new, assigned to me, escalated, all open, closed), status, reason, and "listing has several open reports"; search by reference, listing, text.
* **Case page:** what was reported (reporter text is escaped; the link is shown only if it is https), the listing and links to its public page, other reports on the same listing, the full history, and the actions the person may take.
* **Actions:** take for investigation, add a note, escalate, resolve (*listing corrected through its own workflow* or *checked, no action needed*), dismiss (*not substantiated, already handled, out of scope, spam*), **act on the listing** (expire, withdraw, take down), and reopen (Administrators only). Every form carries the version the person saw; a stale form is refused.
* **Permissions** (`ROLE_PERMISSION_MATRIX.md`): Editors and Administrators read, triage and resolve; only Administrators close an escalated report or reopen one. Contributors and seekers see nothing.
* **Separation of duties (D-18, D-22):** a person who authored, submitted or created any revision of the listing **cannot resolve, dismiss or act on the listing through a report about it**. They can add notes and escalate, so what they know reaches the case.
* **A report never changes a listing.** "Act on the listing" calls the existing publishing service (`expire`, `withdraw`, `takedown`) with the actor's own permissions, in one transaction with the report update. That produces the normal publishing event and audit row, which the report history links to. If the workflow refuses, nothing changes.
* **Audit:** every step writes a report event and an audit event in the same transaction as the change.

## 5. Provisional choices and owner decisions (all OPEN)

| ID | Choice or question | Provisional answer |
|---|---|---|
| P-REPORT-01 | Should the reporter get an e-mail acknowledgement or outcome? | **No.** The reference is shown on screen only. Sending to an unauthenticated address needs the provider (B-01) and a decision on abuse |
| P-REPORT-02 | How long are closed reports, staff notes and events kept? | Undecided (OQ-09). Contact e-mail and repeat hash: 30 days after closing (provisional, `UPNEXT_RETENTION_REPORT_CONTACT_DAYS`) |
| P-REPORT-03 | Rate limits | 5 an hour per client; 30 a day per listing. Revisit after real traffic |
| P-REPORT-04 | Tell the employer when their listing is reported or acted on? | **Not built.** Taking a listing down (T09) and withdrawing (T10) already send no employer notice (P-NOTIF-01) |
| P-REPORT-05 | Target response times for staff | None defined; the queue shows age. No alerting on an unattended report |
| P-REPORT-06 | When a listing action resolves one report, close the other open reports about the same listing? | **No**; staff see them in "other reports" and close each with a note |
| P-REPORT-07 | Stronger bot protection (CAPTCHA or proof of work) | **None** until abuse is seen; a honeypot and rate limits only |

Not built, by instruction: automatic removal after any number of reports, file upload, public display of reports, reporter accounts.
