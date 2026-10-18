# Job-alert e-mail runbook — DRAFT

Status: DRAFT (Phase 6B, D-38, ADR-0023). **Alerts are never sent while e-mail delivery is unverified (B-01).** Nothing in this runbook activates delivery; it describes what exists, how to inspect it locally and what the owner must do first.

## 1. What exists
| Piece | Where |
|---|---|
| Alert choices, consent proof, position | `alerts_jobalert` (one per account) |
| Listings already offered | `alerts_alertdelivery` (30 days) |
| Scheduler and digest builder | `alerts/service.py` (`run_due`, `build_digest`) |
| Worker pass | `run_worker`, inside the housekeeping cycle (every 5 minutes), recorded as job `alerts` |
| Message | `notifications/templates/notifications/job_alert_v1.txt`, kind `job_alert`, branded HTML built from the text |
| Unsubscribe | `POST /api/v1/alerts/unsubscribe` (one-click, RFC 8058) and the page `/alerts/unsubscribe`; `List-Unsubscribe` and `List-Unsubscribe-Post` headers |
| Manual pass | `python manage.py run_job_alerts [--dry-run]` |

## 2. The gate
`run_due` returns at once, writing nothing, unless `delivery_verified()` is true: a real provider (`smtp`) **and** a current `record_email_verification` record for the live sender configuration. (Throwaway stacks with the file backend and `UPNEXT_DEMO_TOOLS=1` count as verified so the browser tests can run; production refuses to start with those settings.) While it is false: no outbox row, no ledger row, no change of position, and the alerts page tells people that nothing is being sent yet. Tested in `tests/test_alerts.py` (gate tests).

## 3. How a digest is decided
For each enabled alert whose last check is at least one interval old (daily 24 h, weekly 7 days, minus a 10-minute slack): the person must be active, confirmed, not awaiting deletion and not suppressed. Listings are those first published after the last check, still open, matching a chosen category and any chosen place, and not already in the ledger. At most 10 go in one message; the rest are reached by a link to the search. No message is queued when nothing matches. Whether or not a message was needed, the position moves to now, so an ineligible person returning later gets no backlog. The outbox row, the ledger rows and the new position are written in one transaction; the outbox idempotency key `job_alert:{alert}:{previous position}` stops a second worker producing a duplicate.

## 4. Local inspection (no sending)
```bash
python manage.py run_job_alerts --dry-run      # counts only; writes nothing
python manage.py outbox_status                 # waiting, dead, oldest
UPNEXT_DEMO_TOOLS=1 python manage.py demo_alert_run --email you@demo   # throwaway stacks only: make one alert due, queue it
python manage.py last_email --to you@demo --kind job_alert             # file backend only
```
`demo_alert_run` refuses to run without `UPNEXT_DEMO_TOOLS=1`.

## 5. Before alerts may be switched on (owner)
1. Close B-01: Resend domain verified, SPF, DKIM and DMARC passing, real test mail in Gmail, Outlook and one local mailbox, `record_email_verification` recorded; the Resend webhook secret set so bounces and complaints suppress.
2. B-02: reviewed privacy text and lawful basis for profiles, alerts and the consent wording (`alerts-consent-v1`); the retention periods in P6B-11 confirmed.
3. B-03: contact and support mailboxes working (replies to alerts and privacy requests need somewhere to go).
4. Send the first alerts to owner-controlled mailboxes only (switch alerts on for your own accounts, publish a listing, wait one interval) and check the headers, the unsubscribe link and the plain-text part.
5. Keep the worker heartbeat and `outbox.alert` monitoring in place; alert volume is one message per person per interval.

## 6. Operations
- **Stop everything:** set `UPNEXT_EMAIL_BACKEND=none` (rows wait) or revoke the verification record (the gate closes). Individual people stop with the link or the alerts page.
- **A complaint or bounce:** the Resend webhook adds the address to the suppression list; the next pass skips that account without sending.
- **Deletion:** account deletion removes the alert, its choices and its ledger and cancels waiting messages; a pending deletion request pauses alerts at once.
- **Retention:** ledger 30 days (purged by the worker); sent mail addresses scrubbed after 30 days like all outbox rows.
- **Known limits:** no retry window beyond the outbox's own; the digest is not personalised by profile; no per-listing "closing soon" reminder (deliberately, to avoid unnecessary e-mail).
