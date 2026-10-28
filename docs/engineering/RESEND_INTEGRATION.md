# Resend integration guide — DRAFT

Status: DRAFT (identity updated for D-42; the step-by-step launch checklist is `EMAIL_PROVIDER_LAUNCH_CHECKLIST.md`). Resend is the selected transactional provider (D-34). **Nothing is configured, no account or key exists, and no real e-mail has been sent.** Statements about Resend below that are marked **[confirm]** come from memory and a secondary source, not from Resend's current documentation (which could not be reached from the build environment); confirm each one before enabling.

## 1. What is built

| Piece | Where | Notes |
|---|---|---|
| SMTP adapter, outbox, worker, retries, 4xx/5xx classification | `notifications/sender.py`, `services.py` | unchanged; Resend is reached through the generic `smtp` backend |
| Sender identity | `UPNEXT_EMAIL_FROM`, `UPNEXT_EMAIL_REPLY_TO`, `UPNEXT_SUPPORT_EMAIL` (all `info@upnext.co.zw`, D-42) | env only; no address is hard-coded in code |
| Multipart messages | `notifications/htmlmail.py` | HTML is derived from the plain text so they cannot drift; flat, no images, no tracking pixels, no scripts |
| Resend config checks | `notifications/config.py` (`resend_problems`) | with host `smtp.resend.com`: user must be `resend`, a password (the API key) must be set, port 465 pairs with `ssl`, 587 with `starttls` |
| Webhook | `POST /api/v1/hooks/email/resend` (`notifications/resend_webhook.py`) | off (404) until `UPNEXT_RESEND_WEBHOOK_SECRET` is set |
| Suppression | `notifications/suppression.py` | keyed hashes of addresses, never plain text |
| Verification gate | `notifications/verification.py`, `record_email_verification` | unchanged (section 6) |

## 2. SMTP settings (all through environment variables / the secret store)

```
UPNEXT_EMAIL_BACKEND=smtp
UPNEXT_SMTP_HOST=smtp.resend.com
UPNEXT_SMTP_USER=resend
UPNEXT_SMTP_PASSWORD=<Resend API key, restricted to sending>
UPNEXT_SMTP_PORT=465
UPNEXT_SMTP_SECURITY=ssl
UPNEXT_EMAIL_FROM=UPNEXT Careers <info@upnext.co.zw>
UPNEXT_EMAIL_REPLY_TO=info@upnext.co.zw
```

**Transport choice: implicit TLS on 465.** The connection is encrypted from the first byte, so there is no plaintext phase to strip. STARTTLS on 587 (`UPNEXT_SMTP_SECURITY=starttls`) also works with the adapter; pick one and keep it. Host, user and port are **[confirm]** against Resend's SMTP page. The key is a credential: never commit it, never paste it into logs or tickets, rotate it if it leaks, and use a key limited to sending (a full-access key is not needed). Template: `infrastructure/compose/production.env.example`.

## 3. Setting up the account and domain (owner actions; no DNS is changed by the repository)

1. Create or open the Resend account (owner-held credentials).
2. Add **upnext.co.zw** as the sending domain. Do **not** use a `mail.` subdomain (D-34).
3. Resend shows the DNS records it needs. Copy them exactly from the Resend dashboard. **This repository deliberately contains no TXT, MX or CNAME values; any value written here would be invented.** Typical shapes **[confirm]**: a DKIM public-key TXT record, and SPF plus an MX on a sending sub-name for bounce handling.
4. Add them in Cloudflare DNS following `DOMAIN_AND_DNS_SETUP.md`, then press verify in Resend and wait for propagation.
5. Create a restricted API key and put it in the secret store as `UPNEXT_SMTP_PASSWORD`.
6. Run the checks in `EMAIL_DELIVERY_VERIFICATION.md`.
7. In Resend, add a webhook to `https://upnext.co.zw/api/v1/hooks/email/resend` for at least bounce, complaint, delivery-delay and failure events; copy its signing secret (`whsec_...`) into `UPNEXT_RESEND_WEBHOOK_SECRET`.

## 4. Webhook behaviour

