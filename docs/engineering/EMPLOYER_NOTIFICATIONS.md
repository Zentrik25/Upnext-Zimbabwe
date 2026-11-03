# Employer notifications — DRAFT

Status: DRAFT (M2, owner instruction 2026-10-28). Implemented in `apps/api/employers/notifications.py` and `employers/reminders.py`. **No real e-mail is sent**: nothing is written while `delivery_verified()` is false (B-01), and production has no provider configured.

## 1. What is sent

| Kind (`EmailKind`) | When | Recipients |
|---|---|---|
| `employer_claim_received` | an organisation claim is submitted | the claimant |
| `employer_claim_approved` / `employer_claim_rejected` | staff decide the claim (the rejection carries the staff reason) | the claimant |
| `employer_listing_submitted` | the listing, or an amendment, is submitted for review (T03) | listing recipients |
| `employer_listing_published` | staff publish it (T07); says "amendment" when the listing was already public | listing recipients |
| `employer_listing_rejected` | staff reject or return it (T05, T06) with the reason; says "amendment" and that the published version stays | listing recipients |
| `employer_listing_expiring` | seven days before the live deadline (`UPNEXT_EXPIRY_REMINDER_DAYS`) | listing recipients |
| `employer_listing_expired` | the listing expires (T11, by the expiry job or a staff member) | listing recipients |

Approval alone (T04) is not announced: the employer hears when the listing is published or returned. Staff take-downs and withdrawals (T09, T10) are **not** notified; that needs an owner decision (see section 6). Listings that staff entered themselves have no employer, so they notify nobody.

**Listing recipients** are the listing's creator, if still an active member of the organisation, and the organisation's active owners. Membership is read when the notice is written, so a person who left or was removed receives nothing. A recipient must also have an active account, a confirmed address and no suppression entry; otherwise no row is written for them.

## 2. Guarantees

* **Off until verified.** Same rule as job alerts: while `delivery_verified()` is false nothing is written, so the outbox does not fill with rows that cannot be delivered and no mail can leave early. The reminder job records `delivery_unverified` in `core_jobrun`. Events that happen while delivery is unverified are not replayed later; reminders are, because the sweep reads the current state.
* **Once.** Every row has a deterministic idempotency key (`emplist:{event}:{user}`, `empclaim:{claim}:{status}:{user}`, `emprem:{live revision}:{user}`) on the unique `EmailOutbox.idempotency_key`; `enqueue_once` inserts in a savepoint and treats a duplicate as "already queued". Delivery stays at-least-once; the key is also given to the provider.
* **Never in the way.** The publishing service sends a Django signal (`opportunities.signals.transition_recorded`) with `send_robust` after writing history and audit; the receiver runs in its own savepoint and swallows failures (logged as `employer_notify.failed`, no addresses or content). A notification fault can never roll back or block an editorial decision, a claim decision or the worker.
* **Retries, suppression, webhook.** Unchanged: back-off and attempt cap in `notifications/services.py`, suppression list, signed bounce and complaint webhooks. The payload (organisation name, title, staff reason) is removed from the row after sending.
* **Secure links.** Only authenticated pages (`/employer`, `/employer/listings/{id}`) and the public listing URL. No token or secret appears in an employer e-mail.
* **Reminders.** `expiry_reminders` runs in the worker's housekeeping cycle after the expiry job, under a PostgreSQL advisory lock (one run at a time), and is monitored (`job.expiry_reminders_*`). A listing published with fewer than seven days left is reminded on the first run after publication. Unknown deadlines, other statuses and staff-entered listings are never reminded.

## 3. Privacy
The rows hold the recipient's address and display name, and in the payload the organisation name, the listing title and (for rejections) the staff reason, until the message is sent. Retention of the rows is the existing outbox retention (`UPNEXT_RETENTION_OUTBOX_SENT_DAYS`, `_DEAD_DAYS`). The privacy text does not need a new purpose: these are service messages about a person's own listings and claims. Owner and legal review of that statement belongs to B-02.

## 4. Tests
`apps/api/tests/test_employer_notifications.py` and `test_employer_notifications_concurrency.py` (traceability NOTIF-01 to NOTIF-06).

## 5. Operating
Nothing to configure. To change the lead time set `UPNEXT_EXPIRY_REMINDER_DAYS` (default 7). Add `expiry_reminders` to `UPNEXT_ALERTS_EXPECT_JOBS` in production.

## 6. Owner decisions
| ID | Question | Default built |
|---|---|---|
| P-NOTIF-01 | Should staff take-downs and withdrawals be notified to the employer? (They can carry sensitive reasons.) | not notified |
| P-NOTIF-02 | May employers switch these service messages off? | no preference screen; every notice is a service message |
| P-NOTIF-03 | Reminder lead time | 7 days (requested) |
| P-NOTIF-04 | Should events that happen while delivery is unverified be sent later once it is verified? | no; only reminders, which are recomputed |
