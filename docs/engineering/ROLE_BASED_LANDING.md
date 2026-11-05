# Role-based landing and the employer dashboard (D-70) — DRAFT

Status: DRAFT, awaiting owner approval. Nothing is merged or deployed.

## Where each account lands
`accounts/home.py::dashboard_path` is the single answer, read from the database on every call and returned as `home_path` by `/me`, `/auth/login` and `/auth/login/two-step`; the Google callback redirects to it when no safe return address was given.

| Authority (current, unrevoked) | Lands on |
|---|---|
| any staff role (contributor, editor, administrator) | `/workspace` (second step first, for staff) |
| else an employer membership | `/employer` |
| else | `/dashboard` |

An account with staff and employer authority lands in the workspace and reaches the other dashboard from the account menu. There is no Reviewer role; reviewing is an Editor permission. The browser never sends or decides a role: the login serializer refuses unknown fields. Suspended, restricted, deactivated and unverified accounts get no session, so no dashboard.

## Return addresses
`lib/safe-next.ts`: same-origin allow-listed paths only; `landing()` keeps a safe address only where the account may use that area (workspace for staff; employer pages not for plain jobseekers), never `/sign-in` (no loops). `/sign-in`, `/sign-in/two-step` and `/register` send a signed-in person to `landing()`. Non-staff on `/workspace` go to their own dashboard. Visitors on `/employer/*` get an HTTP 307 to sign in. Verification and invitation links lead to plain `/sign-in`.

## Employer dashboard
Routes: `/employer`, `/employer/opportunities`, `/employer/listings/new`, `/employer/listings/[id]` (+ `/preview`), `/employer/analytics`, `/employer/organisations/[id]/profile`, `/employer/settings`, `/employer/claim`. Active organisation: remembered in the `upnext_org` cookie (a preference only; every API call resolves the organisation through the caller's memberships). API additions: `GET employer/organisations/{id}/dashboard`, filtered/paged `.../listings`, `POST employer/listings/{id}/duplicate`, `GET .../preview`, `GET employer/categories`, `POST employer/images`.

Analytics reuse `employers.staff_analytics` (windows, zero-filled series, per-listing sums). Views are page views per tab session; clicks are clicks on Apply; unique visitors and applications are not measured.

## Gaps and decisions needed
No migration was needed. Not built: organisation logo (no model), Team Members (no employer-managed team), employer-editable slug/SEO/Open Graph text (D-56 keeps it staff-only), an "approved" e-mail (existing design announces published/returned), applications tracking (UPNEXT never receives applications). E-mail delivery is unverified (B-01), so no notification is sent.
