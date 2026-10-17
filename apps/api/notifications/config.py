"""Checks of the e-mail configuration, shared by production start-up and the `check_email_config` command."""

from __future__ import annotations

from typing import Any

BACKENDS = ("none", "file", "console", "smtp")
DEVELOPMENT_ONLY = ("file", "console")
SECURITY_MODES = ("starttls", "ssl", "none")


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
    return found
