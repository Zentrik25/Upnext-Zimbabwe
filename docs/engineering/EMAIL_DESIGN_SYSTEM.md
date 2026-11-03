# E-mail design system and inventory — DRAFT

Status: DRAFT (D-55). Implemented on branch `ccr-aa9328e7-xyl434`; **not merged, nothing deployed, no e-mail has been sent** (B-01 stays open: the sending domain is not verified). Statements about mail clients below are about the **markup techniques** used; no real Gmail, Outlook or Apple Mail account was available, so rendering in those clients is **not verified** (section 7).

## 1. What changed

| Before | After |
|---|---|
| 19 plain-text Django templates; HTML derived from the text by `htmlmail.py` (text wordmark, no images) | One structured message per kind (`notifications/content.py`) rendered **twice** by one kit (`notifications/emailkit.py`): HTML and plain text come from the same object, so they cannot drift |
| Fixed subjects like "Reset your UPNEXT Careers password" | `Title \| UPNEXT Careers` (welcome: "Welcome to UPNEXT Careers"); a subject chosen by the event (a listing's title, an alert's count) still wins, cleaned to one line of at most 150 characters |
| No logo, no button | Logo header, purple call-to-action button, notices, facts, compact footer |

Triggers, outbox, idempotency keys, token handling, expiry, suppression, throttles and consent checks are **unchanged**. The job-alert row gained one display field (`kind`, the category name) in its payload; old queued rows without it render without it.

## 2. Inventory of every e-mail the application sends

| Kind | Triggered by | To | Subject | Button | Link / expiry |
|---|---|---|---|---|---|
| `email_verification` | registration; "send again" (`accounts/services.py`) | the new account | Verify your email address \| UPNEXT Careers | Verify email address | single-use token, 24 h (`accounts.tokens.TTL`) |
| `account_exists` | registration with an address that already has an account | that address | You already have an account \| UPNEXT Careers | Sign in | none |
| `password_reset` | forgot-password request | the account | Reset your password \| UPNEXT Careers | Reset password | single-use token, 60 min |
| `password_changed_notice` | password change; reset completed | the account | Your password was changed \| UPNEXT Careers | link "Reset my password" | none |
| `account_deletion_notice` | deletion requested | the account | Account deletion requested \| UPNEXT Careers | Review my account | none (date and waiting period shown) |
| `account_deletion_completed` | deletion carried out | the old address | Your account has been deleted \| UPNEXT Careers | none (contact link) | none |
| `account_deletion_cancelled` | deletion cancelled | the account | Account deletion cancelled \| UPNEXT Careers | none (link to change password) | none |
| `email_change_confirm` | change of address requested | the **new** address | Confirm your new email address \| UPNEXT Careers | Confirm email address | single-use token, 24 h |
| `email_change_requested_notice` | change of address requested | the current address | Email address change requested \| UPNEXT Careers | none (link to change password) | none |
| `email_changed_notice` | change confirmed | the **old** address | Your email address was changed \| UPNEXT Careers | none (contact link) | none |
| `job_alert` | alert sweep (`alerts/service.py`), only for people who switched alerts on | the subscriber | "N new opportunities matching your UPNEXT Careers alert" (event subject) | View opportunity (per listing), See all opportunities | RFC 8058 one-click unsubscribe header and link |
| `employer_claim_received` | organisation claim sent | the claimant | We received your organisation claim \| UPNEXT Careers | Follow its progress | none |
| `employer_claim_approved` | claim approved | the claimant | Your organisation claim was approved \| UPNEXT Careers | Open my employer page | none |
| `employer_claim_rejected` | claim rejected | the claimant | Your organisation claim was not approved \| UPNEXT Careers | Open my employer page | none |
| `employer_listing_submitted` | listing or amendment submitted | members who may act | event subject | See where it stands | none |
| `employer_listing_published` | approved and live | same | event subject | See it as visitors do / Manage the listing | none |
| `employer_listing_rejected` | changes requested | same | event subject | Open and edit | none |
| `employer_listing_expiring` | 7 days before the deadline (`UPNEXT_EXPIRY_REMINDER_DAYS`) | same | event subject | Open the listing | none |
| `employer_listing_expired` | deadline passed | same | event subject | See the listing | none |
| `welcome` | **nothing: template built, trigger not built** | — | Welcome to UPNEXT Careers | Explore opportunities | none |

