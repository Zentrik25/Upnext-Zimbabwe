"""Pure separation-of-duties policy (EDITORIAL_WORKFLOW.md, ADR-0011, ADR-0015).

These functions decide whether an actor may perform a review/publication action on a revision, from
plain facts. They contain no database access so they can be (a) unit-tested exhaustively and (b)
called by the Phase 2 publishing service *inside* its transaction after locking the listing row —
the service must pass facts it has just read under that lock, never cached ones.

Rules (D-18, D-22):
* Nobody approves, rejects, returns or verifies a revision they authored or submitted.
* Publication requires that a *different* authorised person approved the *exact* revision (same
  content hash). Who publishes — approver, author or a third person — does not matter.
"""

from __future__ import annotations

from collections.abc import Collection, Hashable
from dataclasses import dataclass
from enum import StrEnum

from .registry import DEFAULT_REGISTRY, Permission, PermissionRegistry


class Reason(StrEnum):
    ALLOWED = "allowed"
    PERMISSION_DENIED = "permission_denied"
    SEPARATION_OF_DUTIES = "separation_of_duties"
    INVALID_TRANSITION = "invalid_transition"
    APPROVAL_STALE = "approval_stale"


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: Reason

    def __bool__(self) -> bool:
        return self.allowed


ALLOW = Decision(True, Reason.ALLOWED)


def _deny(reason: Reason) -> Decision:
    return Decision(False, reason)


@dataclass(frozen=True)
class Actor:
    user_id: Hashable
    roles: frozenset[str]


@dataclass(frozen=True)
class RevisionFacts:
    state: str
    # Every user who authored any version in the review chain, plus the submitter.
    chain_author_ids: frozenset[Hashable]
    content_hash: bytes
    approved_by: Hashable | None = None
    approved_hash: bytes | None = None


def _check(
    actor: Actor,
    code: Permission,
    registry: PermissionRegistry,
) -> Decision | None:
    if not registry.has(actor.roles, code):
        return _deny(Reason.PERMISSION_DENIED)
    return None


def _review_action(
    actor: Actor,
    facts: RevisionFacts,
    code: Permission,
    allowed_states: Collection[str],
    registry: PermissionRegistry,
) -> Decision:
    denied = _check(actor, code, registry)
    if denied is not None:  # NB: a denied Decision is falsy, so test identity, not truthiness
        return denied
    if facts.state not in allowed_states:
        return _deny(Reason.INVALID_TRANSITION)
    if actor.user_id in facts.chain_author_ids:
        return _deny(Reason.SEPARATION_OF_DUTIES)
    return ALLOW


def can_approve(
    actor: Actor, facts: RevisionFacts, registry: PermissionRegistry = DEFAULT_REGISTRY
) -> Decision:
    return _review_action(actor, facts, Permission.OPP_REVIEW_APPROVE, {"in_review"}, registry)


def can_reject(
    actor: Actor, facts: RevisionFacts, registry: PermissionRegistry = DEFAULT_REGISTRY
) -> Decision:
    return _review_action(actor, facts, Permission.OPP_REVIEW_REJECT, {"in_review"}, registry)


def can_return(
    actor: Actor, facts: RevisionFacts, registry: PermissionRegistry = DEFAULT_REGISTRY
) -> Decision:
    return _review_action(actor, facts, Permission.OPP_REVIEW_RETURN, {"approved"}, registry)


def can_verify(
    actor: Actor, facts: RevisionFacts, registry: PermissionRegistry = DEFAULT_REGISTRY
) -> Decision:
    return _review_action(
        actor,
        facts,
        Permission.OPP_VERIFY_RECORD,
        {"in_review", "approved", "published"},
        registry,
    )


def can_publish(
    actor: Actor, facts: RevisionFacts, registry: PermissionRegistry = DEFAULT_REGISTRY
) -> Decision:
    """Publication needs another person's approval of this exact revision (D-22)."""
    denied = _check(actor, Permission.OPP_PUBLISH, registry)
    if denied is not None:  # NB: a denied Decision is falsy, so test identity, not truthiness
        return denied
    if facts.state != "approved" or facts.approved_by is None or facts.approved_hash is None:
        return _deny(Reason.INVALID_TRANSITION)
    if facts.approved_by in facts.chain_author_ids:
        # Self-approval can never authorise publication, whatever the data says.
        return _deny(Reason.SEPARATION_OF_DUTIES)
    if facts.approved_hash != facts.content_hash:
        return _deny(Reason.APPROVAL_STALE)
    return ALLOW
