# Personal-data inventory — DRAFT for owner and legal review

Status: DRAFT (Phase 5, WS2). Built from the code and migrations; **not legal advice and not a legal conclusion**. Lawful bases, retention limits and transfer rules are for the lawyer (see LEGAL_REVIEW_PACK.md). A test (`apps/api/tests/test_data_inventory.py`) fails when a column that looks like personal data appears in the database without a row here, so this file cannot silently fall behind the product.

Format: each row names its table and column in backticks. "Who sees it" means people with access through the product, not database administrators.

## A. People who use the site (seekers)

| Data | Table.column | Purpose | Who sees it | Retention (current defaults) | Deleted on account deletion |
|---|---|---|---|---|---|
| E-mail address | `accounts_user.email` | sign-in, confirmation, notices | the person; no staff list shows it (staff pages hide it) | until deletion; then replaced by a non-identifying placeholder (tombstone) | yes (tombstone) |
| Display name | `accounts_user.display_name` | greeting in messages and the account page | the person | until deletion | yes ("Deleted account") |
| Password (one-way hash) | `accounts_user.password` | sign-in | nobody | until deletion | yes (unusable) |
| Confirmation time, last sign-in, status, deletion request time | `accounts_user.email_verified_at` | account state | the person | until deletion | cleared or kept as state |
| New address awaiting confirmation | `accounts_authtoken.new_email` | change of e-mail address | nobody | link rows are removed 7 days after use or expiry | yes |
| Where you are signed in: coarse network prefix, browser family, key | `accounts_usersession.ip_prefix`, `accounts_usersession.user_agent_summary`, `accounts_usersession.session_key` | "where you are signed in", revoking sessions, abuse response | the person | revoked records 30 days; expired sessions removed | yes |
| Saved listings | `opportunities_savedopportunity` (user and listing) | the saved list | the person | until deletion or unsave | yes |
| E-mail messages waiting or sent | `notifications_emailoutbox.to_address` | delivery of the messages above | Administrators, masked | address cleared 30 days after sending; dead messages 90 days | yes (scrubbed) |
| Addresses that bounced for good | `notifications_emailsuppression.address_hash` | do not mail them again | nobody (keyed hash, not the address) | kept while needed to protect deliverability | not applicable (no address stored) |
| Rate-limit counters | `django_cache` (keys use keyed hashes) | abuse protection | nobody | minutes to hours | n/a |
| Session payload | `django_session` | keep you signed in | nobody | until expiry (7 days idle for seekers, 30 days absolute) | yes |

## B. Staff (contributors, editors, administrators)

| Data | Table.column | Purpose | Who sees it | Retention |
|---|---|---|---|---|
| Same account data as above | `accounts_user.*` | sign-in | the person, Administrators | while the person has access, then per the deletion rules once roles are removed |
| Roles and who granted them | `accounts_staffroleassignment.reason` | access control, accountability | Administrators | kept (audit) |
| Second-step device secret parts | `accounts_staffmfadevice` (nonce; the secret is derived, not stored) | two-step verification | nobody | removed with the account |
| Everything a staff member did | `audit_auditevent` (opaque account id, action, changed field names) and the editorial history tables | accountability for editorial and security actions | Administrators | **kept; how long is undecided (OQ-09)**; holds an opaque id, never a name, e-mail or address |
| Who authored, reviewed, verified and published each revision | foreign keys on `opportunities_opportunityversion`, `opportunities_reviewdecision`, `opportunities_verificationrecord`, `opportunities_publishingevent` | separation of duties | staff | kept with the listing |
| Operator who verified e-mail delivery | `notifications_emaildeliveryverification.operator` | proof that mail was tested | Administrators | kept |

## C. Information about organisations and listings (not personal data of site users)

Organisation names and web addresses (`catalog_organisation.name`, `catalog_organisation.website_url`), source names, addresses and citations (`opportunities_opportunitysource.*`), listing text, and contact details that the source itself published for applicants (`opportunities_opportunityversion.application_email`, `opportunities_opportunityversion.contact_details`, `opportunities_opportunityversion.location_text`). These can occasionally name or identify a person (for example a contact officer): editors are told to publish only business contact details the source published, and a correction or takedown request is honoured (EDITORIAL_HANDBOOK.md).

## D. Not collected

Date of birth, gender, national identity numbers, photographs, CVs or other uploads, payment details, precise location, advertising or analytics identifiers (P4-04: no analytics, only the session and CSRF cookies). Profile data (qualification, skills, interests) is designed (D-31) but **not built and not collected**.

## E. Processors and places the data goes (owner to complete)

| Processor | What it receives | Status |
|---|---|---|
| E-mail provider | recipient address, message text | **not chosen** (shortlist: Resend, Amazon SES; D-32) |
| Hosting (the shared VPS) | everything | to be described in Phase 7; location and operator to be stated |
| Off-server backup storage | encrypted copy of the database | **not chosen** (BACKUP_AND_RESTORE.md) |
| Error tracking and monitoring | scrubbed technical events, no personal data by design | **not chosen** (OQ-26) |
