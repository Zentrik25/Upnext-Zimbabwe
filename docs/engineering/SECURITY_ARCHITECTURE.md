# Security and authentication architecture — DRAFT

Status: DRAFT for review. Replaces the outline in `SECURITY.md` (retained as the threat-category list). Numeric parameters are **PROPOSED** values tracked as OQ-17; product/legal items are tagged `[OQ-n]`. Nothing here authorises code or infrastructure change. Implements D-09, D-11, D-13, D-14 and the register's isolation rule for The Granite Post (D-06).

## 1. Principles
1. Server-side enforcement of every rule; the UI only reflects permissions.
2. Least privilege (roles, DB roles, containers, network).
3. No secrets in the browser, in Git, in logs or in the database in recoverable form (other than password hashes).
4. Uniform responses for anything that could reveal whether an account exists.
5. Everything privileged is audited, append-only.
6. Minimise personal data; no data leaves the VPS without an approved decision (email provider [OQ-03], error tracking [OQ-26]).

## 2. Trust boundaries and topology (proposed; domain [OQ-01], routing [OQ-10] unverified)

```
Browser ──HTTPS──▶ Traefik (existing, shared) ──▶ Nginx (existing) ──▶ UPNEXT edge ─┬▶ web (Next.js)     path /
                                                                                    └▶ api (Django/DRF)  path /api/, staff UI path /staff/
                                                         internal Docker network ──▶ PostgreSQL (no host port)
```
- One public hostname, path-routed, so browser calls to `/api/*` are **same-origin**: no CORS, first-party cookies, `SameSite=Lax` works. If OQ-01 forces separate hostnames, ADR-0003 topology and this section must be revisited (cookie `Domain`, CORS allow-list, CSRF trusted origins).
- Server-side rendering calls the API over the internal network (`http://api:…`) and forwards the browser's cookie header; public pages are rendered without credentials.
- The API trusts `X-Forwarded-*` headers only from the proxy network; the exact Traefik→Nginx header handling is **unverified** and must be inspected read-only before Phase 7.
- UPNEXT runs in its own Compose project, networks, volumes, env files, database and credentials. No UPNEXT process may attach to a Granite Post network except the single edge service attaching to the shared proxy network, after inspection and approval.

## 3. Identity and sessions

