# Legal operator identity and privacy/terms review checklist (B-02) — DRAFT

Status: DRAFT, prepared in launch preparation. **Superseded in part on 2026-10-29: the full Privacy Policy and Terms of Service now exist and the working checklist is `LEGAL_APPROVAL_CHECKLIST.md` (research: `LEGAL_RESEARCH.md`). Operator facts supplied by the owner on that date: I-1 the legal operator is Zentrik Solutions (Pvt) Ltd, Zimbabwe; I-4 the privacy and support contact is support@upnext.co.zw (D-44). I-2, I-3, I-5 to I-9 remain unsupplied.** **It contains no legal conclusion and no legal fact about the operator. Every blank below is for the owner or the owner's lawyer; none has been filled, guessed or inferred, and legal review is NOT complete.** B-02 stays open until the owner records the outcome in the decision register. The review package itself is `LEGAL_REVIEW_PACK.md` (questions L-1 to L-12); this page is the work list that closes it.

## 1. Operator identity — facts the owner must supply (OQ-09)

| # | Fact | Where it appears once supplied | Supplied? |
|---|---|---|---|
| I-1 | Legal name of the operator (the entity or person responsible for the service) | `/privacy`, `/terms`, `/contact`, e-mail footers | **No** |
| I-2 | Legal form and registration number, if any | `/privacy`, `/terms` | **No** |
| I-3 | Registered/physical address for notices | `/privacy`, `/terms` | **No** |
| I-4 | Contact address for privacy and rights requests: only `info@upnext.co.zw` is authorised (D-42); confirm that is also the rights contact | `/privacy`, `/contact` | Address only; owner to confirm its use |
| I-5 | Person or role who answers rights requests, and the response time | `/privacy`, `RIGHTS_PROCEDURES.md` | **No** |
| I-6 | Whether a data-protection officer or registration with a regulator is required (L-1) | `/privacy` | **No** |
| I-7 | Governing law and courts (L-9) | `/terms` | **No** |
| I-8 | Names of processors once chosen: e-mail (Resend, selected D-34, not configured), hosting/VPS, off-server backup, monitoring | `/privacy`, `DATA_INVENTORY.md` | Resend named; the rest **No** |
| I-9 | Countries data is stored or sent to (cross-border, L-6) | `/privacy` | **No** |

The bracketed placeholders in the draft pages are the machine-readable list of what is missing: `grep -n "\[" apps/web/src/app/privacy/page.tsx apps/web/src/app/terms/page.tsx` (the pages keep their DRAFT banner and `noindex` until review is recorded).

## 2. Review work list

| # | Item | Material | Owner of the item | Status |
|---|---|---|---|---|
| R-1 | Lawyer answers L-1 to L-12 in writing | `LEGAL_REVIEW_PACK.md` §2 | Owner / lawyer | Open |
| R-2 | Privacy notice reviewed against the data actually held | `DATA_INVENTORY.md` (accounts, sessions, seeker profile and saved items, alert preferences, employer claims and notifications, public listing reports incl. reporter contact e-mail and repeat hash, audit and security records, backups, e-mail outbox) | Lawyer | Open |
| R-3 | Profile collection (seeker profile fields) authorised only after reviewed privacy text; it stays off in production until then | Phase 6B; B-02 | Owner | Open |
| R-4 | Retention periods decided: audit/security records, closed public reports (provisional 30 days for contact data), outbox, backups, 14-day deletion cooling-off (L-4, P-REPORT-02, P4-05/P4-06) | `DATA_INVENTORY.md`, `BACKUP_AND_RESTORE.md` | Owner / lawyer | Open |
| R-5 | Rights procedure: access, correction, deletion, objection, portability; self-service export vs manual; complaint route (L-5) | `RIGHTS_PROCEDURES.md` | Lawyer | Open |
| R-6 | Breach-notification procedure written (L-8); none exists yet | new document after lawyer's answer | Owner | **Not written** |
| R-7 | Terms: liability for third-party listings, takedown and complaints, scam-screening duties, quoting of public notices (L-9, L-10, L-12) | `/terms`, `EDITORIAL_HANDBOOK.md`, `PUBLIC_REPORTING.md` | Lawyer | Open |
| R-8 | Reporting form: the public can report a listing; the reporter e-mail is optional and no acknowledgement is e-mailed (P-REPORT-01); notice wording about what is kept | `PUBLIC_REPORTING.md`, `/privacy` | Lawyer | Open |
| R-9 | Employer terms: claim of an organisation, who may act for it, notifications as service messages (P-NOTIF-02) | `EMPLOYER_NOTIFICATIONS.md`, `/terms` | Lawyer | Open |
| R-10 | Staff notice about the audit trail kept on staff actions (L-11) | `STAFF_ACCESS_RUNBOOK.md` | Lawyer | Open |
| R-11 | Minimum age (L-7) | `/terms` | Lawyer | Open |
| R-12 | Cookie statement: only strictly necessary session/CSRF cookies are set; no analytics, advertising or tracking is built | `PRODUCTION_CONFIGURATION.md` §4 | Lawyer to confirm | Open |

## 3. Closing B-02 (all must hold)

1. I-1 to I-9 supplied by the owner and typed into the pages by a normal reviewed change.
2. R-1 to R-12 answered; changes from the lawyer made and merged.
3. The owner records the review outcome and date in the decision register.
4. Only then are the draft banners and `noindex` removed in a separate, approved change, and profile collection may be enabled.

Nothing in this document, the pages or the code states that the service complies with any Zimbabwean law.
