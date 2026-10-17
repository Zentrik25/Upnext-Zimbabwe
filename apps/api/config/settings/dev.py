"""Local development: DEBUG-friendly, plain-HTTP cookies, schema endpoint enabled."""

from .base import *
from .env import get_list, get_str

DEBUG = True
ALLOWED_HOSTS = get_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1", "[::1]", "api", "proxy"])
CSRF_TRUSTED_ORIGINS = get_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", ["http://localhost:8080", "http://127.0.0.1:8080"]
)
EXPOSE_OPENAPI_SCHEMA = True

# Serve admin assets straight from the packages in development (no collectstatic/manifest step).
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
UPNEXT_EMAIL_BACKEND = get_str("UPNEXT_EMAIL_BACKEND", "file")
