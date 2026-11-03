# Trusted devices for two-step verification (D-59) — DRAFT

Status: DRAFT for owner review. Decision: D-59 in `docs/governance/DECISION_REGISTER.md`. Nothing is deployed.

## 1. Audit of the existing flow (before the change)

| Part | What existed |
| --- | --- |
| Second step | TOTP and single-use recovery codes (`accounts/mfa.py`), failure limit of 5 per 15 minutes, secret derived and never stored |
| Staff | After the password, the staff API refuses everything until `/api/v1/staff/two-step` sets a flag in the **server-side session** (`core/staff_mfa.py`); the flag was cleared at every sign-in, so every login asked for a code |
| Other accounts | Optional two-step; a pending record in the server session until a code is entered (`accounts/login_challenge.py`) |
| Sessions | Staff 30 minutes idle and 8 hours absolute, seekers 7 and 30 days (`core/middleware.py`); revocable (`UserSession`) |
| Missing | Any memory of a device; any way to skip the code safely |

The new feature reuses all of it: a trusted device only decides whether the *existing* challenge is asked, and the *existing* gate still decides what a staff session may do.

## 2. Behaviour

* **Trust:** unticked-by-default "Trust this device for 30 days" next to the code box (sign-in step and staff step). The server creates a `TrustedDevice` row (hash of a random value, browser label, network prefix, trusted / last used / last code / expiry) and sets an HttpOnly, SameSite=Lax, path `/` cookie (Secure when cookies are secure).
* **Skip:** only after a correct password, only when the cookie names a live device of that person within its limits (section 3).
* **Staff:** the proof of the last real code travels with the device (`last_mfa_at`) into the session (`mfa_at`). The gate accepts the session only while that proof is at most 24 hours old. Skipping never refreshes it.
* **Never client side:** no local storage, fingerprint or readable flag is used or believed; the cookie is useless without the matching server row and the password.

## 3. When a code is asked again

New or unknown browser · another person's cookie · past 30 days · revoked · the cookie shows up in a different browser family or system (device revoked, security audit) · three or more failed attempts just before · staff: last proved code older than 24 hours · password change or reset · enrolling, disabling, new recovery codes or reset of two-step verification · an Administrator's "Forget trusted devices" · suspension, removal and role change.

## 4. Where it is managed

Account → Security → Trusted devices (list, forget one, forget all). Administrators: Staff management → a person → "Forget trusted devices". Logout and session expiry end the session; the trusted cookie remains, so the next password sign-in skips the code only within the limits above.

## 5. Limits

No location or impossible-travel detection; no e-mail when a device is trusted; no "forget on sign-out" option. A browser-family change is the only device-level signal.

## 6. Tests

`apps/api/tests/test_trusted_devices.py` (31) and `apps/web/tests/unit/trusted-devices.test.tsx`; traceability R-58, TRUST-01…06.
