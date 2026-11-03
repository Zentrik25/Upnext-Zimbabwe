# ADR-0019: Phase 3 — accounts, saved opportunities and staff security

- **Status:** ACCEPTED as an implementation approach (Phase 3 authorised by the owner, 2026-10-17, D-27). The provisional defaults it relies on (P3-01…P3-08 in the decision register) are **not** owner decisions.
- **Decision register:** D-11, D-27; P3-01…P3-08
- **Specifications:** `SECURITY_ARCHITECTURE.md` §3, §4, §8; `ERD.md` §3.1, §3.5, §3.9; `openapi.yaml`

## Context
After the catalogue and the editorial CMS, people need accounts to save opportunities, and the staff site, which can publish public content, needs more than a password.

## Decision
1. **One identity table, cookie sessions, no tokens in JavaScript.** Django database sessions behind the same-origin `/api/v1`, CSRF on every unsafe request. Passwords are NFKC-normalised and hashed with Argon2id. Sign-in, registration and reset answer the same way whether or not an address exists, and the failing paths spend comparable work.
2. **E-mail tokens carry no stored secret.** The database holds only a token row (selector, purpose, expiry, used/invalidated); the emailed value is `selector.HMAC(key, selector|purpose|user|expiry)`. A newer token replaces older ones; a used or expired one fails with one generic code. The same construction derives the staff TOTP secret from a nonce, so no recoverable secret sits in the database.
3. **Transactional outbox, worker outside the request.** State changes and their e-mails commit together; `process_email_outbox` claims rows with `SKIP LOCKED`, retries with back-off, dead-letters after six attempts, recovers stuck rows, and scrubs payloads after sending. `EmailSender` is a port; no provider is chosen (OQ-03).
4. **Saved opportunities** are a unique (user, opportunity) table with availability reported from the listing's status. Public endpoints stay anonymous and cacheable; the web asks `GET /me/saved?ids=…` (an additive contract change) to mark save buttons.
5. **Sessions:** one middleware applies idle and absolute limits (shorter for anyone holding a staff role) and keeps session records for the "where you are signed in" list. The record stores the session key rather than a hash (deviation from the ERD draft; same value Django already stores) so revocation does not scan every session.
6. **Staff two-step verification** is enforced by a gate in front of `/staff/`, keyed on a flag in the session, so a password-only session created through the API cannot reach the staff site. TOTP is implemented in-house (about 20 lines, RFC 6238 test vectors) to avoid a dependency. Recovery codes are stored as keyed hashes and work once. Reset is a privileged, audited command.
7. **Frontend:** server-rendered pages read the session by forwarding the browser's cookies to the internal API; forms are client components calling the same-origin API. Confirming an e-mail address or a reset link is an explicit user action so link scanners cannot consume the token; tokens are removed from the visible address after load and the pages send `Referrer-Policy: no-referrer`. Return addresses after sign-in are matched against an allow-list of routes.
8. **Staff site CSP:** `script-src 'self'` (no inline script, no eval), `style-src 'self' 'unsafe-inline'` because Django Admin sets inline styles, `frame-ancestors 'none'`.

## Consequences
- New runtime service (`worker`) in the Compose stacks; CI runs it with a file mail spool.
- The Playwright suites read mail and demo two-step codes through `manage.py` commands in the worker container (`E2E_EXEC`), guarded by `UPNEXT_DEMO_TOOLS`.
- Rotating `UPNEXT_TOKEN_KEY` invalidates outstanding links and resets every staff two-step device.
- The staff site refuses to open without a second step unless `UPNEXT_STAFF_MFA_REQUIRED=false`, which is for tests and throwaway stacks only.

## Alternatives considered
Argon2 with a third-party TOTP package (rejected: avoidable dependency for a small, well-specified algorithm); JWT or tokens in `localStorage` (rejected: SECURITY_ARCHITECTURE §3); sending mail inside the request (rejected: timing and reliability); signing in automatically from the confirmation link (rejected: fixation and forwarding risk); storing the TOTP secret encrypted (rejected: needs a cryptography dependency and a key anyway, and derivation stores nothing).
