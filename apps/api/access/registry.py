"""Role and permission registry (ROLE_PERMISSION_MATRIX.md sections 4-5).

Permissions are string codes; a role is just a named set of codes. Guards ask "does this actor hold
code X?" and never test role names, so a future role is a registry entry plus tests (D-23).
The initial implementation has exactly three staff roles — there is deliberately no Publisher role.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType


class Role(StrEnum):
    CONTRIBUTOR = "contributor"
    EDITOR = "editor"
    ADMINISTRATOR = "administrator"


class Permission(StrEnum):
    OPP_READ_PUBLIC = "opp.read_public"
    OPP_DRAFT_CREATE = "opp.draft.create"
    OPP_DRAFT_EDIT_OWN = "opp.draft.edit_own"
    OPP_SUBMIT = "opp.submit"
    OPP_DISCARD_OWN = "opp.discard_own"
    OPP_AMEND = "opp.amend"
    OPP_REVIEW_APPROVE = "opp.review.approve"
    OPP_REVIEW_REJECT = "opp.review.reject"
    OPP_REVIEW_RETURN = "opp.review.return"
    OPP_VERIFY_RECORD = "opp.verify.record"
    OPP_PUBLISH = "opp.publish"
    OPP_PUBLISH_DIRECT = "opp.publish_direct"
    OPP_SLUG_CHANGE = "opp.slug_change"
    OPP_SCHEDULE = "opp.schedule"
    OPP_TAKEDOWN = "opp.takedown"
    OPP_WITHDRAW = "opp.withdraw"
    OPP_WITHDRAW_OWN = "opp.withdraw_own"
    OPP_EXPIRE = "opp.expire"
    OPP_ARCHIVE = "opp.archive"
    ORG_CREATE = "org.create"
    ORG_EDIT = "org.edit"
    EMPLOYER_REVIEW = "employer.review"
    EMPLOYER_VERIFICATION_REVOKE = "employer.verification.revoke"
    TAXONOMY_MANAGE = "taxonomy.manage"
    USER_ROLE_GRANT = "user.role.grant"
    USER_ROLE_REVOKE = "user.role.revoke"
    USER_STATUS_CHANGE = "user.status.change"
    AUDIT_READ_ALL = "audit.read_all"
    REPORT_READ = "report.read"
    REPORT_TRIAGE = "report.triage"
    REPORT_RESOLVE = "report.resolve"
    REPORT_RESOLVE_ESCALATED = "report.resolve_escalated"
    SETTINGS_MANAGE = "settings.manage"
    ME_PROFILE = "me.profile"
    ME_SAVED = "me.saved"
    ME_SESSIONS = "me.sessions"
    ME_DELETE = "me.delete"


P = Permission

# Held by everyone, including anonymous visitors.
PUBLIC_PERMISSIONS: frozenset[str] = frozenset({P.OPP_READ_PUBLIC})
# Held by every authenticated, active account (seekers and staff alike).
ACCOUNT_PERMISSIONS: frozenset[str] = frozenset({P.ME_PROFILE, P.ME_SAVED, P.ME_SESSIONS, P.ME_DELETE})

_EDITOR_CODES = frozenset(
    {
        # Direct staff publishing (D-46): an Editor or Administrator writes, previews and publishes a
        # staff-created listing without a second person. Contributors and employers never hold
        # OPP_PUBLISH_DIRECT.
        P.OPP_DRAFT_CREATE,
        P.OPP_DRAFT_EDIT_OWN,
        P.OPP_SUBMIT,
        P.OPP_DISCARD_OWN,
        P.OPP_AMEND,
        P.OPP_PUBLISH_DIRECT,
        P.OPP_SLUG_CHANGE,
        P.OPP_REVIEW_APPROVE,
        P.OPP_REVIEW_REJECT,
        P.OPP_REVIEW_RETURN,
        P.OPP_VERIFY_RECORD,
        P.OPP_PUBLISH,
        P.OPP_SCHEDULE,
        P.OPP_TAKEDOWN,
        P.OPP_WITHDRAW,
        P.OPP_EXPIRE,
        P.OPP_ARCHIVE,
        P.ORG_CREATE,
        P.ORG_EDIT,
        P.EMPLOYER_REVIEW,
        P.REPORT_READ,
        P.REPORT_TRIAGE,
        P.REPORT_RESOLVE,
    }
)

# What a verified employer's member may do through the publishing service (Phase 6A, D-35). This is *not* a
# staff role: it is not in DEFAULT_REGISTRY, grants no admin access, and holds only author actions. Review,
# verification and publication codes are deliberately absent (D-18, D-22); a test pins that.
EMPLOYER_AUTHOR_PERMISSIONS: frozenset[str] = frozenset(
    {
        P.OPP_DRAFT_CREATE,
        P.OPP_DRAFT_EDIT_OWN,
        P.OPP_SUBMIT,
        P.OPP_DISCARD_OWN,
        P.OPP_AMEND,
        P.OPP_WITHDRAW_OWN,
    }
)
# Categories an employer may post in (they are issuers of vacancies and placements).
EMPLOYER_CATEGORIES: frozenset[str] = frozenset({"jobs", "internships", "graduate-programmes"})

_DEFAULT_GRANTS: Mapping[str, frozenset[str]] = MappingProxyType(
    {
        Role.CONTRIBUTOR: frozenset(
            {
                P.OPP_DRAFT_CREATE,
                P.OPP_DRAFT_EDIT_OWN,
                P.OPP_SUBMIT,
                P.OPP_DISCARD_OWN,
                P.OPP_AMEND,
                P.ORG_CREATE,
            }
        ),
        Role.EDITOR: _EDITOR_CODES,
        Role.ADMINISTRATOR: _EDITOR_CODES
        | frozenset(
            {
                P.TAXONOMY_MANAGE,
                P.USER_ROLE_GRANT,
                P.USER_ROLE_REVOKE,
                P.USER_STATUS_CHANGE,
                P.AUDIT_READ_ALL,
                P.SETTINGS_MANAGE,
                P.EMPLOYER_VERIFICATION_REVOKE,
                P.REPORT_RESOLVE_ESCALATED,
            }
        ),
    }
)


@dataclass(frozen=True)
class PermissionRegistry:
    """Immutable mapping role name -> permission codes."""

    grants: Mapping[str, frozenset[str]]

    @property
    def roles(self) -> frozenset[str]:
        return frozenset(self.grants)

    def permissions_for(self, roles: Iterable[str], *, authenticated: bool = True) -> frozenset[str]:
        codes: set[str] = set(PUBLIC_PERMISSIONS)
        if authenticated:
            codes |= ACCOUNT_PERMISSIONS
        for role in roles:
            codes |= self.grants.get(str(role), frozenset())
        return frozenset(codes)

    def has(self, roles: Iterable[str], code: str, *, authenticated: bool = True) -> bool:
        return str(code) in self.permissions_for(roles, authenticated=authenticated)

    def with_role(self, name: str, codes: Iterable[str]) -> PermissionRegistry:
        """Return a new registry that also defines `name` (the extension point for future roles)."""
        merged = dict(self.grants)
        merged[str(name)] = frozenset(str(c) for c in codes)
        return PermissionRegistry(MappingProxyType(merged))


DEFAULT_REGISTRY = PermissionRegistry(_DEFAULT_GRANTS)