Review of 2026-10-18 against the `resend` npm SDK 6.34.1 and the `standardwebhooks` 1.1.1 library its `webhooks.verify` calls (resend.com itself was blocked by the build environment's egress policy, so Resend's web documentation was **not** read):

| Item | Verified in the SDK | Still to confirm on resend.com |
|---|---|---|
| Signed content | `<id>.<timestamp>.<raw body>`, HMAC-SHA256, key = base64-decoded secret without `whsec_`, signature `v1,<base64>`, several allowed (space-separated) | |
| Timestamp tolerance | 5 minutes, rejected both when too old and too new | |
| Header names | the SDK hands its verifier `webhook-id`, `webhook-timestamp`, `webhook-signature` (Standard Webhooks); Resend's published examples are believed to read `svix-id`, `svix-timestamp`, `svix-signature` | which set Resend sends; **both are accepted** |
| Payload | `data.to` is a list of recipients; `email.bounced` carries `bounce: {type, subType, message}`; `email.failed` carries `failed.reason`; `email.suppressed` carries `suppressed: {type, message}`; `suppression.added/removed` carry `{email, origin: bounce\|complaint\|manual}` | the list of `bounce.type` values (only "Permanent" is relied on) |
| Raw body | the SDK verifies the exact string received | |

| Control | Behaviour |
|---|---|
| Raw body | the signature is checked on the exact bytes received before the JSON is read |
| Freshness | timestamps more than 5 minutes from now are refused (401) |
| Header names | `svix-*` or `webhook-*` (Standard Webhooks); `svix-*` wins when both are present; the signature authenticates either |
| Replay / duplicates | a repeated `svix-id` is acknowledged (204) and not applied again; a failure while applying releases the id so the provider's retry works |
| Size | bodies over 64 KiB are refused (413), also by `Content-Length` before reading |
| Disabled | no valid secret configured gives 404 |
| Errors | one generic answer (`Not accepted.`); logs contain the event type and a count, never an address |
| Throttling | no per-IP throttle (the provider's few addresses would be cut off); cost is bounded by the size cap, one HMAC and no writes before the signature is valid |

Event handling **[confirm names and fields]**:

| Event | Effect |
|---|---|
| `email.bounced` with bounce type Permanent (any letter case), event names exactly one recipient | that recipient suppressed (reason `bounce`) |
| `email.bounced` with Transient, Undetermined or unknown type | nothing; never permanent |
| `email.complained`, exactly one recipient | that recipient suppressed (reason `complaint`) |
| Any event naming zero or several recipients | nothing: the failing address cannot be told apart, and a guess would suppress innocent addresses (UPNEXT sends every message to one recipient) |
| `email.delivery_delayed`, `email.failed`, `email.suppressed`, `suppression.added/removed`, `email.sent`, `email.scheduled`, `email.delivered`, anything else | no effect (`email.suppressed` and `suppression.added` mean Resend itself holds the address; they are not used to suppress locally until their exact semantics are confirmed) |

`email.delivered` means the receiving server accepted the message; it is not proof the message reached the inbox. **A 200 from Resend's sending API or SMTP is acceptance for delivery, not delivery.** The outbox status `sent` therefore means "handed to the provider".

## 5. What was and was not tested

Tested: signature validity and invalidity, tampered body, multiple signatures, stale and future timestamps, missing headers, duplicates, failure and retry, size limit, malformed bodies, disabled endpoint, permanent versus temporary bounce, complaint, log content, Resend config checks. **Not tested:** any real Resend request, real DNS, real delivery or the live webhook format. Tests use a locally computed signature with an example secret, plus one **known-answer vector produced by the open-source `standardwebhooks` 1.1.1 library** (the one Resend's SDK uses): our signer reproduces its output byte for byte and our verifier accepts it only inside the 5-minute window (`tests/test_resend_webhook.py`).

## 6. Delivery verification gate

Unchanged and not satisfiable by tests (`EMAIL_DELIVERY_VERIFICATION.md`). Until a human records a current verification, `email_change_available()` is false and the change-of-e-mail endpoint refuses. When enabled, the existing rules apply: current password, a single-use token sent to the new address, a notice to the old address, audit records, and a uniform answer that does not reveal whether another account uses the address.
