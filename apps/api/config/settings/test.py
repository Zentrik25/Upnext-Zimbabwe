"""Test settings: same PostgreSQL engine as production, fast hasher, quiet logging."""

from .base import *

DEBUG = False
ALLOWED_HOSTS = ["testserver", "localhost"]
EXPOSE_OPENAPI_SCHEMA = True
# Fast hasher for bulk fixtures only; Argon2 configuration is asserted separately in tests.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher", *PASSWORD_HASHERS]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
LOGGING["root"]["level"] = "CRITICAL"  # type: ignore[index]
UPNEXT_EMAIL_BACKEND = "file"
UPNEXT_SITEMAP_API_CACHE_SECONDS = 0  # correctness tests read live data; the cache has its own test
UPNEXT_EMAIL_FILE_DIR = "/tmp/upnext-mail-test"  # noqa: S108
UPNEXT_STAFF_MFA_REQUIRED = False  # the staff gate has its own tests (test_staff_mfa.py)

# Pin the proposed limits so tests do not depend on the environment (the dev Compose stack loosens them).
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        "login_ip": "20/15m",
        "public_read": "240/1m",
        "register_ip": "5/1h",
        "email_request_ip": "10/1h",
        "token_ip": "10/1h",
        "me_write": "60/1m",
        "listing_event_ip": "120/1m",
        "for_you_user": "120/1m",
        "unsubscribe_ip": "30/1h",
        "report_ip": "5/1h",
    },
}
UPNEXT_EMAIL_REQUEST_GAP_SECONDS = 60
UPNEXT_EMAIL_REQUESTS_PER_HOUR = 3
UPNEXT_LOGIN_FAILURES_PER_EMAIL = 5
