"""Sign in with Google: OpenID Connect code flow with PKCE (no new dependency, no stored tokens).

Off until `UPNEXT_GOOGLE_CLIENT_ID` and `UPNEXT_GOOGLE_CLIENT_SECRET` are set. The flow:

1. `begin` stores a random `state`, `nonce` and PKCE verifier in the visitor's session and returns Google's
   address.
2. Google sends the person back with a one-time `code` and the same `state`.
3. `exchange` checks the state, trades the code **directly with Google over TLS** (the ID token therefore
   needs no separate signature check, OpenID Connect Core 3.1.3.7), validates issuer, audience, expiry, nonce
   and a verified e-mail address, and resolves or creates the account.

Rules that keep this from becoming a way around the other protections:

* An account that holds a staff role is never signed in this way: staff use a password and two-step
  verification.
* An existing password account is linked only through Google's *verified* e-mail address; a password account
  that was never confirmed loses its password when linked (otherwise whoever registered the address first, and
  knows that password, would keep access).
* Suspended or otherwise unavailable accounts are refused. Google never creates a staff role.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.http import HttpRequest
from django.utils import timezone

from audit import services as audit
from audit.models import Severity

from .models import AccountStatus, User

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - a public endpoint address, not a secret
ISSUERS = {"https://accounts.google.com", "accounts.google.com"}
SESSION_KEY = "google_oauth"
MAX_AGE_SECONDS = 600


class GoogleSignInError(Exception):
    """Anything that stops sign-in; the person sees one generic message, the log keeps the reason."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def configured() -> bool:
    return bool(settings.UPNEXT_GOOGLE_CLIENT_ID and settings.UPNEXT_GOOGLE_CLIENT_SECRET)


def redirect_uri() -> str:
    return settings.UPNEXT_PUBLIC_BASE_URL.rstrip("/") + "/api/v1/auth/google/callback"


def safe_next(value: str | None) -> str:
    """Only a path on this site: starts with one slash, no scheme, no backslash, no control characters."""
    if (
        value
        and value.startswith("/")
        and not value.startswith("//")
        and "\\" not in value
        and value.isprintable()
    ):
        return value[:300]
    return "/"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def begin(request: HttpRequest, next_path: str | None) -> str:
    state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(64)
    request.session[SESSION_KEY] = {
        "state": state,
        "nonce": nonce,
        "verifier": verifier,
        "next": safe_next(next_path),
        "at": time.time(),
    }
    query = urllib.parse.urlencode(
        {
            "client_id": settings.UPNEXT_GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": _b64(hashlib.sha256(verifier.encode()).digest()),
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    )
    return f"{AUTH_URL}?{query}"


def _post_form(url: str, fields: dict[str, str]) -> dict[str, Any]:
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(  # noqa: S310 - https URL constant above
        url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:  # noqa: S310
            parsed = json.loads(response.read(200_000))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise GoogleSignInError(f"token exchange failed: {type(exc).__name__}") from None
    if not isinstance(parsed, dict):
        raise GoogleSignInError("token response is not an object")
    return parsed


def _claims(id_token: str) -> dict[str, Any]:
    try:
        payload = id_token.split(".")[1]
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError) as exc:
        raise GoogleSignInError("unreadable id token") from exc
    if not isinstance(data, dict):
        raise GoogleSignInError("id token payload is not an object")
    return data


@dataclass(frozen=True)
class Identity:
    subject: str
    email: str
    name: str


def exchange(request: HttpRequest, code: str, state: str) -> tuple[Identity, str]:
    """Check the state, trade the code for an ID token and validate it; returns the identity and `next`."""
    saved = request.session.pop(SESSION_KEY, None)
    if not isinstance(saved, dict) or time.time() - float(saved.get("at", 0)) > MAX_AGE_SECONDS:
        raise GoogleSignInError("no pending sign-in or it expired")
    if not secrets.compare_digest(str(saved.get("state", "")), state):
        raise GoogleSignInError("state mismatch")
    tokens = _post_form(
        TOKEN_URL,
        {
            "code": code,
            "client_id": settings.UPNEXT_GOOGLE_CLIENT_ID,
            "client_secret": settings.UPNEXT_GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri(),
            "grant_type": "authorization_code",
            "code_verifier": str(saved["verifier"]),
        },
    )
    id_token = tokens.get("id_token")
    if not isinstance(id_token, str):
        raise GoogleSignInError("no id token")
    claims = _claims(id_token)
    if claims.get("iss") not in ISSUERS:
        raise GoogleSignInError("wrong issuer")
    audience = claims.get("aud")
    if audience != settings.UPNEXT_GOOGLE_CLIENT_ID and settings.UPNEXT_GOOGLE_CLIENT_ID not in (
        audience if isinstance(audience, list) else []
    ):
        raise GoogleSignInError("wrong audience")
    if float(claims.get("exp", 0)) < time.time():
        raise GoogleSignInError("expired id token")
    if not secrets.compare_digest(str(claims.get("nonce", "")), str(saved["nonce"])):
        raise GoogleSignInError("nonce mismatch")
    email = str(claims.get("email", "")).strip().lower()
    if not email or claims.get("email_verified") not in (True, "true"):
        raise GoogleSignInError("e-mail address not verified by Google")
    subject = str(claims.get("sub", ""))
    if not subject or len(subject) > 64:
        raise GoogleSignInError("missing subject")
    name = " ".join(str(claims.get("name") or email.split("@")[0]).split())[:80] or "UPNEXT member"
    return Identity(subject, email, name), str(saved["next"])


def resolve_user(identity: Identity) -> User:
    """The account for this Google identity, created or linked as the rules above allow."""
    user = User.objects.filter(google_subject=identity.subject).first()
    linked = user is not None
    if user is None:
        user = User.objects.filter(email=identity.email).first()
    if user is None:
        user = User.objects.create_user(
            identity.email,
            None,  # no password: this person signs in with Google (they can set one with "Forgot password")
            identity.name,
            status=AccountStatus.ACTIVE,
            email_verified_at=timezone.now(),
            google_subject=identity.subject,
            terms_accepted_at=timezone.now(),
            terms_version=settings.UPNEXT_TERMS_VERSION,
        )
        audit.record(
            action="account.register_google",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
        return user
    if user.active_roles():
        raise GoogleSignInError("staff accounts do not use Google sign-in")
    if user.deleted_at is not None or user.status not in (
        AccountStatus.ACTIVE,
        AccountStatus.PENDING_VERIFICATION,
    ):
        raise GoogleSignInError("account unavailable")
    if not linked:
        if user.google_subject and user.google_subject != identity.subject:
            raise GoogleSignInError("e-mail belongs to a different Google account")
        if user.status == AccountStatus.PENDING_VERIFICATION:
            user.set_unusable_password()  # the first registrant of the address must not keep a password
            user.status = AccountStatus.ACTIVE
            user.email_verified_at = timezone.now()
        user.google_subject = identity.subject
        user.save()
        audit.record(
            action="account.google_linked",
            object_type="user",
            object_id=user.pk,
            actor_id=user.pk,
            severity=Severity.SECURITY,
        )
    return user
