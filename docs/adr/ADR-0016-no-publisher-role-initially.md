# ADR-0016: No Publisher role in the initial implementation

- **Status:** ACCEPTED (owner approval 2026-10-17). Refines ADR-0011.
- **Date:** 2026-10-17
- **Decision register:** D-23 (resolves OQ-32)

## Context
D-18 gave Editors and Administrators approval and publication authority, making a publish-only role largely redundant.

## Decision
1. The initial role set is **Contributor, Editor, Administrator** (plus Seeker accounts and the System actor). There is no `publisher` role value, permission set or UI.
2. **Permissions remain extensible:** permissions are codes; roles are sets of codes in a single registry; guards test codes and identity rules, never role names. A future role (publisher, moderator, employer publisher, …) is a registry entry plus tests, with no guard changes.
3. The OpenAPI `StaffRole` enum lists only the three roles; a later role is an additive, versioned change.

## Consequences
- Fewer roles to administer and test; simpler staff UI.
- If a publish-only role is later wanted, it is a small, planned addition (test PERM-02 demonstrates the mechanism).

## Alternatives considered
Keep an optional Publisher role (rejected by owner).
