"""A minimal client for the Google Indexing API: a service-account access token and one publish call.

No Google library is used. The access token comes from the OAuth 2.0 JWT-bearer grant (RFC 7523): a JWT
signed with the service account's RSA key (RS256, via `cryptography`) is exchanged at Google's token
endpoint over TLS for a one-hour token with the `indexing` scope only. The token is kept in this process's
memory until shortly before it expires; it is never stored, logged or sent anywhere but Google.

The key file is read from `UPNEXT_INDEXING_CREDENTIALS_FILE` (mounted read-only from outside the
repository). Its `token_uri` must be Google's own endpoint, so a tampered file cannot send the signed
assertion elsewhere. Errors carry short codes and field names only, never a key, a token or a response body.

The network is reached through `transport`, a callable `(url, body, headers, timeout) -> (status, bytes)`,
so tests replace it with recorded Google answers and never touch the network.
"""

from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - a public endpoint address, not a secret
PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish"
SCOPE = "https://www.googleapis.com/auth/indexing"
TIMEOUT_SECONDS = 15

Transport = Callable[[str, bytes, dict[str, str], float], tuple[int, bytes]]


class CredentialsError(Exception):
    """The key file is missing, unreadable or not a Google service-account key. `code` is safe to log."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class TokenError(Exception):
    """Google refused or could not issue an access token. `transient` is true for network and 5xx failures."""

    def __init__(self, code: str, *, transient: bool) -> None:
        super().__init__(code)
        self.code, self.transient = code, transient


@dataclass(frozen=True)
class Credentials:
    client_email: str
    key_id: str
    private_key: rsa.RSAPrivateKey

    def __repr__(self) -> str:  # never print the key
        return f"Credentials({self.client_email!r})"


def load_credentials(path: str) -> Credentials:
    if not path:
        raise CredentialsError("credentials_not_configured")
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CredentialsError("credentials_file_missing") from None
    except OSError, ValueError:
        raise CredentialsError("credentials_file_unreadable") from None
    if not isinstance(raw, dict) or raw.get("type") != "service_account":
        raise CredentialsError("credentials_not_a_service_account")
    for field in ("client_email", "private_key", "private_key_id"):
        if not isinstance(raw.get(field), str) or not raw[field]:
            raise CredentialsError(f"credentials_missing_{field}")
    if raw.get("token_uri", TOKEN_URL) != TOKEN_URL:
        raise CredentialsError("credentials_unexpected_token_uri")
    try:
        key = serialization.load_pem_private_key(raw["private_key"].encode(), password=None)
    except ValueError, TypeError:
        raise CredentialsError("credentials_bad_private_key") from None
    if not isinstance(key, rsa.RSAPrivateKey):
        raise CredentialsError("credentials_not_rsa")
    return Credentials(raw["client_email"], raw["private_key_id"], key)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def signed_assertion(credentials: Credentials, now: float) -> str:
    header = {"alg": "RS256", "typ": "JWT", "kid": credentials.key_id}
    claims = {
        "iss": credentials.client_email,
        "scope": SCOPE,
        "aud": TOKEN_URL,
        "iat": int(now),
        "exp": int(now) + 3600,
    }
    signing_input = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(claims).encode())}".encode()
    signature = credentials.private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input.decode()}.{_b64(signature)}"


def urllib_transport(url: str, body: bytes, headers: dict[str, str], timeout: float) -> tuple[int, bytes]:
    """POST over HTTPS. Only the two fixed Google addresses above are ever passed in."""
    if not url.startswith("https://"):
        raise ValueError("https only")
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - checked above
            return response.status, response.read(65536)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(65536)


class Client:
    """One Google client per worker process: it keeps the current access token in memory."""

    def __init__(self, credentials: Credentials, transport: Transport = urllib_transport) -> None:
        self.credentials, self.transport = credentials, transport
        self._token: str | None = None
        self._expires = 0.0

    def forget_token(self) -> None:
        self._token, self._expires = None, 0.0

    def token(self, now: float | None = None) -> str:
        now = time.time() if now is None else now
        if self._token and now < self._expires - 60:
            return self._token
        body = urllib.parse.urlencode(
            {
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": signed_assertion(self.credentials, now),
            }
        ).encode()
        try:
            status, raw = self.transport(
                TOKEN_URL, body, {"Content-Type": "application/x-www-form-urlencoded"}, TIMEOUT_SECONDS
            )
        except OSError, TimeoutError:
            raise TokenError("token_network_error", transient=True) from None
        if status >= 500 or status == 429:
            raise TokenError(f"token_http_{status}", transient=True)
        if status != 200:
            raise TokenError(
                f"token_http_{status}", transient=False
            )  # invalid_grant: a key or account problem
        try:
            data: dict[str, Any] = json.loads(raw)
            token, lifetime = str(data["access_token"]), int(data.get("expires_in", 3600))
        except ValueError, KeyError, TypeError:
            raise TokenError("token_bad_response", transient=True) from None
        self._token, self._expires = token, now + lifetime
        return token

    def publish(self, url: str, action: str) -> int:
        """Send one notification; returns Google's HTTP status. Network failures raise `OSError`."""
        body = json.dumps({"url": url, "type": action}).encode()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.token()}"}
        status, _ = self.transport(PUBLISH_URL, body, headers, TIMEOUT_SECONDS)
        return status
