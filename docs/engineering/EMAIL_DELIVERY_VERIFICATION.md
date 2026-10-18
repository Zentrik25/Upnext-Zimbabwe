# E-mail delivery verification procedure — DRAFT

Status: DRAFT. **No verification has been performed and none is recorded.** E-mail delivery counts as operational (and change of e-mail may be enabled) only when every item below is true and a record matching the active configuration exists (`notifications/verification.py`). Unit tests never satisfy this gate.

## Checklist (owner or operator, with real mailboxes)

| # | Check | Evidence to keep |
|---|---|---|
| 1 | Resend shows **nextjob.co.zw** as verified | dashboard screenshot with date |
| 2 | DKIM passes on a received message | the message's authentication results / headers |
| 3 | SPF passes (alignment with the visible From domain) | same |
| 4 | DMARC passes; policy chosen by the owner (start permissive, e.g. monitoring only, then tighten); reports mailbox decided | DMARC record, header result |
| 5 | Real test message received in **Gmail** | header + inbox/spam placement |
| 6 | ... in **Outlook** | same |
| 7 | ... in a **Zimbabwean ISP or local business mailbox** | same |
| 8 | Webhook receives a real bounce and a real delivery event and the permanent bounce is suppressed | log lines (counts only) and the suppression row existing |
| 9 | Existing website and e-mail-hosting DNS records are unchanged | before/after DNS export |

Only after 1 to 9 hold: `python manage.py check_email_config --connect`, then send a test with `check_email_config --send-test --to <your own address>` (sending real mail needs the owner's approval), then:

```
python manage.py record_email_verification --provider resend --operator "<name>" --mailboxes gmail,outlook,local-isp --spf --dkim --dmarc
```

(exact flags: `python manage.py record_email_verification --help`). The record stores the provider, operator, mailbox families and a hash of the active configuration; changing the host, provider or sender makes it stop counting, and the checklist must be repeated.

## Rules

- Do not mark launch blocker B-01 closed without this evidence attached to the Phase 5 report.
- Do not copy DNS values into the repository; they live in Resend and Cloudflare.
- A failed or partial result is recorded as such.
