# UPNEXT verification standard — APPROVED

Status: the owner decided on 2026-11-14 that a documented verification standard is defined and enforced (D-75,
O-3). This document is the standard; the owner approved its wording on 2026-11-14 (D-76). It is enforced in code
(`apps/api/opportunities/workflow.py` `set_verification`, database trigger `upnext_reviewer_not_author`), so a
listing cannot be labelled **Verified** without meeting it.

## 1. What "Verified" means

A listing labelled **Verified** has been checked by an editor or administrator at UPNEXT who did not write or submit
it, using one of the methods below, with the evidence written down and the original source recorded on the listing.
It does **not** mean UPNEXT endorses the employer, the pay or the outcome of an application. **Not verified** means
UPNEXT has not completed that check; the listing may still be genuine, and readers are told to check it themselves.

## 2. Requirements (all enforced by the server)

| # | Requirement | Enforced by | Refusal |
|---|---|---|---|
| V1 | A **method** from §3 | `set_verification` | 400, field `method` |
| V2 | An **evidence note**, 20 to 2,000 characters: what was checked, where, with whom, and when | `set_verification` | 400, field `evidence` |
| V3 | At least one **recorded source** on the revision the public sees | `set_verification` | 400, field `sources` |
| V4 | `employer_account` only for listings submitted through the employer portal | `set_verification` | 400, field `method` |
| V5 | The checker did **not write or submit** the revision (D-46: verification stays independent) | `set_verification` and the database trigger on verification records | 403 `separation_of_duties` |
| V6 | The checker holds `opp.verify.record` (Editors, Administrators) | permission registry | 403 |
| V7 | Every check is kept: an append-only verification record (method, outcome, evidence, checker, time, revision) and an audit event | `VerificationRecord`, audit log | — |

## 3. Methods

| Method | What the checker does | Typical evidence note |
|---|---|---|
| `source_page_review` — found on the employer's own channel | Opens the employer's own website, recruitment portal or official social account by typing its address (not from the advert) and finds the same vacancy: title, closing date and application route match | "Same vacancy on careers.example.co.zw/jobs/123, seen 14 Nov 2026; closing date and e-mail match." |
| `document_review` — checked the original notice | Examines the employer's own notice (signed letter, PDF on letterhead, newspaper advert) and compares it with the listing | "Newspaper advert, The Herald, 12 Nov 2026, p. 18; text and reference match." |
| `issuer_contact` — confirmed with the employer | Contacts the employer through a number or address found independently (switchboard, official website, directory), never the one in the advert, and confirms the vacancy | "Called the switchboard on the number on example.co.zw; HR (Ms Moyo) confirmed the post and the e-mail address, 14 Nov 2026." |
| `employer_account` — verified employer account | The listing came through the employer portal from a member of an organisation whose claim UPNEXT verified; the checker confirms nothing in the listing contradicts the organisation's own channel | "Submitted by a verified member of Example Ltd; matches example.co.zw/careers." |

## 4. What blocks Verified (editorial rules, checked by the editor)

- The issuer is anonymous ("Confidential", "A leading organisation") and no named recruitment agency stands behind it.
- The only contact is a WhatsApp number or a free webmail address **and** the employer cannot be reached independently.
- The application route is a job board, an aggregator or a link shortener.
- The advert asks for payment of any kind.
- Details contradict the employer's own channel (dates, title, contact).

These listings may still be published as **Not verified** if they pass review, or rejected.

## 5. Listings verified before this standard

Verification before 2026-11-14 was one switch with no method or evidence (D-62). Every listing Verified at the time
of migration `opportunities 0012` is **flagged for re-verification** (`reverification_required`). It is **not**
certified automatically and not unverified automatically:

- The public page keeps the Verified label but says it was marked before the current standard and is being checked
  again, and shows no check date. Lists show the label only.
- Staff see a **Re-verify** badge; the flag clears only when someone verifies the listing under this standard (a new
  verification record) or unverifies it.

The 13 listings Verified on the live site on 2026-11-14 (from the public API; production is flagged only when the
migration runs there, after an approved deployment):

| Listing | State on 14 Nov | Notes for the re-check (`docs/editorial/LISTING_REVIEW_2026-11-14.md`) |
|---|---|---|
| Accountant, Chabveka Solicitors | open | record the source first |
| Communications Officer, UNOPS | open | fix title and the closing-date conflict first |
| Graduate Trainee – Civil Engineering, Mbire RDC | open | Gmail contact: confirm with the council independently |
| Merchandising Manager, "Confidential …" | closes 14 Nov | blocked by §4 (anonymous; job-board link; WhatsApp) |
| Graduate Trainees – 9 Disciplines, Mutapa | open | confirm issuer name; replace short links |
| Nurse Aides, Magaya Mining | open | record the source |
| Graduate Trainee Programme 2027/2028, PROBFIX | closes 15 Nov | record the source |
| School Administrator / Project Coordinator, Enrollin Classes | open | Gmail contact; issuer not findable from the listing |
| Senior Programmes Lawyer, "National Human Rights Organisation" | open | blocked by §4 unless the organisation is identified and confirms |
| Software Developer, Zentrik Solutions | open | `employer_account` possible; the checker must not be from Zentrik (§2 V5) and the operator relationship is disclosed (D-75) |
| Artisan – Lines (Kariba), ZETDC | closed | no action needed while closed |
| Leading Hand (Grade 11), Delta Beverages | closed | no action needed while closed |
| Truck Assistant (Grade 14), Delta Beverages | closed | no action needed while closed |

## 6. Review of the standard

The owner reviews this standard after the first month of use, using the verification records (methods used, refusals,
re-verification progress) that the staff records page already lists.
