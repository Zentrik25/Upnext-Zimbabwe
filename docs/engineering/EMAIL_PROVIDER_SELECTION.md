# E-mail provider selection — DRAFT

Status: DRAFT (Phase 5, WS1). The owner shortlisted **Resend** and **Amazon SES** (D-32). **No provider has been chosen, no account has been opened, no credential exists and nothing has been configured.** This page is the scorecard the owner fills in; the engineering side does not choose. Statements about the providers below are what has to be checked against each provider's current documentation and a real test; they are not findings.

## 1. What the application needs
Send plain-text transactional mail (confirmations, password resets, deletion and e-mail-change notices) from one sender address on the owner's domain, through the generic `smtp` adapter that already exists (STARTTLS or implicit TLS, timeouts, retries, 4xx/5xx classification). A bounce/complaint feed that calls the signed webhook (`POST /api/v1/hooks/email`, built in this phase) so permanent failures are suppressed. Volume at launch is small.

## 2. Scorecard (owner completes after reading each provider's documentation and running the test in §3)

| Criterion | Why it matters | Resend | Amazon SES |
|---|---|---|---|
| Supports SMTP submission with TLS (so no new adapter is needed) | the adapter exists and is tested against a stub only | ? | ? |
| Needs account approval before sending to arbitrary recipients (sandbox or similar) and how long that takes | a launch-day blocker if it is slow | ? | ? |
| Domain authentication: SPF, DKIM, DMARC guidance; can the sender domain be verified by the owner's DNS | deliverability and anti-spoofing | ? | ? |
| Bounce and complaint notifications by webhook, how they are signed, retry behaviour | the suppression list depends on it | ? | ? |
| Inbox placement for Gmail, Outlook and a Zimbabwean ISP or company mailbox (measured, §3) | the whole point | ? | ? |
| Where data is processed and stored; sub-processors; data-processing terms | privacy notice transfers section, LEGAL_REVIEW_PACK L-6 | ? | ? |
| Price at expected volume; free allowance; what happens on abuse or a complaint spike | cost and account-suspension risk | ? | ? |
| Account security (two-step for the console, scoped credentials, rotating keys) | credentials are secrets (PRODUCTION_CONFIGURATION §3) | ? | ? |
| Operational fit: who can operate the console, support options, status history | the team is small | ? | ? |

## 3. The test that produces evidence (per candidate, owner or an operator they name)
1. Create the account and verify the sender domain (SPF, DKIM, DMARC) with the owner's DNS.
2. Store the SMTP credentials in the secret store, never in the repository, and set `UPNEXT_SMTP_*`, `UPNEXT_EMAIL_FROM`, `UPNEXT_EMAIL_BACKEND=smtp` on a **non-production** stack.
3. `manage.py check_email_config --connect`, then `--send-test --to <mailbox>` to mailboxes of at least three families (Gmail, Outlook, a local ISP or company mailbox). Record inbox versus spam and the message headers' SPF/DKIM/DMARC results.
4. Send a deliberately undeliverable address; confirm the webhook marks it suppressed.
5. Run the product journeys (register, reset, deletion notice, change of e-mail) and read the messages.
6. `manage.py record_email_verification --provider <name> --operator <who> --mailboxes gmail,outlook,local-isp --spf --dkim --dmarc`. This writes the record that switches change of e-mail on (it refuses unless the configuration is valid, three families are named and all three domain checks are confirmed). Re-run it after any change of provider, host, port, security mode or sender address; the old record stops counting.

## 4. Decision record
Owner: provider chosen, date, evidence location; recorded in the decision register. Until then blocker B-01 stays open and change of e-mail address stays off.