Employer mail is queued only while delivery is verified (`notifications/verification.py`); job alerts only for people who enabled them and while verified; duplicates are prevented by deterministic idempotency keys (section 6).

### Requested e-mails that the application cannot send today (not built; need approval)

Building any of these means a **new trigger**, which the brief says not to add without approval. None was added.

| Requested | State | What approval would unlock |
|---|---|---|
| Welcome after verification | template ready (`welcome`, previewable, tested); **no code queues it** (a test fails if anything outside `notifications/` references it) | one `enqueue_once(EmailKind.WELCOME, ..., idempotency_key=f"welcome:{user.pk}")` after a successful verification, which also gives "no duplicates" |
| Saved-opportunity closing reminders | no such feature exists (saved opportunities have no reminder schedule) | a schedule, a consent switch (off by default), a "listing withdrawn or closed" check and a de-duplication key |
| Contact acknowledgement, support response | the contact form does not send mail | a trigger and a decision on what may be promised (no response time is promised in any template) |
| Opportunity report acknowledgement | public reports are recorded (`reports/`) but no mail is sent | a trigger and the privacy text for the reporter's address |
| Staff security notifications | no staff-security mail is sent | a list of reliably detectable events |
| "Account recovery" | the password-reset message is the recovery message | nothing more |

## 3. The design system

Reference: the owner-supplied verification mock-up (header band with logo and tagline, eyebrow, "Hello name," headline, grey lead text, illustration at right, full-width purple button, lavender notice panels, compact footer). Colours come from `apps/web/src/design/tokens.json`.

| Element | Value |
|---|---|
| Header | brand dark `#1c1e54`, white lockup, tagline "Jobs and opportunities in Zimbabwe." |
| Page / card | `#f6f9fc` / `#ffffff`, 1px `#e5edf5` border, 12px corners, max width 600 px, single column |
| Headline | 34 px (26 px on phones), weight 800, ink `#061b31` |
| Body | 17 px lead and 15 px small text in the corrected slate `#5a6a82` (DEV-05, ≥ 4.5:1) |
| Button | `#533afd`, white 17 px semibold, 6 px radius, full width; Outlook gets a VML rounded rectangle |
| Notice | `#f1effe` panel with a 4 px purple edge, bold title, one sentence |
| Facts | two-column rows between hairlines (organisation, listing, deadline) |
| Footer | name, tagline, `info@upnext.co.zw`, site, About, Contact, Privacy, Terms, © year |
| Dark scheme | the tokens' dark values: page `#0e0f2e`, card `#151634`, panel `#1e1f4a`, text `#e8ecf0`, links `#b9b9f9`, button `#5a51f5`; the header stays brand dark |
| Fonts | system stack only (`-apple-system, Segoe UI, Roboto, Arial`); no web fonts, no external CSS |

Components in `emailkit.py`: `EmailContent` (the message), `Cta`, `Notice`, `Fact`, `Link`, `Listing`, `render_html`, `render_text`, `brand_context`. Copy for each kind lives in `content.py`. Adding a kind means adding an enum value, a builder in `BUILDERS` and a sample in `samples.py`; the tests then cover it automatically.

### Images (D-55 supersedes the "no images" rule of D-34 for these two files only)

| File | Shown at | Weight | Where used |
|---|---|---|---|
| `apps/web/public/brand/email/upnext-email-logo.png` | 222×40 (rendered at 2×) | 6 KB | every message, header |
| `apps/web/public/brand/email/verify-illustration.png` | 200×150 (rendered at 2×) | 17 KB | verification only; hidden on phones |

