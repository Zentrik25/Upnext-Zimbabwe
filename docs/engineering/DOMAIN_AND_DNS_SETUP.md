# Domain, DNS and canonical URL setup — DRAFT

Status: DRAFT. **No DNS record has been created or changed, no redirect is live, and nothing is deployed.** This page prepares the owner's actions for https://nextjob.co.zw. DNS is assumed to be at Cloudflare **[owner to confirm]**.

## 1. Application side (already done, environment-controlled)

`UPNEXT_PUBLIC_BASE_URL` (API and web) is the one canonical origin. It drives canonical links, the sitemap, `robots.txt`, Open Graph and structured-data URLs, and links in e-mails. Production must set `https://nextjob.co.zw`; production start-up refuses a non-https value. No old-domain address is hard-coded in the code.

## 2. Website records (Phase 7 / owner)

Pointing nextjob.co.zw (and www, if wanted) at the VPS is a Phase 7 action that needs separate written approval. Do not add or change website records for this task.

## 3. E-mail sending records for Resend

Rules, because a mistake here can break existing mail:

1. **Use exactly the records the Resend dashboard shows** for nextjob.co.zw. Do not type values from memory or from this repository; this repository contains none.
2. In Cloudflare, add DKIM/CNAME/TXT records as **DNS only** (grey cloud) where the record type allows proxying.
3. **SPF:** a domain may have only one SPF record. If one exists for existing e-mail hosting, merge the new `include:` into it; never publish two. Resend's own SPF/MX may sit on a sending sub-name **[confirm]**, in which case the root SPF is untouched.
4. **MX:** do not change MX records on the root name; they receive the owner's inbound mail (info@, support@ ...). Any MX Resend asks for must be on its own sub-name **[confirm]**.
5. **DMARC:** publish a TXT at `_dmarc.nextjob.co.zw`. The policy and report address are the owner's choice (a starting point is a monitoring-only policy with a reports mailbox the owner reads); this is a recommendation, not a Resend record.
6. Export the zone before and after; confirm existing website and mailbox records are unchanged.
7. After propagation (minutes to hours), use Resend's verify button and a DNS lookup of each record.

## 4. Mailboxes

Names approved (D-33): info@, support@, notifications@, jobs@, partnerships@ nextjob.co.zw. Resend sends mail; it does not host inboxes. Inbox hosting is separate and must exist for support@ (it is the Reply-To) before sending is enabled. Until a mailbox is verified, leave its variable blank so the website does not publish it.

## 5. Redirects

Redirecting any old domain to nextjob.co.zw is a live change and needs approval. Nothing is configured.
