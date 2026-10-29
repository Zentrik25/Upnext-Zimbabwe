# Staff API — `/api/v1/staff/` (D-46) — DRAFT

Status: DRAFT. Used only by the staff console at `/staff/`. Not part of the public OpenAPI document (`docs/engineering/openapi/openapi.yaml`); the views are excluded from the generated schema on purpose. Same conventions as the public API: session cookie, CSRF header on unsafe methods, the standard `{error:{code,message,request_id,fields?}}` body, `row_version` for optimistic concurrency, uncacheable responses.

**Access.** Every endpoint needs a signed-in, active account with a staff role. Unless `UPNEXT_STAFF_MFA_REQUIRED` is off, every endpoint except `session`, `mfa/enrolment` and `mfa/verify` answers `403 mfa_required` until the session passed two-step verification. Anonymous callers get `401`; accounts without a staff role get `403`. Permissions are registry codes (`access/registry.py`); the console only hides what the server would refuse.

| Method and path | Permission | Purpose |
|---|---|---|
| `GET session` | staff | Who is signed in, roles, permission codes, two-step state, session limits |
| `GET/POST mfa/enrolment` | staff | Setup key and URI; confirm the first code, returns recovery codes once |
| `POST mfa/verify` | staff | Authenticator or recovery code |
| `GET reference`, `GET categories/{code}/schema` | staff | Pickers, enums, category detail schema and which shared fields apply |
| `POST preview` | `opp.draft.edit_own` | Public Markdown renderer for the editor preview |
| `GET overview` | staff | Counts and recent activity from live rows |
| `GET opportunities` | staff | `view` (all, drafts, mine, review, ready, employer, published, expired, withdrawn, archived), `q`, `category`, `status`, `organisation`, `sort`, `dir`, `page`, `page_size` |
| `POST opportunities/new` | `opp.draft.create` | Create a draft `{category, content}` |
| `GET/PATCH opportunities/{id}` | staff | Detail with content, sources, verification, reviews, history; save a draft `{row_version, content}` |
| `POST opportunities/{id}/{action}` | per service | submit, approve, reject, return, publish, **publish_direct**, withdraw, expire, takedown, archive, discard, reopen, amend, verify |
| `GET/POST organisations`, `GET/PATCH organisations/{id}` | `org.create` / `org.edit` | Organisations; `verified` is true only with an active employer verification |
| `GET claims`, `POST claims/{id}/decision` | `employer.review` | Employer organisation claims |
| `GET reports`, `GET reports/{id}`, `POST reports/{id}/{action}` | `report.read` + action codes | Public reports: investigate, note, escalate, resolve, dismiss, reopen, listing |
| `GET users`, `POST users/{id}/{grant|revoke|reset-two-step}` | `user.role.grant` | Staff accounts; Contributor and Editor only; reason 10 to 500 characters; never on oneself |
| `GET audit` | `audit.read_all` | Filter by `action` prefix, `severity`, `object_type`, `object`, `actor` |
| `GET settings` | `settings.manage` | Read-only, no secrets |

**Direct publication** (`publish_direct`) needs `opp.publish_direct`, the caller must be the author of the open draft, the checklist (`source_reviewed`, `duplicates_reviewed`, `content_matches_source`) must be all true, and the listing must not be owned by an employer (`403 separation_of_duties`). All publication validations apply; a deliberate duplicate needs `duplicate_acknowledgement`.

Visibility mirrors the former Django Admin: Administrators see every listing; Editors do not see other people's never-published drafts; Contributors see listings they took part in. An Administrator opening someone else's draft writes an `opportunity.view_draft` audit event.