Both are the same bytes for every recipient: **no per-recipient URL, no query string, no 1×1 image, no tracking**. They are served from the site's own origin (`UPNEXT_PUBLIC_BASE_URL` + `/brand/email/…`, HTTPS in production). Both have fixed `width`/`height`; the logo has alt text "UPNEXT Careers" styled white on the dark header so it stays readable when images are blocked; the illustration is decorative (`alt=""`). The logo is the official white lockup (`upnext-lockup-white.svg`) rendered to PNG because mail clients do not reliably show SVG (`node tools/brand/render_email_assets.mjs`). **The images load only after the web app is deployed** (nothing is deployed, so until Phase 7 a real recipient would see the blocked-image fallback). If the files change, give the new file a new name so cached copies in old mail are not altered.

## 4. Security and privacy rules in the templates

* The only secret in any message is the one-time link the person must follow. It appears as the button target and once as visible fallback text; it is never shown as a separate "code". Tests assert the token appears nowhere outside a URL and once in the plain text.
* Nothing exposes a password, session or account detail beyond the display name, and no message claims an organisation or listing is verified (a test enforces this; the "published" message states that publication is **not** verification).
* No response time is promised; no mailbox other than `info@upnext.co.zw` is named.
* Names, titles and staff reasons are HTML-escaped and wrapped (`overflow-wrap`), long names are cut to 48 characters in the greeting, subjects are one line of at most 150 characters (header-injection safe).
* Links are `https://` (or `mailto:`); no tracked or redirected links.

## 5. Preview and test tooling (development only)

* `python manage.py preview_emails --out DIR` writes every kind in three variants (normal, long names and titles, missing optional fields) as HTML and text, copies the images, and builds `index.html` and `viewer.html` (desktop, phone and small-phone frames). It reads no database row, sends nothing, uses placeholder tokens (`SAMPLE-PLACEHOLDER-NOT-A-REAL-TOKEN`) and the reserved `upnext.example` origin, and refuses `UPNEXT_ENVIRONMENT=production`.
* `NODE_PATH=$(npm root -g) node tools/email_preview_screenshots.mjs DIR OUT [kind.variant …]` captures each message at desktop 760 px, phone 375 px and 320 px, light and dark, and with images blocked, and reports horizontal overflow.
* Dark mode by hand: DevTools → Rendering → "Emulate prefers-color-scheme".

## 6. Test results (executed on this branch, 2026-10-31)

| Check | Result |
|---|---|
| `pytest` whole API suite (Python 3.14.6, PostgreSQL 16), run again after the last edit | **1081 passed**, coverage 94.5% (gate 85%) |
| `ruff format`, `ruff check`, `mypy` (strict) on the API | pass; `makemigrations --check`: no changes pending |
| Every kind × 3 variants renders; HTML and text carry the same links; tables balanced; no `{{`, `None`, dict leaks | pass (60 combinations) |
| Markup safety: no script, form, iframe, link, object; no `url(` or `@import`; only `https`/`mailto` links; ≤ 2 images, each with alt, width, height, own-origin PNG, no query string; under 100 KB | pass for every kind |
| WCAG 2.1 contrast of all text colour pairs, light and dark | pass (≥ 4.5:1, 13 pairs, computed in the test) |
| Token security: no token outside a URL; one occurrence in the plain text | pass |
| Duplicate-send prevention: unique idempotency key, `skip_locked` claim, second `process_batch` sends nothing, Message-ID derived from the key | pass (`test_outbox.py`, `test_employer_notifications.py`, `test_alerts.py`, unchanged and still green) |
| Delivery failures: temporary failure retries with backoff, permanent failure goes dead, suppressed recipient not sent | pass (`test_outbox.py`, `test_email_provider.py`, unchanged and still green) |
| Visual capture of 60 messages × 6 views (360 images) | **no horizontal overflow** at 760, 375 or 320 px; images-blocked view keeps the dark header and readable alt text. Curated set: `docs/design/evidence/email/` |

### Not verified (be explicit)

* **Real clients.** Gmail (web and mobile), Outlook (Windows, web, mobile), Apple Mail and Samsung Mail were **not** tested; the screenshots are Chromium. The techniques used are the standard ones for those clients (presentation tables, inline CSS with a legible light default, VML button for Outlook Windows, `prefers-color-scheme` plus the `[data-ogsc]` Outlook.com hook, system fonts), but VML and Outlook.com dark-mode rendering in particular are **unconfirmed**. Run the real-mailbox checks in `EMAIL_DELIVERY_VERIFICATION.md` with the new templates (a free tool such as an inbox-preview service can be used with synthetic data from the preview command; never with real tokens).
* **Dark mode in Gmail's app** is partial by design: some versions ignore `<style>` and apply their own colour inversion. The inline light colours and the always-dark header are chosen to stay legible when that happens, but this was not observed.
* **Images** cannot load before deployment (section 3).

