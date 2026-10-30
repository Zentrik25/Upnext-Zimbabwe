"""The second step for staff sessions (OQ-16 provisional default P3-07; D-49).

An account that holds a staff role must prove a TOTP or recovery code in the current session before the staff
API serves it anything (`api.staff_views.IsVerifiedStaff`). The flag lives in the server-side session, so it
cannot be reached by signing in some other way, and the session key is rotated when it is set.
"""

from __future__ import annotations

from django.http import HttpRequest

from accounts.models import UserSession

SESSION_FLAG = "mfa_ok"


def mark_verified(request: HttpRequest) -> None:
    """Rotate the session key (fixation hygiene), flag the session, and keep the session record in step."""
    old_key = request.session.session_key
    request.session.cycle_key()
    request.session[SESSION_FLAG] = True
    if old_key:
        UserSession.objects.filter(session_key=old_key).update(session_key=request.session.session_key)