| Aspect | Design |
|---|---|
| Account store | `app_user` (ERD §3.1); email (citext, unique) + Argon2id password hash (`argon2-cffi` via Django hasher; parameters tuned at Phase 4 to ~200–500 ms on target hardware) |
| Session | Django database-backed sessions (Redis deferred). Cookie `__Host-upnext_sid`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain` (the `__Host-` prefix requires one hostname — see §2). The session id is rotated at login, password change, role change and after re-authentication |
| Session lifetime `[PROPOSED, OQ-17]` | Seeker: idle 7 days, absolute 30 days. Staff (any role): idle 30 min, absolute 12 h |
| Concurrent sessions | allowed; listed to the user (`user_session`); user may revoke any; password change/reset revokes **all** others |
| Account status check | on every request, the user's `status` and roles are read from the DB; suspended/deactivated users have their sessions invalidated immediately |
| Sensitive actions (change password/email, delete account, revoke all sessions) | require password re-entry if the last authentication is older than 10 minutes `[PROPOSED]` |
| MFA | not in Release 1 for seekers; **staff MFA is OPEN [OQ-16]**; the design leaves room for TOTP/WebAuthn without changing the session model |
| Tokens in JS | none. No JWT, no `localStorage` credentials (reference prototype's localStorage login is demo-only and must not be ported) |

### 3.1 CSRF
- Django CSRF protection on all unsafe methods. Token cookie `__Host-upnext_csrf` (`Secure; SameSite=Lax`, readable by script so the SPA can echo it), also returned by `GET /api/v1/auth/csrf`; mutations must send `X-CSRFToken`. Django also validates `Origin`/`Referer` against `CSRF_TRUSTED_ORIGINS` (the single public origin).
- Token is rotated on login. Login/registration/reset endpoints require CSRF too (prevents login CSRF).
- State-changing requests accept `application/json` only.

### 3.2 Registration and email verification
1. `POST /auth/register` (validated, throttled). Response is **always `202 Accepted`** with the same body whether or not the email already exists.
2. New email: create `app_user(status=pending_verification)` and, in the same DB transaction, an `auth_token(email_verification)` and an `email_outbox` row.
3. Existing email: no user change; enqueue an "account already exists / reset your password" email instead.
4. User opens link → `POST /auth/email/verify` with the token → `status=active`, `email_verified_at` set, token consumed. **No automatic sign-in** from an email link (avoids session fixation and link-forwarding risk); the UI sends them to sign in.
5. Whether an unverified user may sign in at all is `[OQ-04/OQ-15]`; specified default: login with correct credentials returns `403 email_not_verified` (no session) and the UI offers "resend".
6. Resend: throttled (§8); previous token invalidated on new issue.

### 3.3 Login
- `POST /auth/login` → generic `401 invalid_credentials` for unknown email, wrong password, or missing account alike. For an unknown email a dummy Argon2 verification is performed to equalise timing.
- Throttles per IP, per email-hash and per (IP, email-hash) (§8). After the configured failures the endpoint returns `429` with `Retry-After`; there is no permanent lock-out (avoids trivial denial of service). Failures and successes are audited with `ip_hash`.
- Rehash on login if the stored hash parameters are outdated.
- Correct credentials but status `suspended|deactivated` → `403 account_unavailable`.

### 3.4 Password reset
1. `POST /auth/password-reset/request` → always `202`, identical body and similar work (user lookup + outbox insert only if the user exists and is `active`).
2. Email contains a single-use link; token TTL 60 min `[PROPOSED]`; a new request invalidates earlier tokens.
3. `POST /auth/password-reset/confirm` {token, new_password}: validates password (VALIDATION_SPEC §2), sets it, marks token used, revokes **all** sessions, enqueues a "password changed" notice, audits.
4. The reset page sets `Referrer-Policy: no-referrer`, loads no third-party resources, and removes the token from the visible URL after load.

### 3.5 Token construction (no recoverable secret at rest)
`auth_token.id` is a random UUID (selector). The emailed token is `base64url(id) + "." + base64url(HMAC-SHA256(TOKEN_KEY, id ‖ purpose ‖ user_id ‖ expires_at))`. The database stores only `id, user_id, purpose, expires_at, used_at, invalidated_at` — a database leak does not yield usable tokens, and the outbox worker can re-derive the link at send time without a stored secret. Verification recomputes the MAC (constant-time), then checks the row is unused, not invalidated and unexpired. Rotating `TOKEN_KEY` invalidates outstanding tokens (acceptable given short TTLs). *(This replaces the `token_hash` column in earlier drafts; ERD updated.)*

### 3.6 Account deletion and data rights
`POST /me/deletion-request` (re-auth) records `deletion_requested_at`, revokes sessions optionally, and starts the process in ERD §5. Cooling-off, retention of audit rows, legal basis, export format: **[OQ-09]**. A data-export endpoint is intended for the privacy process but its format is undefined [OQ-09].

## 4. Reliable email delivery without Redis/Celery (D-11)

### 4.1 Interface
`notifications` exposes one port; application code never talks to a provider:

```
EmailSender.send(message: EmailMessage) -> DeliveryResult
  EmailMessage: {idempotency_key, to, template_key, template_version, context, locale}
  DeliveryResult: {outcome: sent | temporary_failure | permanent_failure, provider_message_id?, error_code?}
