# Editorial handbook — DRAFT for owner review

Status: DRAFT (Phase 5, WS6). It describes how listings are chosen, checked and corrected. It binds nobody until the owner approves it, and it does not change the workflow rules, which the software enforces (EDITORIAL_WORKFLOW.md, D-18, D-22): **nobody approves or verifies their own submission; publishing needs another authorised person's approval of the exact revision; any material change needs a new approval; every step is audited.** No shortcut exists, and none may be created.

## 1. People and roles (minimum for launch: three named people)
Contributor (writes drafts), Editor (reviews, approves, publishes), Administrator (also manages taxonomies, organisations, staff access). At least two people able to review each other's work plus an Administrator who is a third person. A person who wrote or imported a draft cannot approve or verify it, even if they are an Editor. Staff turn on two-step verification at first sign-in and keep their recovery codes safe (STAFF_ACCESS_RUNBOOK.md).

## 2. What may be listed
Opportunities for people in Zimbabwe published by an identifiable issuer in a public source: jobs, internships, graduate programmes, scholarships, tenders, grants. Every listing needs: the issuer, a primary source (a web page, notice, gazette or newspaper citation), a way to apply that goes to the issuer's own channel, and what the source states about the deadline and pay. UPNEXT never receives applications and never charges applicants.

## 3. What must not be listed (scam and quality screening)
Refuse and note the reason if any of these apply: asks applicants to pay a fee, deposit or "registration"; asks for identity documents, bank or mobile-money details before a real process; no identifiable issuer or only a personal messaging contact; the issuer cannot be found independently or the web address imitates another organisation; promises of guaranteed jobs, visas or unusually high pay; the source is another aggregator copying an unknown original (trace it, list the original or do not list); duplicate of a live or pending listing. When in doubt, ask the issuer through a channel found independently of the listing, or leave it out. Escalate patterns (repeated scam sources) to the Administrator.

## 4. Writing a listing
Summarise in your own words; never paste a whole notice; always keep the source link and citation. State only what the source states: unknown pay or deadline is entered as unknown and shows as "not stated". Do not infer eligibility. Use the category's fields; use the approved taxonomies; if a location, sector or skill is missing, ask an Administrator rather than inventing one. Publish only business contact details the source published; remove personal phone numbers or private addresses unless the notice itself publishes them as the application contact. Dates: use the source's time zone; date-only deadlines are end of day (Africa/Harare).

## 5. Checking and verification labels
Review checklist (the software asks for it): source reviewed, duplicates reviewed, content matches the source. Verification labels describe what was checked, never a guarantee: *not verified*, *source checked* (a person compared the listing with the source page or document), *issuer verified* (the issuer confirmed through an independently found contact). The person verifying records method, outcome and a short evidence note, and cannot be the author or submitter. Discrepancies: record "discrepancy found", return the draft with a reason.

## 6. Importing in bulk
`manage.py import_drafts FILE --as EMAIL` creates **drafts only** authored by the named staff member, after a dry run (`--dry-run`) that lists every problem. It refuses a file with bad rows unless `--skip-invalid` is given, skips listings whose primary source address is already in the catalogue, and reports possible duplicates. Imported drafts go through the normal queue: the importer cannot approve or verify them. Organisations must already exist; Administrators add them first.

## 7. Freshness, corrections and takedown
Daily: clear the review queue (oldest first), check listings closing in 7 days and anything past its deadline (the system expires them), read the corrections inbox. Weekly: content-health page (`/staff/content-health/`) — queue age, unknown-deadline listings older than 30 days (re-check the source), live listings not yet source-checked, the separation-of-duties audit (must show no violations). Monthly: re-verify a random sample of 10 live listings against their sources.
Corrections: amend through a new revision (needs fresh approval). Takedown (legal, error, fraud or the issuer's request): an Editor withdraws or archives with a reason; public visibility ends immediately; the aim is to act within one working day of a credible report. Record the report and the action. Listings that were taken down for fraud stay in the audit trail.

## 8. Launch content target (D-32)
100 current, source-checked opportunities across the six categories from at least 30 distinct issuers, entered through the workflow by real staff. The content-health page shows progress; it cannot be met by loading demo data, and `seed_demo` refuses to run on a real deployment.

## 9. Open items for the owner
Named staff; the category field lists (OQ-06) and taxonomies (OQ-21, OQ-22); source rules for sources without a URL (OQ-29); response times for corrections and takedowns; how issuers contact UPNEXT (blocker B-03).

## Employer claims, company profiles and employer listings (Phase 6A, D-35)

Staff with the Editor or Administrator role see **Organisation claims**, **Profile revisions**, **Organisation verifications** and **Employer memberships** on the staff site. Nothing there is edited by hand: each screen posts to the same services the employer portal uses, and refusals are shown to you and audited.

**Deciding a claim.** Read the claimant's role and the evidence they offered, then check it yourself by a route they did not choose (the organisation's published telephone number or website, a known contact). Choose an existing organisation when one matches (look for duplicates first) or leave it empty to create one from the claimed name. If the organisation has no verification yet you must record the method (document review, official e-mail domain, website control, telephone call-back, other) and a short evidence note: what you saw or did, **not** documents or identity numbers. You cannot decide your own claim, and you cannot verify an organisation you act for. Reject with a reason the claimant can act on; they will see it.

**Company profiles.** A profile is public only after you approve it, and only while the organisation stays verified. Check that it is plain text about the organisation, makes no promise of jobs or income and asks for no payment. You cannot decide a revision you submitted.

**Employer listings** arrive in the normal review queue and follow the normal rules: another person approves, then anyone permitted publishes. The listing carries an automatic source "Submitted by the employer through the NextJob employer portal" and starts as *not verified*: verifying the organisation does not verify the listing. Use the usual verification record if you check the content with the issuer. A returned or rejected listing shows your reason to the employer, so write it for them.

**Withdrawing trust.** An Administrator can revoke an organisation's verification (members then cannot submit and the public profile is hidden; published listings stay until you take them down). Any reviewer can revoke a person's membership. Both are audited.
