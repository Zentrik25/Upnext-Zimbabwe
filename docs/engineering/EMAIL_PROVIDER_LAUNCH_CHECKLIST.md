# E-mail provider launch checklist (B-01) — DRAFT

Status: DRAFT. **Nothing here has been done.** No Resend account exists in the repository's knowledge, no domain is added, no DNS record changed, no mailbox created, no production e-mail sent. The only official address is **info@upnext.co.zw** (D-42); it is the From, Reply-To and support address. No other mailbox (support@, noreply@, notifications@, jobs@, careers@) exists or may be created or used. The detailed, still valid technical material is in `RESEND_INTEGRATION.md`, `DOMAIN_AND_DNS_SETUP.md` and `EMAIL_DELIVERY_VERIFICATION.md`; this page orders it as a launch gate.

## Gate A — preconditions (owner)

| # | Item | Status |
|---|---|---|
| A-1 | info@upnext.co.zw already receives mail (inbox hosting is outside this repository and Resend does not provide it) | Owner to confirm |
| A-2 | Who has the DNS control panel for upnext.co.zw (the repository assumed Cloudflare; unconfirmed) | Owner to confirm |
| A-3 | Existing DNS records exported (zone file or screenshot) before any change | Not done |
| A-4 | Written approval to enable sending (separate from this checklist) | Not given |

## Gate B — provider set-up (owner, in the Resend dashboard; values never enter git)

| # | Step | Rule |
|---|---|---|
| B-1 | Add `upnext.co.zw` as the sending domain (root, not a `mail.` sub-domain, D-34) | confirm in Resend's current documentation whether it asks for a sending sub-name |
| B-2 | Copy the DNS records **exactly** as shown | the repository holds none; do not type from memory |
| B-3 | Add them as DNS-only; one SPF record only (merge `include:`); never alter root MX; DMARC TXT at `_dmarc.upnext.co.zw` (policy and report mailbox are the owner's choice; start with monitoring only) | see `DOMAIN_AND_DNS_SETUP.md` §3 |
| B-4 | Export zone after; confirm website and mailbox records unchanged | evidence kept |
| B-5 | Press verify in Resend; DNS lookups of each record | screenshot |
| B-6 | Create an API key limited to sending; store as `UPNEXT_SMTP_PASSWORD` in the secret store | never committed or pasted |
| B-7 | Add the webhook `https://upnext.co.zw/api/v1/hooks/email/resend` (bounce, complaint, delay, failure); store `whsec_…` as `UPNEXT_RESEND_WEBHOOK_SECRET` | needs the site to be live (Phase 7) |

## Gate C — application configuration (values from `production.env.example`)

```
UPNEXT_EMAIL_BACKEND=smtp   # only after Gates A and B, and with approval A-4
UPNEXT_EMAIL_FROM=UPNEXT Careers <noreply@upnext.co.zw>   # send-only From (D-52); fixed in compose.production.yaml
UPNEXT_EMAIL_REPLY_TO=info@upnext.co.zw
UPNEXT_SMTP_HOST=smtp.resend.com   UPNEXT_SMTP_PORT=465   UPNEXT_SMTP_SECURITY=ssl   UPNEXT_SMTP_USER=resend
```
Resend host, user and port are unconfirmed against Resend's current documentation (confirm before use). Production start-up refuses plaintext SMTP and the Resend settings checker refuses mismatched port/security.

## Gate D — verification evidence (needs real mailboxes; `EMAIL_DELIVERY_VERIFICATION.md` items 1–9)

DKIM/SPF/DMARC pass in received headers; real test message in Gmail, Outlook and a Zimbabwean mailbox; a real bounce is suppressed through the webhook; DNS unchanged otherwise. Then `check_email_config --connect`, one approved `--send-test` to an address the owner controls, then `record_email_verification`. The record is bound to the configuration hash, so changing host, provider or sender voids it.

## What opens when B-01 closes

`delivery_verified()` becomes true: employer notifications (M2) start (they write nothing and record `delivery_unverified` until then); change-of-e-mail becomes available (MVP-only approval); seeker job alerts may be considered but **remain a separate owner decision** (see `LAUNCH_DECISIONS_TRIAGE.md`).

## What is already proven without credentials

Outbox, retries, 4xx/5xx classification, webhook signature handling (including a known-answer vector from the Standard Webhooks library), suppression, config checks, brand-correct plain/HTML bodies. Not proven: any real request, DNS, delivery or live webhook format.