```
Adapters: `ConsoleSender` / `FileSender` (local, tests), `SmtpSender` or `ProviderApiSender` (chosen by [OQ-03]), `FakeSender` (contract tests). Templates are versioned files (plain-text + HTML), rendered by the worker, not by request handlers.

### 4.2 Transactional outbox
- A request that needs an email inserts an `email_outbox` row **in the same database transaction** as the state change (token created, user created). Either both exist or neither does; there is no "user created but email lost".
- Handlers never call the provider. Request latency and enumeration timing are independent of provider speed.

### 4.3 Worker
- Management command `process_email_outbox` (loop mode with sleep, or invoked each minute by a scheduler). It claims batches with `SELECT … FOR UPDATE SKIP LOCKED`, marks `sending`, calls the sender, then marks `sent`/`failed`/`dead`. Multiple worker processes are safe.
- **Delivery semantics: at-least-once.** Rows stuck in `sending` longer than 5 min are returned to `failed` (counts an attempt). A duplicate verification/reset email is harmless (older links are invalidated by the newer token). `idempotency_key` is unique per logical email and is sent to the provider as an idempotency header where supported.
- **Retries:** exponential backoff with jitter at ≈30 s, 2 min, 10 min, 1 h, 6 h; maximum 6 attempts `[PROPOSED]`; permanent failures (invalid mailbox, policy rejection) go straight to `dead`.
- **Visibility:** `job_run` heartbeat each cycle; metrics/logs for oldest pending age, attempts, dead count; alert when oldest pending > 10 min or any `dead` row `[thresholds PROPOSED]`. Staff can inspect and retry rows (Administrator).
- **Hygiene:** `sent` rows scrubbed of payload/address after a retention period; `dead` purged by policy [OQ-09].
- **Deployment form** (Phase 4/7, undecided): either a one-process Compose service running the loop (with healthcheck from `job_run`) or a host timer. Both use the same command, so the choice is operational, not architectural.
- Bounce/complaint webhooks: not designed until the provider is known [OQ-03].

### 4.4 Upgrade path to Celery/Redis (when justified, [OQ-30])
Review triggers (PROPOSED): outbox oldest-pending p95 above 5 min at normal load; sustained volume the single worker cannot drain; a feature that needs scheduled/batched jobs (alerts, digests); multi-step job chains; need for worker autoscaling. Migration is mechanical because `OutboxProcessor` is a plain service: a Celery task would call the same function. No domain code changes, and the outbox remains the source of truth.

### 4.5 User-facing behaviour
Registration and reset screens state that email may take a few minutes, offer a throttled "resend", and never indicate whether an address is registered. If the queue is delayed the user is not told anything account-specific.

## 5. Authorisation
See `ROLE_PERMISSION_MATRIX.md`. Summary: DRF permission classes per endpoint; the `publishing.policy` service for transitions and separation of duties; object-level filtering for `/me/*`; 404 for non-public objects; Django Admin permissions mapped from the matrix with state fields read-only; DB triggers as the last line of defence.

### 5.1 Staff interface
Django Admin is the initial staff UI `[expected, IA still OPEN]`, mounted under `/staff/`, `noindex`, `X-Robots-Tag`, shorter sessions, no seeker login redirect loops. Optional network restriction and MFA are [OQ-16]. `is_staff` is derived from an active role assignment, never set manually. All transitions are admin actions that call services.

## 6. Application-level controls

| Area | Control |
|---|---|
| Input | server-side validation per VALIDATION_SPEC; unknown fields rejected; request body ≤1 MB; JSON only |
| Output | DRF serializers with explicit fields (no `__all__`); no stack traces; consistent error shape with `request_id` |
| XSS | React escaping; user content only as sanitised-Markdown HTML rendered by the server; no `dangerouslySetInnerHTML` on user data; strict CSP |
| SQLi | ORM / parameterised queries only; search via `websearch_to_tsquery`; no raw SQL concatenation |
| Open redirect | no redirect endpoint; `next` after login accepted only as a same-origin relative path matched against an allow-list of route patterns |
| Outbound links | https only; `rel="noopener noreferrer nofollow ugc"`; destination domain displayed; no server-side fetch (no SSRF surface in Release 1) |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| Uploads | none in Release 1 (D-15); no file endpoints exist |
| Enumeration | uniform responses for register, reset, resend; opaque 404 for non-public listings |
| Mass assignment | write serializers whitelist fields; `status`, `role`, `email_verified_at` never writable via public APIs |

### 6.1 Headers (set by the app; verified at the edge in Phase 7)
`Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on token pages); `Permissions-Policy` denying camera/microphone/geolocation/etc.; `Cross-Origin-Opener-Policy: same-origin`; HSTS `max-age≥31536000`. **Do not enable `includeSubDomains` or `preload` without approval** — the shared domain also serves The Granite Post and other subdomains could be affected [OQ-01, OQ-10]. Caching: `Cache-Control: no-store` on authenticated and auth responses; public pages cacheable with revalidation.

## 7. Data protection
| Control | Design |
|---|---|
| In transit | HTTPS at the edge; internal Docker network; PostgreSQL not published on the host |
| At rest | host disk encryption status unknown (to inspect); backups encrypted with a key stored apart from the backup |
| Secrets | environment files outside Git (`.env.example` only in repo); separate from Granite; rotation procedure documented in Phase 1; CI secret scanning |
| DB roles | `upnext_migrator` (DDL, used only during releases), `upnext_app` (DML; INSERT/SELECT only on `audit_event`), `upnext_jobs` (the system jobs' narrow rights), `upnext_readonly` (reporting/backup verification) |
| PII in logs | none: structured logs carry `request_id` and user uuid only; redaction filter for `password`, `token`, `email`, `Authorization`, `Cookie` |
| Data inventory | account (email, name, password hash), profile (qualification, skills, interests, locations, country), saved items, session metadata (truncated IP, UA family), audit (hashed IP). Purposes, minimisation and retention periods: [OQ-09]. The legal framework for Zimbabwe must be researched and reviewed before production; no legal conclusion is asserted here |

## 8. Rate limits (PROPOSED, OQ-17) — enforced in DRF with the database cache while Redis is deferred; an edge layer (Traefik) may add coarse limits in Phase 7 only with approval

| Endpoint group | Key | Limit |
|---|---|---|
| `POST /auth/login` | IP / email-hash / both | 20/15 min per IP; 5 failures/15 min per email-hash; 5 per (IP,email) |
| `POST /auth/register` | IP | 5/hour |
| email resend / reset request | account-or-email-hash and IP | 3/hour per address; 10/hour per IP; min 60 s gap |
| `POST /auth/password-reset/confirm`, `email/verify` | IP | 10/hour |
| anonymous read (`/opportunities*`) | IP | 120/min (burst 30) |
| authenticated `/me/*` writes | user | 60/min |
| staff transitions | user | 30/min |
Responses: `429 rate_limited` with `Retry-After`; counters keyed with a server-side pepper so raw emails are not stored. Note: a database cache is shared across API worker processes; a per-process in-memory cache must not be used for throttling.

## 9. Threat model (supersedes SECURITY.md list)

| ID | Threat | Asset | Mitigations | Verified by |
|---|---|---|---|---|
| TM-01 | Credential stuffing / brute force | accounts | Argon2id, throttles (§8), generic errors, breached-password denylist (local list), login auditing | auth throttle tests; load script |
| TM-02 | Account enumeration | accounts | uniform 202/401, dummy hashing, uniform timing work, opaque 404 | contract tests comparing responses/timing buckets |
| TM-03 | Broken object-level authorisation | profile, saved, sessions, drafts | `/me` scoping, per-object checks, 404 for hidden objects | cross-account regression suite |
| TM-04 | CSRF / login CSRF | all mutations | CSRF token + Origin check + SameSite=Lax + JSON-only | tests with/without token/origin |
| TM-05 | XSS (stored/reflected/DOM) | users, staff | sanitised Markdown, CSP with nonces, escaping, no inline handlers | sanitiser corpus; CSP check; Playwright |
| TM-06 | Malicious application/source URLs (phishing, `javascript:`) | seekers | https-only validation, editor review, destination domain shown, `rel` attrs | URL fuzz tests |
| TM-07 | SSRF | infrastructure | no server-side fetching of editor/user URLs in Release 1 | architecture test (no HTTP client import in `publishing`/`verification`) |
| TM-08 | Privilege escalation / SoD bypass (including one person using two accounts) | editorial integrity | matrix, policy service, DB triggers (author ≠ approver/verifier; publication requires another person's approval of the exact content hash), read-only Admin state fields, audited role grants and transitions, author/approver-pair report, optional MFA | generated matrix tests; trigger tests |
| TM-09 | Insider tampering with audit/history | trust | append-only privileges, hash-bound approvals, immutable versions | privilege tests against DB |
| TM-10 | Session theft / fixation | sessions | HttpOnly/Secure cookies, rotation, short staff lifetime, revoke on password change | session tests |
| TM-11 | Email token abuse (reuse, forwarding, guess) | accounts | single use, HMAC tokens, short TTL, no auto-login | token tests |
| TM-12 | Email abuse (spam relay, bombing a victim) | reputation | throttles, uniform responses, no user-controlled content in email body | throttle tests |
| TM-13 | Scraping / bulk harvesting | content | pagination caps, rate limits, robots policy; legitimate indexing allowed | abuse tests |
| TM-14 | Personal-data leakage (API, logs, errors, backups) | users | explicit serializers, redaction, no PII in logs, encrypted backups, least-privilege DB roles | log scrub tests; serializer snapshot tests |
| TM-15 | Dependency / supply-chain compromise | all | lockfiles, pinned digests, audit + secret scan in CI, non-root containers | CI gates |
| TM-16 | Collateral damage to The Granite Post | co-hosted service | isolation (§2), resource limits, no shared secrets/DB/networks, read-only inspection first | Phase 7 checklist |
| TM-17 | Denial of service (app or DB) | availability | rate limits, bounded page sizes/query costs, statement timeouts, container limits | load tests |
| TM-18 | Search-query abuse (expensive queries) | database | max query length, `websearch_to_tsquery`, statement timeout, bounded filters | search abuse tests |
| TM-19 | Outbox starvation / poison messages | email | attempts cap, dead-letter, SKIP LOCKED, monitoring | outbox tests |
| TM-20 | Clickjacking / UI redress | users | frame-ancestors none | header tests |

## 10. Monitoring and incident response (minimum)
Security events logged and alertable: repeated login failures, privileged role changes, status changes, `dead` emails, permission-denied spikes, migration/restore operations. Error tracking hosting [OQ-26]. An incident runbook (contacts, containment steps, credential rotation, user notification) is a Phase 6 deliverable.

## 11. Security gates (in addition to QUALITY-GATES)
No critical/high known defects; authorisation matrix tests green; SoD tests green; CSP and header tests green; dependency and secret scans clean; backup restore rehearsal passed; threat model reviewed against the built system before Phase 7.
