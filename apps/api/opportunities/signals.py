"""Signals sent by the publishing service.

`transition_recorded` is sent from `workflow._record`, inside the transition's transaction, right after the
history and audit rows are written. Receivers belong to other apps (employer notifications today), so the
publishing service does not import them. It is sent with `send_robust`: a receiver that raises is logged and
can never roll back or block an editorial decision, and a receiver must do its database work in its own
savepoint (`transaction.atomic()`) so a database error cannot poison the caller's transaction.
"""

from django.dispatch import Signal

# Arguments: event (PublishingEvent), opportunity, version (OpportunityVersion | None), reason (str | None)
transition_recorded = Signal()
