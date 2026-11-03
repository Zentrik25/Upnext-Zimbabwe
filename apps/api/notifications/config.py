"""Checks of the e-mail configuration, shared by production start-up and the `check_email_config` command."""

from __future__ import annotations

from typing import Any

BACKENDS = ("none", "file", "console", "smtp")
DEVELOPMENT_ONLY = ("file", "console")
SECURITY_MODES = ("starttls", "ssl", "none")
RESEND_SMTP_HOST = "smtp.resend.com"
RESEND_SMTP_USER = "resend"


def problems(conf: Any, *, production: bool) -> list[str]:
    """Human-readable problems with the e-mail settings (empty when fine). Never includes secret values."""
    found: list[str] = []
    backend = conf.UPNEXT_EMAIL_BACKEND
    if backend not in BACKENDS:
        found.append(f"UPNEXT_EMAIL_BACKEND must be one of {', '.join(BACKENDS)}.")
        return found
    if production and backend in DEVELOPMENT_ONLY:
        found.append(
            f"UPNEXT_EMAIL_BACKEND={backend} is for development only; use smtp or none in production."
        )
    if backend == "smtp":
        if not conf.UPNEXT_SMTP_HOST:
            found.append("UPNEXT_SMTP_HOST is required for the smtp backend.")
        if "@" not in conf.UPNEXT_EMAIL_FROM or conf.UPNEXT_EMAIL_FROM.endswith(".invalid>"):
            found.append("UPNEXT_EMAIL_FROM must be a real sender address for the smtp backend.")
        if conf.UPNEXT_SMTP_SECURITY not in SECURITY_MODES:
            found.append(f"UPNEXT_SMTP_SECURITY must be one of {', '.join(SECURITY_MODES)}.")
        if production and conf.UPNEXT_SMTP_SECURITY == "none":
            found.append(
                "UPNEXT_SMTP_SECURITY=none sends mail and credentials unencrypted; not allowed in production."
            )
        if bool(conf.UPNEXT_SMTP_USER) != bool(conf.UPNEXT_SMTP_PASSWORD):
            found.append("UPNEXT_SMTP_USER and UPNEXT_SMTP_PASSWORD must be set together.")
        if str(conf.UPNEXT_SMTP_HOST).lower() == RESEND_SMTP_HOST:
            found.extend(resend_problems(conf))
    return found


def resend_problems(conf: Any) -> list[str]:
    """Extra checks when the SMTP host is Resend's (D-34): user `resend`, the API key as password, TLS on."""
    found: list[str] = []
    if conf.UPNEXT_SMTP_USER != RESEND_SMTP_USER:
        found.append(f"UPNEXT_SMTP_USER must be '{RESEND_SMTP_USER}' for Resend.")
    if not conf.UPNEXT_SMTP_PASSWORD:
        found.append(
            "UPNEXT_SMTP_PASSWORD must be the Resend API key (set it in the secret store, not in git)."
        )
    if conf.UPNEXT_SMTP_SECURITY == "ssl" and conf.UPNEXT_SMTP_PORT != 465:
        found.append("Resend implicit TLS (UPNEXT_SMTP_SECURITY=ssl) uses port 465.")
    if conf.UPNEXT_SMTP_SECURITY == "starttls" and conf.UPNEXT_SMTP_PORT != 587:
        found.append("Resend STARTTLS (UPNEXT_SMTP_SECURITY=starttls) uses port 587.")
    return found
