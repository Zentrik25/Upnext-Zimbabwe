# Owner and legal approval checklist — Privacy Policy and Terms of Service

Status: **OPEN. Nothing here has been approved.** The public pages `/privacy` and `/terms` are complete and carry no draft wording, but they stay **noindex and out of the sitemap** until the owner sets `UPNEXT_LEGAL_APPROVED=true` in the deployed web service's environment (`infrastructure/compose/production.env.example`). That setting is the owner's act, taken only after every item in section 1 and the gating items in section 2 are closed. The application never sets it.

Sources and reasoning: `LEGAL_RESEARCH.md`. Statement-to-code mapping: `CODE_TO_POLICY_CHECKLIST.md`. Screenshots: `docs/legal/screenshots/`.

## 1. Facts only the owner can supply (none has been invented)

| # | Item | Why it matters | State |
|---|---|---|---|
| F-1 | Registered address and registration number of Zentrik Solutions (Pvt) Ltd | Consumer Protection Act commentaries say online suppliers show a physical address; the Privacy Policy and Terms show none | **missing** |
| F-2 | POTRAZ data-controller licence status and tier (S.I. 155 of 2024) | A licence is likely required; the pages claim none | **missing** |
| F-3 | Data Protection Officer: name or role and contact, certification and POTRAZ notification (reported form DP2) | Likely required; the pages name none | **missing** |
| F-4 | Hosting provider and **country** of the server | Needed for the transfer section and any adequacy analysis | **missing** |
| F-5 | Backup storage provider and country (B-07) | Same | **missing** (none chosen) |
| F-6 | Confirmation that **support@upnext.co.zw** exists, receives mail and is read, and who answers privacy requests | It is the stated privacy contact; D-44 records it as an owner instruction. Nothing has created it | **to confirm** |
| F-7 | Response time for rights requests | The pages promise "without undue delay" only | **to decide** |
| F-8 | Fixed retention periods for: closed reports and staff notes; audit and security records; employer claim decisions; server logs | The pages say plainly that no fixed period is set. Closing these lets the pages state a period | **to decide** |
| F-9 | Resend: account, data-processing terms and processing location, once delivery is set up | The Privacy Policy names Resend as the selected provider | **to obtain** |
| F-10 | Effective date and version when published (currently 29 October 2026, version 1.0) | The date must be the day the owner approves | **to set** |

## 2. Matters for a qualified Zimbabwean adviser (answers needed before approval)

| # | Question | Pages affected |
|---|---|---|
| L-1 | Is a data-controller licence required, which tier, and by when? Are there exemptions? | Privacy (controller statement) |
| L-2 | DPO appointment duty and the correct description to publish | Privacy |
| L-3 | Lawful grounds table: are contract, legitimate interest and consent the right grounds for each purpose under the Act? | Privacy §3 |
| L-4 | Transfers: conditions for the e-mail provider, hosting and backups; any notification to POTRAZ | Privacy §8 |
| L-5 | Rights wording: access, correction, deletion, objection; response times; complaint to POTRAZ | Privacy §12 |
| L-6 | Minimum age: is 18 correct for accounts, given scholarships and school-leaver audiences? | Privacy §13, Terms §2 |
| L-7 | Breach notification duties (24 hours to the Authority; whether affected people must be told) and the written incident procedure that does not yet exist | Privacy §9 |
| L-8 | Retention periods acceptable for the items in F-8 and for 14-day deletion wait and about-three-month backup persistence | Privacy §10–11 |
| L-9 | Enforceability of the liability exclusion and limit, the "as is" disclaimer and the governing-law and courts clause | Terms §20–21 |
| L-10 | Discrimination wording against the Labour Act and any other law | Terms §9 |
| L-11 | Electronic communications and consent rules for alerts and service messages | Privacy §5 |
| L-12 | User-content licence and take-down handling for listings and reports (defamation exposure for naming issuers) | Terms §14–17 |
| L-13 | Whether publishing business contact details taken from public notices raises any issue and what correction route must exist | Terms §7, EDITORIAL_HANDBOOK |

## 3. Engineering items still open (not legal)

- The registration form does not ask for age; the 18-or-over rule is a stated condition, not enforced.
- No self-service export of personal data exists (manual route stated).
- Written breach-response procedure to be written once L-7 is answered.
- E-mail delivery is not verified (B-01); the pages describe e-mail as switched on only after testing.
- If the owner later enables seeker profiles or alerts in production, re-read Privacy §2, §4 and §5 against the then-live behaviour.

## 4. To publish (in order)
1. Close F-1 to F-10 and L-1 to L-13; have the adviser's changes made through an ordinary reviewed change (new version number, effective date and a line in the version history).
2. Re-run the code-to-policy tests (`apps/web/tests/unit/legal.test.tsx`).
3. Record the decision and date in `docs/governance/DECISION_REGISTER.md`.
4. Set `UPNEXT_LEGAL_APPROVED=true` for the web service and redeploy. The pages become indexable and enter the sitemap.
5. Close launch blocker B-02 only with that evidence attached.

Not claimed anywhere: legal certification, compliance with any named law, or lawyer review.
