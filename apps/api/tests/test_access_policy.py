"""SOD-01…SOD-13 (pure policy). D-18 / D-22 / ADR-0011 / ADR-0015."""

from __future__ import annotations

from access.policy import (
    Actor,
    Reason,
    RevisionFacts,
    can_approve,
    can_publish,
    can_reject,
    can_return,
    can_verify,
)

ALICE, BOB, CAROL = "alice", "bob", "carol"
EDITOR = frozenset({"editor"})
ADMIN = frozenset({"administrator"})
CONTRIB = frozenset({"contributor"})
H1, H2 = b"hash-v1", b"hash-v2"


def facts(
    state: str = "in_review",
    *,
    approved_by: str | None = None,
    approved_hash: bytes | None = None,
    content: bytes = H1,
) -> RevisionFacts:
    return RevisionFacts(state, frozenset({ALICE}), content, approved_by, approved_hash)


def test_sod_01_author_cannot_approve_reject_return_or_verify_even_with_authority() -> None:
    author_editor = Actor(ALICE, EDITOR | CONTRIB)
    author_admin = Actor(ALICE, ADMIN | CONTRIB)
    for actor in (author_editor, author_admin):
        assert can_approve(actor, facts("in_review")).reason is Reason.SEPARATION_OF_DUTIES
        assert can_reject(actor, facts("in_review")).reason is Reason.SEPARATION_OF_DUTIES
        assert can_return(actor, facts("approved")).reason is Reason.SEPARATION_OF_DUTIES
        assert can_verify(actor, facts("in_review")).reason is Reason.SEPARATION_OF_DUTIES


def test_sod_02_another_editor_or_administrator_can_approve() -> None:
    assert can_approve(Actor(BOB, EDITOR), facts())
    assert can_approve(Actor(CAROL, ADMIN), facts())


def test_contributor_alone_cannot_approve() -> None:
    assert can_approve(Actor(BOB, CONTRIB), facts()).reason is Reason.PERMISSION_DENIED


def test_sod_04_the_approver_may_publish_the_exact_revision() -> None:
    approved = facts("approved", approved_by=BOB, approved_hash=H1)
    assert can_publish(Actor(BOB, EDITOR), approved)


def test_sod_09_administrator_can_publish_someone_elses_approved_listing() -> None:
    approved = facts("approved", approved_by=BOB, approved_hash=H1)
    assert can_publish(Actor(CAROL, ADMIN), approved)


def test_sod_10_author_may_publish_only_after_another_person_approved_the_exact_revision() -> None:
    author = Actor(ALICE, EDITOR | CONTRIB)
    approved_by_other = facts("approved", approved_by=BOB, approved_hash=H1)
    assert can_publish(author, approved_by_other)  # D-22: allowed
    # not approved at all
    assert can_publish(author, facts("in_review")).reason is Reason.INVALID_TRANSITION
    assert can_publish(author, facts("approved")).reason is Reason.INVALID_TRANSITION
    # approval recorded against the author (impossible via can_approve, but defended anyway)
    assert (
        can_publish(author, facts("approved", approved_by=ALICE, approved_hash=H1)).reason
        is Reason.SEPARATION_OF_DUTIES
    )


def test_material_change_after_approval_invalidates_it() -> None:
    changed = facts("approved", approved_by=BOB, approved_hash=H1, content=H2)
    for actor in (Actor(BOB, EDITOR), Actor(ALICE, EDITOR), Actor(CAROL, ADMIN)):
        assert can_publish(actor, changed).reason is Reason.APPROVAL_STALE


def test_publish_requires_the_publish_permission() -> None:
    approved = facts("approved", approved_by=BOB, approved_hash=H1)
    assert can_publish(Actor(ALICE, CONTRIB), approved).reason is Reason.PERMISSION_DENIED
    assert can_publish(Actor(ALICE, frozenset()), approved).reason is Reason.PERMISSION_DENIED


def test_review_actions_enforce_state() -> None:
    editor = Actor(BOB, EDITOR)
    assert can_approve(editor, facts("draft")).reason is Reason.INVALID_TRANSITION
    assert can_approve(editor, facts("approved")).reason is Reason.INVALID_TRANSITION
    assert can_return(editor, facts("in_review")).reason is Reason.INVALID_TRANSITION
    assert can_return(editor, facts("approved"))
    assert can_verify(editor, facts("published"))
    assert can_verify(editor, facts("draft")).reason is Reason.INVALID_TRANSITION


def test_decision_is_truthy_only_when_allowed() -> None:
    assert bool(can_approve(Actor(BOB, EDITOR), facts())) is True
    assert bool(can_approve(Actor(ALICE, EDITOR), facts())) is False


def test_chain_authors_include_every_contributor_in_the_chain() -> None:
    # Bob authored an earlier version in the chain and then tries to approve a later revision.
    chain = RevisionFacts("in_review", frozenset({ALICE, BOB}), H1)
    assert can_approve(Actor(BOB, EDITOR), chain).reason is Reason.SEPARATION_OF_DUTIES
    assert can_approve(Actor(CAROL, EDITOR), chain)


def test_permission_check_cannot_be_bypassed_by_truthiness() -> None:
    """Regression: a denied Decision is falsy; guards must not treat it as 'no objection'."""
    assert can_approve(Actor(BOB, frozenset()), facts()).reason is Reason.PERMISSION_DENIED
    assert (
        can_publish(Actor(BOB, frozenset()), facts("approved", approved_by=CAROL, approved_hash=H1)).reason
        is Reason.PERMISSION_DENIED
    )
