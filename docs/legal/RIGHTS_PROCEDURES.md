# Procedures for requests about personal data — DRAFT

Status: DRAFT (Phase 5, WS2). Describes what staff can do today. Response times and the legal rights themselves are for the owner and lawyer to set (LEGAL_REVIEW_PACK.md L-5). Requests arrive at the contact address (not yet published, blocker B-03).

## Principles
Verify the requester controls the account before acting (a message from the account's own address, or the person signed in: for deletion and e-mail change the product already asks for the password). Do not reveal whether an address has an account to anyone else. Record every request and what was done in the audit trail or the support log. Never copy personal data into chat tools or tickets beyond what is needed.

## Deletion
The person signs in and requests deletion on the account page (14-day cooling-off, cancel any time). If they cannot sign in, an Administrator verifies identity through the account's e-mail address, then asks the person to reset the password and use the page. Staff accounts: an Administrator first removes the roles (`manage_staff_role`). Completed deletions are logged as `account.deletion_completed` (opaque id) and re-applied after a restore (BACKUP_AND_RESTORE §5).

## Correction
Name: the person edits it on the account page. E-mail address: change of e-mail address once available (it depends on verified delivery), otherwise an Administrator after identity verification.

## Access to a copy (manual, until the owner decides on a self-service export)
An Administrator runs a read-only query for the verified person's rows listed in DATA_INVENTORY.md section A (account row without password hash, saved listings, seeker profile and its choices, job-alert settings and consent proof, session records, message log without bodies) and sends the result to the account's own address. The query and the person's identity check are logged.

## Objection, restriction, complaints
Recorded and answered by the owner; no automated processing decides anything about a person (there is no profiling in the current product).

## Incidents
No breach procedure exists yet (LEGAL_REVIEW_PACK.md L-8). Interim rule: any suspected exposure is reported to the owner the same day; the owner decides who must be told. A written procedure is a launch requirement.
