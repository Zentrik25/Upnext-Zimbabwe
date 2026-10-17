# Production configuration and safeguards — DRAFT

Status: DRAFT for owner review. Nothing here deploys anything; it records what the application requires and refuses. The deployment itself (VPS, Traefik, Nginx) is Phase 7 and needs separate approval.

## 1. What the production settings refuse to start without

`config.settings.prod` raises at start-up unless every line holds (tests: `apps/api/tests/test_platform.py`, 24 cases). `UPNEXT_ENVIRONMENT` defaults to `production`; only the Compose prod-like override and CI set `local-prod-like`, which skips the last group below so the production images can run with demo data.

| Always | In `production` only |
|---|---|
| `DJANGO_SECRET_KEY` random, at least 50 characters, not `django-insecure…` | `UPNEXT_STAFF_MFA_REQUIRED` true (staff two-step verification on) |
| `DJANGO_ALLOWED_HOSTS` set | `UPNEXT_DEMO_TOOLS` not set |
| `UPNEXT_SECURE_COOKIES=true` | `DJANGO_HSTS_SECONDS` at least 31536000 (never `includeSubDomains` or preload: the domain is shared, OQ-01) |
| `UPNEXT_ENVIRONMENT` is `production` or `local-prod-like` | `DJANGO_ALLOWED_HOSTS` has no `*` |
| E-mail settings valid (below) | `DJANGO_CSRF_TRUSTED_ORIGINS` lists only `https://` origins |
| | `UPNEXT_PUBLIC_BASE_URL` is `https://…` |
| | `UPNEXT_TOKEN_KEY` is its own random value of at least 32 characters (not the secret key) |
| | e-mail backend is not `file` or `console`; `smtp` is not `UPNEXT_SMTP_SECURITY=none` |

Messages name the variable and never print a secret value.

## 2. Variables

Secrets are supplied by the environment (an untracked env file or the platform's secret store), never committed. `infrastructure/compose/.env.example` lists the local ones.

| Variable | Purpose | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY`, `UPNEXT_TOKEN_KEY`, `UPNEXT_THROTTLE_PEPPER` | signing, link and two-step secrets, throttle keys | Rotating `UPNEXT_TOKEN_KEY` invalidates outstanding e-mail links and resets every staff two-step device. Rotating the pepper only resets throttle counters |
| `POSTGRES_*` | database | separate role per purpose is a Phase 6/7 task |
| `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `UPNEXT_PUBLIC_BASE_URL` | the public origin (OQ-01) | web also reads `UPNEXT_PUBLIC_BASE_URL` for canonical URLs, the sitemap and structured data |
| `UPNEXT_SECURE_COOKIES`, `UPNEXT_HOST_COOKIE_PREFIX` | cookie flags and the `__Host-` prefix | the prefix needs one hostname, `Secure` and `Path=/`; enable it once OQ-01 fixes the topology |
| `DJANGO_HSTS_SECONDS`, `UPNEXT_TRUST_PROXY_HEADERS` | transport | trust proxy headers only behind a proxy that overwrites `X-Forwarded-Proto` (to be inspected read-only in Phase 7) |
| `UPNEXT_EMAIL_BACKEND`, `UPNEXT_SMTP_*`, `UPNEXT_EMAIL_FROM`, `UPNEXT_EMAIL_REPLY_TO` | e-mail | see section 3 |
| `UPNEXT_CONTACT_EMAIL` | address shown on the Contact page | unset means the page says details are not published yet |
| `UPNEXT_STAFF_MFA_REQUIRED`, `UPNEXT_STAFF_IDLE_SECONDS`, `UPNEXT_STAFF_SESSION_SECONDS`, `UPNEXT_SEEKER_*` | sessions and staff protections | PROPOSED values (OQ-17) |
| `UPNEXT_THROTTLE_*`, `UPNEXT_LOGIN_FAILURES_PER_EMAIL`, `UPNEXT_EMAIL_REQUEST*` | rate limits | the dev stack loosens them; do not copy that |
| `UPNEXT_DELETION_COOLING_OFF_DAYS`, `UPNEXT_RETENTION_*` | deletion wait and retention windows | provisional (P4-05, P4-06) |
| `UPNEXT_EXPOSE_OPENAPI_SCHEMA` | serve `/api/v1/schema` | off in production |

Never set in production: `UPNEXT_DEMO_TOOLS`, `UPNEXT_DEMO_PASSWORD`, `UPNEXT_ENVIRONMENT=local-prod-like`, `UPNEXT_EMAIL_BACKEND=file|console`, `UPNEXT_STAFF_MFA_REQUIRED=false`, `DJANGO_DEBUG`.

## 3. E-mail provider

No provider is chosen (OQ-03) and none is enabled. Until one is configured the default backend `none` sends nothing and messages wait in the outbox.

1. The application talks only to the `EmailSender` port (`notifications/sender.py`). `smtp` is a generic adapter (STARTTLS or implicit TLS, timeouts, `Reply-To`, `Auto-Submitted`, 5xx classed as permanent and 4xx as retryable). A provider's HTTP API adapter is added by writing a class with `send()` and calling `register("name", factory)`, then `UPNEXT_EMAIL_BACKEND=name`.
2. Once the owner chooses a provider: create a sender identity and domain authentication (SPF, DKIM, DMARC) with them, put `UPNEXT_SMTP_HOST`, `UPNEXT_SMTP_PORT`, `UPNEXT_SMTP_SECURITY`, `UPNEXT_SMTP_USER`, `UPNEXT_SMTP_PASSWORD` and `UPNEXT_EMAIL_FROM` in the secret store, then run, from the worker container: `manage.py check_email_config --connect` and `manage.py check_email_config --send-test --to <address you control>`.
3. Bounces and complaints: addresses that are refused permanently are added to the suppression list automatically (keyed hashes, no addresses stored) and are not tried again; `manage.py suppress_address --email … [--release]` edits it by hand. A provider's webhook feed is **not built** because the provider is unknown; it would call `notifications.suppression.suppress`.
4. Monitoring: `manage.py outbox_status [--check]` (exit 1 when the oldest waiting message is over 10 minutes old or any message is dead), a warning log `outbox.alert` each housekeeping cycle, the worker heartbeat file read by the Compose health check, and the Administrator-only outbox page in `/staff/` (addresses masked, retry is audited). Alert delivery itself (who is told) is Phase 6.

## 4. Cookies, CSP and headers (review summary)

- Session and CSRF cookies: `Secure` (enforced), `SameSite=Lax`, the session cookie `HttpOnly`, no `Domain`. Prefix `__Host-` available (section 2).
- Public pages: CSP with a per-request nonce and `strict-dynamic`, no inline script, `frame-ancestors 'none'`, `form-action 'self'`. JSON-LD blocks are non-executable data and are escaped (`safeJson`).
- Staff site: CSP `script-src 'self'`, no inline script or eval; `style-src` allows inline styles because Django Admin sets them. This is the one remaining relaxation.
- API and staff: `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` on authenticated and auth responses.
- Not verifiable here: the real TLS front (HSTS, redirect, cookie transmission), the proxy's header handling. Phase 7 checklist.
