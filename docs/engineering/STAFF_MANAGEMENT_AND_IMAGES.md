# Staff management and listing images (D-58) — DRAFT

Status: DRAFT for owner review. Decision: D-58 in `docs/governance/DECISION_REGISTER.md`. Branch `ccr-ebb19828-vzqgji`. Screenshots: `docs/design/staff-team-and-images/`. Nothing is deployed; the production VPS, Traefik and The Granite Post are untouched.

## 1. What existed and what was missing (audit before coding)

| Area | Existing at the start | Missing |
| --- | --- | --- |
| Roles | Three registry roles (Contributor, Editor, Administrator), additive `StaffRoleAssignment` rows (revoked, never deleted), permission codes in `access/registry.py`; no Publisher role (D-23); no separate Reviewer/Verifier role: Editors review and verify, never their own work (D-18, D-22) | Nothing to add; the role set is preserved |
| Staff accounts | `create_staff_user` (development bootstrap), `manage_staff_role` (grant/revoke from the server), `reset_staff_mfa`; read-only "Users" and "Staff roles" registers in the workspace | Any UI or API to invite, edit, change roles, suspend, reactivate, remove; any invitation flow; any staff profile page; counts, filters, sorting |
| Account status | `pending_verification`, `active`, `restricted`, `suspended`, `deactivated`; suspended accounts cannot authenticate (`is_active`) | A way to set them from the product, with session revocation and notice |
| Sessions | `UserSession` records, `revoke_sessions` | Revocation by an Administrator |
| Audit | Append-only `AuditEvent` (database triggers refuse UPDATE and DELETE), workflow `PublishingEvent`s, an audit register for `audit.read_all` | Staff-lifecycle events; per-person activity |
| E-mail | Branded template system (`emailkit`, `content`), outbox, single-use `AuthToken`s | Invitation and account-change messages; a staff-invitation token purpose |
| Images | None. No `ImageField`, no media storage, no upload endpoint, no editor control; D-56 recorded images as "not built"; the sharing preview said so | Everything: storage, validation, API, editor UI, public rendering, metadata |
| Storage | Only the database; containers have no persistent file area besides `pgdata` and `backups` | A persistent media location |

## 2. Staff management

* **Pages:** `/workspace/team` (summary cards, search, role and status filters, sortable columns, paging, compact table that becomes cards below 768 px), `/workspace/team/new` (invite), `/workspace/team/<id>` (profile: role and permissions, listing work, sessions, audit activity, only the actions that person may take). `/accept-invitation` is public and `noindex`. Loading skeletons exist for each route.
* **API:** `GET/POST /api/v1/staff/team`, `GET/PATCH /staff/team/{id}`, `GET /staff/team/{id}/activity`, `POST /staff/team/{id}/actions/{change-role|suspend|reactivate|remove|reinstate|resend-invitation|send-recovery|revoke-sessions}`, `POST /api/v1/auth/staff-invitation/accept`. Documented in `openapi.yaml`.
* **Who:** Administrators only (`user.status.change`, `user.role.grant`, `user.role.revoke`), after the second step. The service checks the permission again; the views do not trust the buttons. A seeker's id is a 404. Bodies are read field by field (an unknown field is a 400), so there is no mass assignment. Only the display name is editable; e-mail change stays a separate, delivery-gated flow.
* **Invitation:** creates a `pending_verification` account with an unusable password and the chosen role recorded (no authority until the person accepts; `is_staff` needs an active account). The e-mailed link is a keyed-MAC token (`staff_invitation`, 72 hours, single use, selector only at rest). Resending replaces the link and is limited to one per minute. Ordinary e-mail verification and password reset cannot activate an invited person. The person chooses their password; nothing but the link is sent. Two-step enrolment happens at first sign-in as for every staff member.
* **Protection rules (server side, in one locked transaction):** nobody changes, suspends or removes themselves; the last active Administrator is protected; removal deactivates and revokes roles, sessions and links but keeps the person, their listings, reviews, verifications and audit rows (the foreign keys are `PROTECT`); reasons are required for consequential changes; role changes never alter the separation-of-duties rules.
* **Audit:** `staff.invited`, `invitation_resent`, `invitation_accepted`, `role_changed`, `suspended`, `reactivated`, `removed`, `reinstated`, `sessions_revoked`, `recovery_sent`, `profile_updated`, with actor, target, request id and the changed facts; never an e-mail address, password or token. The profile page lists them; the audit register stays restricted to `audit.read_all`.
* **E-mail:** `staff_invitation` and `staff_account_change` use the existing branded builders and are covered by the design tests for every kind and variant.

## 3. Listing images

* **Fields** (migration `opportunities.0009`, additive, hashed only when set): `featured_image`, `featured_image_alt`, `social_image`. The social image falls back to the featured one.
* **Upload** `POST /api/v1/staff/images` (multipart, staff with draft permission, 30 per 10 minutes). The decoded content decides the type (JPEG, PNG, WebP). Limits: 5 MB, 64 x 36 minimum (D-64), 8000 pixels a side and 40 megapixels maximum. The picture is re-encoded: orientation applied, transparency flattened onto white, first frame only, scaled to 1600 pixels, all metadata removed, stored as JPEG under `listings/<32 hex>.jpg`. Nothing the client chose reaches the file system.
* **Attaching** is the ordinary draft save with the generated name; names are re-validated and must exist. Replacing or removing an image audits `opportunity.image_changed` and deletes the file once nothing refers to it (a published revision's file is kept). `purge_listing_images` (and the worker's housekeeping) removes uploads never attached after a day. Employers cannot set images (`staff_only_field`).
* **Storage:** `MEDIA_ROOT` (`UPNEXT_MEDIA_ROOT`); in production the named volume `upnext-prod-media` at `/srv/media` (read-write for `api` and `worker`, read-only for the proxy). The proxy serves only generated names, with `nosniff`, a sandboxing CSP and a long cache; everything else under `/media/` is 404, and only the upload path accepts a body above 1 MB (6 MB).
* **Public output:** the public API returns `image: {featured, social, alt}` as absolute URLs (null when none). The job page shows the featured picture; cards show a small thumbnail; `generateMetadata` sets Open Graph and Twitter images from the social image, else the featured one, only when the address is https, else the standard UPNEXT image. No employer logo is ever invented and a picture never changes a verification level.
* **Editor:** a Featured image row in the main form (16:9 guidance, drag and drop, file picker that also opens the Android gallery, progress, preview, replace, remove with confirmation, optional description) and a sharing image and live sharing preview under Media & SEO.

## 4. Decisions needed and known limits

1. **Backups:** media files are not part of the database backup, and there is still no off-server target (B-07). Losing the volume loses the pictures, not the listings.
2. **Malware scanning:** none is run; re-encoding from decoded pixels removes embedded payloads and metadata, and files are served as inert JPEG with a sandboxing CSP.
3. **OQ-13:** a second Administrator's confirmation before granting the Administrator role is not built; the grant is audited and the person is told.
4. **Open drafts of a removed person** stay with their author (only the author may edit or submit). An Administrator can see them; reassigning drafts is not built.
5. **Reviewer/Verifier:** the application has no such role; Editors review and verify under the existing independence rules. None was invented.
6. The CI browser suite does not yet drive the new flows; they were exercised locally (screenshots) and by unit and API tests.

## 5. Tests

Backend `tests/test_staff_team.py` (26) and `tests/test_listing_images.py` (41), compose and proxy assertions in `tests/test_production_compose.py`, OpenAPI contract tests; frontend `tests/unit/team-and-images.test.tsx`. Traceability: R-56, R-57, STAFFTEAM-01…08, IMG-01…08.
