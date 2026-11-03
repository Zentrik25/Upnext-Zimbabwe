"""Production-like settings: fail fast on unsafe configuration."""

from django.core.exceptions import ImproperlyConfigured

from .base import *
from .env import get_bool

DEBUG = False
EXPOSE_OPENAPI_SCHEMA = get_bool("UPNEXT_EXPOSE_OPENAPI_SCHEMA", False)

if len(SECRET_KEY) < 50 or SECRET_KEY.startswith("django-insecure"):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a random value of at least 50 characters.")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set in production.")
if not SECURE_COOKIES:
    raise ImproperlyConfigured("UPNEXT_SECURE_COOKIES must be true in production.")
SECURE_SSL_REDIRECT = get_bool("DJANGO_SSL_REDIRECT", False)  # TLS terminates at the proxy

# --- Safeguards that apply to a real deployment ------------------------------------------------------------
# UPNEXT_ENVIRONMENT=production (the default) refuses settings that are only acceptable on throwaway stacks.
# The Compose "prod-like" override and CI set it to "local-prod-like" to run the production images with demo
# data; nothing else should.
import os  # noqa: E402
import sys  # noqa: E402

from notifications import config as _mail_config  # noqa: E402

UPNEXT_ENVIRONMENT = os.environ.get("UPNEXT_ENVIRONMENT") or "production"
if UPNEXT_ENVIRONMENT not in ("production", "local-prod-like"):
    raise ImproperlyConfigured("UPNEXT_ENVIRONMENT must be production or local-prod-like.")
_mail_problems = _mail_config.problems(sys.modules[__name__], production=UPNEXT_ENVIRONMENT == "production")
if _mail_problems:
    raise ImproperlyConfigured(" ".join(_mail_problems))
if UPNEXT_ENVIRONMENT == "production":
    _problems: list[str] = []
    if not UPNEXT_STAFF_MFA_REQUIRED:
        _problems.append("UPNEXT_STAFF_MFA_REQUIRED must be true in production.")
    if os.environ.get("UPNEXT_DEMO_TOOLS") == "1":
        _problems.append("UPNEXT_DEMO_TOOLS must not be set in production.")
    if SECURE_HSTS_SECONDS < 31536000:
        _problems.append("DJANGO_HSTS_SECONDS must be at least 31536000 (one year) in production.")
    if "*" in ALLOWED_HOSTS:
        _problems.append("DJANGO_ALLOWED_HOSTS must not contain '*'.")
    if not CSRF_TRUSTED_ORIGINS or any(not o.startswith("https://") for o in CSRF_TRUSTED_ORIGINS):
        _problems.append("DJANGO_CSRF_TRUSTED_ORIGINS must list the https origin(s) of the site.")
    if not UPNEXT_PUBLIC_BASE_URL.startswith("https://"):
        _problems.append("UPNEXT_PUBLIC_BASE_URL must be the https address of the site.")
    if UPNEXT_TOKEN_KEY == SECRET_KEY or len(UPNEXT_TOKEN_KEY) < 32:
        _problems.append("UPNEXT_TOKEN_KEY must be set to its own random value of at least 32 characters.")
    if _problems:
        raise ImproperlyConfigured(" ".join(_problems))
