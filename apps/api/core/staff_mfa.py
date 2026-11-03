"""The second step for staff sessions (OQ-16 provisional default P3-07; D-49).

An account that holds a staff role must prove a TOTP or recovery code in the current session before the staff
API serves it anything (`api.staff_views.IsVerifiedStaff`). The flag lives in the server-side session, so it
cannot be reached by signing in some other way, and the session key is rotated when it is set.
"""

from __future__ import annotations

import time
from typing import Any

from django.conf import settings
from django.http import HttpRequest

from accounts.models import UserSession

SESSION_FLAG = "mfa_ok"
PROVED_AT = (
    "mfa_at"  # when a code was last really proven (a trusted device carries this forward, never refreshes it)
)


def is_fresh(session: Any) -> bool:
    """The second step counts only while the last proven code is no older than the staff limit (24 hours by
    default), whether it was proven in this session or earlier on a trusted device."""
    if not session.get(SESSION_FLAG):
        return False
    proved = session.get(PROVED_AT)
    return (
        isinstance(proved, (int, float))
        and time.time() - float(proved) <= settings.UPNEXT_STAFF_MFA_MAX_AGE_SECONDS
    )


def mark_trusted(request: HttpRequest, proved_at: float) -> None:
    """A recognised trusted device stands in for a code at sign-in; the proof keeps the real earlier date."""
    request.session[SESSION_FLAG] = True
    request.session[PROVED_AT] = proved_at


def mark_verified(request: HttpRequest) -> None:
    """Rotate the session key (fixation hygiene), flag the session, and keep the session record in step."""
    old_key = request.session.session_key
    request.session.cycle_key()
    request.session[SESSION_FLAG] = True
    request.session[PROVED_AT] = time.time()
    if old_key:
        UserSession.objects.filter(session_key=old_key).update(session_key=request.session.session_key)
