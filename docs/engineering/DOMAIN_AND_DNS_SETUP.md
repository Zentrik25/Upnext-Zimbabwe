# Domain, DNS and canonical URL setup — DRAFT

Status: DRAFT (updated for D-42: the only public origin is the root domain https://upnext.co.zw; the domain is already registered; nothing is to be purchased). **No DNS record has been created or changed, no redirect is live, and nothing is deployed.** This page prepares the owner's actions for https://upnext.co.zw. DNS is assumed to be at Cloudflare **[owner to confirm]**.

## 1. Application side (already done, environment-controlled)

`UPNEXT_PUBLIC_BASE_URL` (API and web) is the one canonical origin. It drives canonical links, the sitemap, `robots.txt`, Open Graph and structured-data URLs, and links in e-mails. Production must set `https://upnext.co.zw`; production start-up refuses a non-https value. No old-domain address is hard-coded in the code.

## 2. Website records (Phase 7 / owner)

Pointing the root name upnext.co.zw at the VPS (no `www`, no other hostname and no redirect is authorised) is a Phase 7 action that needs separate written approval. Do not add or change website records for this task.

## 3. E-mail sending records for Resend

Rules, because a mistake here can break existing mail:

1. **Use exactly the records the Resend dashboard shows** for upnext.co.zw. Do not type values from memory or from this repository; this repository contains none.
2. In Cloudflare, add DKIM/CNAME/TXT records as **DNS only** (grey cloud) where the record type allows proxying.
3. **SPF:** a domain may have only one SPF record. If one exists for existing e-mail hosting, merge the new `include:` into it; never publish two. Resend's own SPF/MX may sit on a sending sub-name **[confirm]**, in which case the root SPF is untouched.
4. **MX:** do not change MX records on the root name; they receive the owner's inbound mail (info@). Any MX Resend asks for must be on its own sub-name **[confirm]**.
5. **DMARC:** publish a TXT at `_dmarc.upnext.co.zw`. The policy and report address are the owner's choice (a starting point is a monitoring-only policy with a reports mailbox the owner reads); this is a recommendation, not a Resend record.
6. Export the zone before and after; confirm existing website and mailbox records are unchanged.
7. After propagation (minutes to hours), use Resend's verify button and a DNS lookup of each record.

## 4. Mailboxes

D-42: the only official address is **info@upnext.co.zw**. No other mailbox (support@, notifications@, jobs@, partnerships@, noreply@) exists or is to be created. It is both the From and the Reply-To. Resend sends mail; it does not host inboxes, so info@ must already receive mail (set up by the owner outside this repository) before sending is enabled. Nothing here creates a mailbox.

## 5. Redirects

No redirect of any kind is configured or authorised: no `www`, no old development domain. Any later redirect is a live change that needs separate written approval. The exact DNS, proxy and TLS steps for the root domain are in `PRODUCTION_DEPLOYMENT_PLAN.md`.
