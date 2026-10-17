from __future__ import annotations

from typing import Any

from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.dispatch import receiver
from django.http import HttpRequest
from django.utils import timezone

from .models import User, UserSession
from .sessions import start_record


@receiver(user_logged_in)
def on_login(sender: Any, request: HttpRequest | None, user: User, **kwargs: Any) -> None:
    if request is not None and hasattr(request, "session"):
        request.session["login_at"] = timezone.now().timestamp()
        request.session["last_activity"] = timezone.now().timestamp()
        start_record(request, user)


@receiver(user_logged_out)
def on_logout(sender: Any, request: HttpRequest | None, user: User | None, **kwargs: Any) -> None:
    key = getattr(getattr(request, "session", None), "session_key", None)
    if key:
        UserSession.objects.filter(session_key=key, revoked_at__isnull=True).update(revoked_at=timezone.now())
