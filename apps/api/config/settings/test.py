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
UPNEXT_EMAIL_FILE_DIR = "/tmp/upnext-mail-test"  # noqa: S108
UPNEXT_STAFF_MFA_REQUIRED = False  # the staff gate has its own tests (test_staff_mfa.py)
