# ADR-0002: Editorial separation of duties

- **Status:** ACCEPTED (owner approval recorded as D-09 on 2026-10-17). Document status of this record: DRAFT until the Phase 0 package is approved.
- **Date:** 2026-10-17
- **Decision register:** D-09

## Context
Listing accuracy and trust are UPNEXT's core promise. The specification proposed "administrators only" publishing, which would let one person draft, approve and publish.

## Decision
Roles are additive staff assignments: **Contributor** (creates and edits own drafts, submits, opens amendments), **Editor** (approves/rejects submissions they did not author; records verification), **Publisher** (publishes approved listings; withdraws, expires, archives, takes down), **Administrator** (manages users, roles, taxonomies and settings).
- Guards compare **user identity** per listing: the author of any version in the chain cannot approve, reject, return, verify or publish it; the approving Editor cannot also publish (strict reading specified until OQ-12 is decided).
- **No role implies another.** Administrators have no editorial transition by virtue of the role; they may hold editorial roles only through audited grants, and then the same guards apply. Role changes are audited (`privileged`) and cannot be performed silently.
- Enforcement is layered: API permissions → `publishing.policy` service → DB triggers; Django Admin shows state fields read-only and routes actions through services.
- Full definitions: `ROLE_PERMISSION_MATRIX.md`, `EDITORIAL_WORKFLOW.md`.

## Consequences
- Each listing needs at least three distinct people (author, approver, publisher) under the strict reading; a smaller team cannot publish. This is a staffing blocker to resolve before launch, not a coding workaround (OQ-12 may relax approver ≠ publisher).
- Break-glass access, self-grant controls and single-admin bootstrap remain OPEN (OQ-13).
- Takedown is intentionally a one-person Publisher action (safe direction).

## Alternatives considered
Administrators-only workflow (rejected: no separation); administrators as super-users (rejected: silent bypass); runtime toggles to disable guards (rejected).
