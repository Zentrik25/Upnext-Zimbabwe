"""Second step for Django Admin (/django-admin/): a gate in front of it plus the verify/enrol page.

The staff console (/staff/, Next.js) gives the same proof through /api/v1/staff/mfa/*; the flag is shared.

Any account that holds a staff role must prove a TOTP or recovery code in the current session before any
other /django-admin/ page, or any /api/v1/staff/ endpoint, is served (OQ-16 default P3-07). The flag
lives in the session and is set only after a valid code, so plain sign-in through the API never sets it.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from django.conf import settings
from django.contrib import admin
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.cache import never_cache

from accounts import mfa
from accounts.models import UserSession

SESSION_FLAG = "mfa_ok"
ADMIN_PREFIX = "/django-admin/"
OPEN_PATHS = (ADMIN_PREFIX + "login/", ADMIN_PREFIX + "logout/", ADMIN_PREFIX + "mfa/")
LANDING = ADMIN_PREFIX


def _is_staff_user(user: Any) -> bool:
    return bool(user is not None and user.is_authenticated and user.active_roles())


class StaffMfaMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if (
            settings.UPNEXT_STAFF_MFA_REQUIRED
            and request.path.startswith(ADMIN_PREFIX)
            and not request.path.startswith(OPEN_PATHS)
            and _is_staff_user(getattr(request, "user", None))
            and not request.session.get(SESSION_FLAG)
        ):
            target = request.get_full_path()
            return HttpResponseRedirect(
                f"{reverse('staff-mfa')}?next={target}" if target != LANDING else reverse("staff-mfa")
            )
        return self.get_response(request)


def _safe_next(request: HttpRequest) -> str:
    candidate = request.POST.get("next") or request.GET.get("next") or LANDING
    allowed = url_has_allowed_host_and_scheme(
        candidate, allowed_hosts={request.get_host()}
    ) and candidate.startswith(ADMIN_PREFIX)
    return candidate if allowed else LANDING


def _mark_verified(request: HttpRequest) -> None:
    """Rotate the session key (fixation hygiene), flag it, and keep the session record in step."""
    old_key = request.session.session_key
    request.session.cycle_key()
    request.session[SESSION_FLAG] = True
    if old_key:
        UserSession.objects.filter(session_key=old_key).update(session_key=request.session.session_key)


@never_cache
def mfa_view(request: HttpRequest) -> HttpResponse:
    user = request.user
    if not _is_staff_user(user):
        return HttpResponseRedirect(f"{reverse('admin:login')}?next={reverse('staff-mfa')}")
    context: dict[str, Any] = {
        **admin.site.each_context(request),
        "title": "Two-step verification",
        "next": _safe_next(request),
        "error": None,
        "enrolling": not mfa.is_enrolled(user),  # type: ignore[arg-type]
        "recovery_codes": None,
    }
    if request.session.get(SESSION_FLAG) and request.method == "GET" and not context["enrolling"]:
        return HttpResponseRedirect(context["next"])
    if request.method == "POST":
        code = str(request.POST.get("code", ""))[:32]
        if mfa.blocked(user):  # type: ignore[arg-type]
            context["error"] = "Too many incorrect codes. Try again in 15 minutes."
        elif context["enrolling"]:
            codes = mfa.confirm_enrolment(user, code)  # type: ignore[arg-type]
            if codes is not None:
                _mark_verified(request)
                context.update(recovery_codes=codes, enrolling=False)
                return TemplateResponse(request, "admin/accounts/mfa.html", context)
            context["error"] = (
                "That code did not match. Check the setup key and your device clock, then try again."
            )
        elif mfa.verify(user, code):  # type: ignore[arg-type]
            _mark_verified(request)
            return HttpResponseRedirect(context["next"])
        else:
            context["error"] = "That code is not valid. Enter the current code or an unused recovery code."
    if context["enrolling"]:
        enrolment = mfa.begin_enrolment(user)  # type: ignore[arg-type]
        context.update(secret=enrolment.secret, uri=enrolment.uri)
    return TemplateResponse(request, "admin/accounts/mfa.html", context)
