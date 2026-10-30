# Staff access runbook — DRAFT

Status: DRAFT for owner review (OQ-13 and OQ-16 are open). Commands run in the `api` or `worker` container of the deployed stack by a person with server access. Every action below is audited; none needs the database to be edited by hand.

## 1. Principles
- Staff sign in on the public sign-in page and open the staff workspace at `/workspace` (D-46; there is no Django Admin), then pass a second step: a 6-digit code from an authenticator app, or an unused recovery code. The second step is required in production and cannot be switched off there.
- Roles are additive and revoked, never deleted. There is no Publisher role (D-23). Nobody approves their own submission (D-18, D-22).
- Staff sessions end after 30 minutes idle or 8 hours in all.

## 2. Onboarding a person
1. They register on the public site and confirm their e-mail address (or, for the first administrator only, `manage.py create_staff_user --email … --display-name … --role administrator` with `UPNEXT_BOOTSTRAP_PASSWORD` set for that one command).
2. An Administrator grants roles: `manage.py manage_staff_role grant --email … --role contributor|editor|administrator --reason "…" --by <administrator e-mail>`.
3. First visit to `/workspace`: sign in, then set up two-step verification: add the shown setup key to an authenticator app, enter the code, and **store the eight recovery codes** (shown once).
4. Grant the minimum role. A second administrator should exist before the first is relied on.

## 3. Lost device
1. The person signs in with a recovery code instead of a code (each works once). Then ask an Administrator to reset the device so they can enrol a new one.
2. Reset: `manage.py reset_staff_mfa --email … --reason "…" --by <other administrator e-mail>`. It removes the device and ends their sessions; they enrol again at the next sign-in. An administrator cannot reset themselves.

## 4. Sole administrator locked out (break-glass)
Someone with shell access to the server runs `manage.py reset_staff_mfa --email … --reason "…"` without `--by`. It is recorded as a system action. Treat it as an incident: record who did it and why, and review the audit log. After re-enrolling, grant a second administrator.

## 5. Offboarding
1. Revoke every role: `manage.py manage_staff_role revoke --email … --role … --reason "…" --by …`. Staff roles are revoked, not deleted, so history stays attributable.
2. Reset their second step (section 3) if the device may be in someone else's hands, which also ends their sessions.
3. If the person also asked to delete their account, the deletion proceeds only after the roles are gone (the web UI tells them an administrator must remove staff access first).

## 6. Suspected compromise
Change the person's password by asking them to use "Forgot your password" (this signs out every session), reset their second step, and review the audit log in the workspace (`/workspace/records/audit`, Administrators) for `auth.*`, `staff.mfa_*`, `account.*` and editorial actions by that account. If a key may have leaked, rotate `UPNEXT_TOKEN_KEY` (this resets every staff device and invalidates e-mail links) and the secret key (this signs out everyone).

## 7. Not covered
Network restriction of `/workspace` and `/api/v1/staff/`, WebAuthn, second-administrator confirmation for granting administrator (OQ-13), and alerting who is told about audit events (Phase 6).