## 7. Deliverability review (read-only; nothing in DNS or the provider was changed)

What the code and configuration already provide:

| Area | State |
|---|---|
| Provider | Resend through the generic SMTP adapter (D-34); `smtp` backend only; checks in `notifications/config.py`; credentials only from the environment, never logged |
| Sender identity | production Compose fixes `UPNEXT Careers <noreply@upnext.co.zw>` (D-52, send-only); Reply-To `info@upnext.co.zw`, the only mailbox. The code default (`UPNEXT_EMAIL_FROM`, `info@`) applies to development and tests only |
| Queueing and retry | transactional outbox; worker with `skip_locked` claiming; backoff 30 s, 2 min, 10 min, 1 h, 6 h; dead after 6 attempts; 4xx retried, 5xx permanent; stuck rows recovered after 5 min |
| Duplicate-send prevention | unique `idempotency_key` per event/recipient; `enqueue_once` safe under races; Message-ID derived from the key so a provider or relay can de-duplicate. Delivery is at-least-once: a crash after the provider accepted a message and before the row is marked sent can send it twice (rare, documented in `services.py`) |
| Bounces and complaints | signed webhook `POST /api/v1/hooks/email/resend` (off until `UPNEXT_RESEND_WEBHOOK_SECRET` is set); permanent bounces and complaints go to a keyed-hash suppression list; suppressed recipients are never sent |
| Rate limiting | per-address gap (60 s) and hourly cap (3) plus per-IP throttles on e-mail-sending requests (`api/throttles.py`) |
| Headers | `Auto-Submitted: auto-generated` on all; `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) on job alerts only, correctly; Reply-To set |
| Gate | nothing counts as deliverable until `record_email_verification` is run after real test sends (B-01) |

Open items for the owner or operator (none can be done from the repository):

1. **Domain authentication is not set up** (B-01): add `upnext.co.zw` in Resend, publish the DKIM and SPF records Resend shows (one SPF record only; merge `include:`; never alter root MX), publish DMARC at `_dmarc.upnext.co.zw` (start at monitoring), and decide the report mailbox. **Not verified, not changed.**
2. **From-domain alignment**: From is `noreply@upnext.co.zw`; SPF/DKIM must align with `upnext.co.zw` for DMARC to pass. Confirm in a received message's authentication results.
3. **Reply-To mailbox** `info@upnext.co.zw` must actually receive mail; replies to a send-only From go there.
4. **`Date` header**: the SMTP adapter does not set one (Python's `EmailMessage` does not add it). Resend is expected to add it **[confirm]**; if a different relay is ever used, set `Date` in `SmtpSender.send`. Not changed here because the brief limits this change to the design.
5. **Unsubscribe for alerts** works through the signed token; the alert `List-Unsubscribe` URL is on the API path, which must be reachable from the public origin in production.
6. **Webhook**: configure bounce, complaint and delivery-delay events in Resend and the signing secret (`RESEND_INTEGRATION.md` §3 step 7).
7. **Image URLs** (`/brand/email/…`) must be reachable without sign-in once the site is deployed and not blocked by the CSP/proxy for external clients (they are static files; the web proxy only adds headers).
8. **Link domain**: all links use the site origin; no click-tracking domain is introduced, so no extra DNS is needed.

## 8. Decisions needed

1. Approve sending the **welcome e-mail** (one trigger, once per account). Until then it is never sent.
2. Decide whether **saved-opportunity reminders**, **contact acknowledgement**, **report acknowledgement** and **staff security notifications** should exist, and with what consent and wording.
3. Confirm D-55's narrow exception to the "no images" rule (own-origin logo and verification illustration only).
4. Approve the subject convention `Title | UPNEXT Careers` (employer and alert subjects keep their event-specific wording).
