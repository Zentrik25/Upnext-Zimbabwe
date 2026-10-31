"""The second step of sign-in for people who turned on two-step verification (any account, not only staff).

After the password (or Google) is accepted the person is *not* signed in yet. The server keeps a short pending
record in this browser's own server-side session; only a correct code turns it into a real session.
A stolen or guessed password alone therefore never yields a session, and the record cannot be replayed from
another browser. Staff keep their own flow: they sign in and then pass the second step before the staff API
serves anything (`core.staff_mfa`).
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from django.contrib.auth import login
from django.http import HttpRequest

from core.staff_mfa import SESSION_FLAG

from . import mfa
from .models import AccountStatus, User

PENDING_KEY = "mfa_pending"
LIFETIME = 10 * 60  # seconds the person has to enter a code


@dataclass(frozen=True)
class Pending:
    user: User
    remember: bool
    method: str  # "password" or "google"


def required_for(user: User) -> bool:
    """Staff are checked in the staff workspace, so the sign-in challenge is for everyone else."""
    return not user.is_staff and mfa.is_enrolled(user)


def begin(request: HttpRequest, user: User, *, remember: bool, method: str) -> None:
    request.session.cycle_key()  # a fresh session for the pending state (fixation hygiene)
    request.session[PENDING_KEY] = {
        "uid": str(user.pk),
        "at": time.time(),
        "remember": remember,
        "method": method,
    }


def pending(request: HttpRequest) -> Pending | None:
    data = request.session.get(PENDING_KEY)
    if not isinstance(data, dict):
        return None
    if time.time() - float(data.get("at", 0)) > LIFETIME:
        request.session.pop(PENDING_KEY, None)
        return None
    user = User.objects.filter(pk=str(data.get("uid", "")), status=AccountStatus.ACTIVE).first()
    if user is None or not mfa.is_enrolled(user):
        request.session.pop(PENDING_KEY, None)
        return None
    return Pending(user, bool(data.get("remember", True)), str(data.get("method", "password")))


def cancel(request: HttpRequest) -> None:
    request.session.pop(PENDING_KEY, None)


def complete(request: HttpRequest, held: Pending) -> None:
    """Create the real session. `login` rotates the key and clears the pending record with the old one."""
    cancel(request)
    login(request, held.user, backend="django.contrib.auth.backends.ModelBackend")
    request.session[SESSION_FLAG] = True  # the second step was just passed in this session
    if not held.remember:
        request.session.set_expiry(0)
