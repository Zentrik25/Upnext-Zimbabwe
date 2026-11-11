# Google Indexing API for job listing pages — DRAFT

Status: DRAFT (D-68; monitoring and unchanged-content deduplication added by D-72, draft). **Owner decision 2026-11-05: approved for record mode only.** Implemented and tested with mocked
Google answers; off by default; the production overlay fixes `record`; **live sending is not authorised**; no credential
exists; nothing deployed. Using the API asks Google to crawl a URL sooner; it does not guarantee crawling, indexing,
a Google for Jobs listing or any ranking.

## 1. What it does and does not do

| Event (workflow transition) | Notification | Condition |
|---|---|---|
| Publication or republication of an amendment (T07, including direct publication) | `URL_UPDATED` | The page carries JobPosting markup: a job, internship or graduate programme, open, with a stated place (same rule as the web's `jobPostingFor`, mirrored in `apps/api/indexing/eligibility.py`). Also sent when an amendment removes the markup from a page for which an update was sent before, so Google re-reads it |
| Withdrawal (T10), expiry by staff or by the scheduled job (T11), takedown (T09), archive (T12) | `URL_DELETED` | The listing is a job, internship or graduate programme. The page is then `noindex` (closed) or `404` (archived), which Google requires for a removal. Not repeated when a removal for the same address is already waiting or was sent (withdraw then archive sends one) |
| Anything else (drafts, reviews, verification label, scholarships, tenders, grants) | none | |

Never sent: the home page, `/opportunities` lists, category lists, `/jobs/*` landing pages, guides, company profiles.
Google's own policy allows the Indexing API only for pages with JobPosting (or livestream) structured data; those
pages reach Google through the sitemap.

## 2. Design

- **Queue** `indexing_notification` (`apps/api/indexing/models.py`): public URL, action, transition, status
  (`pending`, `sending`, `failed`, `sent`, `dead`, `superseded`), attempts, next attempt, last HTTP status and a short
  error code. No personal data, no response bodies.
- **Enqueue** (`indexing/receivers.py`, `service.enqueue`): from `opportunities.signals.transition_recorded`, inside the
  transition's own transaction, in a savepoint that logs and swallows its own failure. A rolled-back decision queues
  nothing; a queue problem can never undo or block an editorial decision.
- **Idempotency**: one row per publishing event (`event:<id>`, unique). A newer event for an address supersedes an
  older unsent one: only the latest state matters to Google.
- **Unchanged content is not re-sent** (D-72): each `URL_UPDATED` row stores a hash of what the job page shows
  (title, texts, places, dates, pay, application route, SEO and image fields, organisation, details;
  `eligibility.page_fingerprint`). Republishing an amendment whose hash equals the latest update sent or waiting for
  that address queues nothing. A removal followed by a reopening always sends a new update.
- **Current state wins**: just before sending, the listing is read again; an update for a listing that has since
  closed, or a removal for one that is open again, is marked `superseded`, not sent.
- **Quota** `indexing_quota_day`: requests are counted atomically per Google quota day (quotas reset at midnight
  Pacific time) and never exceed `UPNEXT_INDEXING_DAILY_QUOTA` (default 200, Google's default publish quota). A `429`
  from Google ends that day's sending; waiting rows move to just after the next Pacific midnight without losing an
  attempt.
- **Retries**: network errors, `5xx`, `408` and `401` (the token is dropped and fetched again) retry after 1 min,
  5 min, 30 min, 2 h, 6 h, then 24 h, each with ±20 % jitter, up to 8 attempts; then `dead`. Any other `4xx` is
  permanent at once (`400` malformed, `403` the service account is not an owner of the Search Console property,
  `404`). A stuck claim from a crashed worker is retried after 15 minutes.
- **Sending** (`service.run`): every worker housekeeping cycle (5 minutes, `run_worker`), at most
  `UPNEXT_INDEXING_BATCH` (default 20) requests, one run at a time across processes (PostgreSQL advisory lock), the
  outcome recorded in `core_jobrun` as `indexing`. One access token per batch, fetched before any quota is spent.
- **Authentication** (`indexing/google.py`): OAuth 2.0 JWT-bearer grant. A JWT (RS256, `cryptography`) with only the
  `https://www.googleapis.com/auth/indexing` scope is exchanged at `https://oauth2.googleapis.com/token` for a
  one-hour token kept in process memory. No Google client library is used. The key file's `token_uri` must be
  Google's endpoint, so a tampered file cannot send the signed assertion elsewhere.

## 3. Security

- The key is a JSON file mounted read-only into the **worker only** (`infrastructure/compose/compose.production.indexing.yaml`),
  from a path outside the repository and every image. The api container gets the mode (it queues staff decisions)
  but no key. The web container and browsers never see it; no API endpoint returns any of it (tested).
- The production preflight (`check_production_config`, in the worker) fails when the key file is missing, readable by
  other users (`chmod 600` required) or inside `/app`; in the api container it only warns that the key is absent.
- Logs and `last_error` carry short codes (`http_403`, `token_http_400`, `credentials_file_missing`), never the key, a
  token, an assertion or a response body. The credentials object's `repr` omits the key.
- `cryptography==50.0.2` is the one new runtime dependency (hash-pinned, `pip-audit` clean on 2026-11-05).

## 4. Owner setup (after Phase 7 deployment approval; nothing here is done)

1. **Search Console**: the domain property `upnext.co.zw` must be verified (see `SEARCH_CONSOLE_GUIDE.md`).
2. **Google Cloud**: in https://console.cloud.google.com create a project (for example `upnext-indexing`), then
   APIs & Services → Library → enable **Web Search Indexing API** (the Indexing API).
3. IAM & Admin → Service accounts → **Create service account** (for example `upnext-indexer`), no project roles.
   Open it → Keys → Add key → **JSON**. The file downloads once; treat it as a password.
4. Search Console → Settings → **Users and permissions** → Add user → the service account's e-mail
   (`…@….iam.gserviceaccount.com`) with permission **Owner**. Without owner rights Google answers `403`.
5. On the server, outside the repository: `install -o 10001 -g 10001 -m 600 key.json /etc/upnext/google-indexing.json`,
   then delete every other copy (downloads folder, chat, e-mail).
6. In the production environment file: `UPNEXT_INDEXING_KEY_HOST_PATH=/etc/upnext/google-indexing.json` (the overlay
   fixes `UPNEXT_INDEXING_MODE=record`; the environment cannot change it). Start with the overlay:
   `docker compose -f compose.production.yaml -f compose.production.indexing.yaml up -d`.
7. Publish or withdraw a test job, then `docker compose … exec worker python manage.py indexing_status`: the queue
   shows the expected `URL_UPDATED` / `URL_DELETED` rows and nothing has been sent.
8. Run `docker compose … exec worker python manage.py check_production_config`: the Indexing API checks pass.
9. **Only after the owner's explicit written authorisation** (not given as of 2026-11-05): change `record` to `live` in
   both places of `compose.production.indexing.yaml` as a reviewed commit, deploy, recreate api and worker. Within
   5 minutes `indexing_status` shows `sent`. If
   Google needs more than 200 a day, request a higher quota in the Cloud console (Indexing API → Quotas).
10. **Rollback**: drop the overlay (the base file means `off`) or return it to `record`, and recreate api and worker. Revoke the key in
    the Cloud console if it may have leaked. The sitemap keeps working either way.

## 5. Operations

- **Workspace page `/workspace/seo`** (D-72, Administrators only, `settings.manage`): mode, queue counts, last
  accepted submission, quota today, last run, oldest waiting, open job listings, JobPosting-eligible jobs, jobs in
  the sitemap, structured-data errors and warnings per listing, the latest 50 notifications with a status filter,
  and an audited **Retry** for `failed` or `dead` rows (refused when a newer notification for the address exists)
  plus **Retry all dead**. "Sent" means Google accepted the notification (HTTP 200); the page never reports a URL as
  indexed. Search Console figures are shown as "Not connected": no Search Console API integration exists.

- `manage.py indexing_status` — mode, counts per status, quota used today, oldest waiting age, last five errors.
- `manage.py process_indexing` — one sending pass now (only in `live`).
- Alerts (`MONITORING_AND_ALERTING.md`, runbook `indexing`): `indexing.dead` (a rejection or exhausted retries in 24 h),
  `indexing.stuck` (a notification waiting more than 30 h), `indexing.failed` (the last run failed: credentials or
  token). A burst of `403` means step 4 is missing; `credentials_*` codes mean steps 3, 5 or 6.
- Tests: `apps/api/tests/test_indexing.py` (queueing, idempotency, rollback isolation, signature, quota, back-off,
  429, 401, permanent rejections, stale claims, credentials, preflight), `tests/test_production_compose.py`.
