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
