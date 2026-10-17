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
