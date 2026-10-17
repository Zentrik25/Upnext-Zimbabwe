"""Settings shared by every environment. Secrets and hosts come from the environment only."""

from __future__ import annotations

from pathlib import Path

from .env import get_bool, get_int, get_list, get_str

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = get_str("DJANGO_SECRET_KEY", required=True)
DEBUG = get_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = get_list("DJANGO_ALLOWED_HOSTS", [])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "drf_spectacular",
    "core",
    "accounts",
    "audit",
    "catalog",
    "opportunities",
]

MIDDLEWARE = [
    "core.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.RequestLogMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

# --- Database (PostgreSQL only) -------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": get_str("POSTGRES_DB", required=True),
        "USER": get_str("POSTGRES_USER", required=True),
        "PASSWORD": get_str("POSTGRES_PASSWORD", required=True),
        "HOST": get_str("POSTGRES_HOST", "db"),
        "PORT": get_str("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": get_int("POSTGRES_CONN_MAX_AGE", 60),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            "connect_timeout": 5,
            # Bound runaway queries (SECURITY_ARCHITECTURE TM-17/TM-18).
            "options": f"-c statement_timeout={get_int('POSTGRES_STATEMENT_TIMEOUT_MS', 15000)}",
        },
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Identity -------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",  # Argon2id (SECURITY_ARCHITECTURE §3)
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",  # only to verify/upgrade legacy hashes
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},  # PROPOSED value, OQ-17
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Sessions, CSRF, cookies ----------------------------------------------------
SECURE_COOKIES = get_bool("UPNEXT_SECURE_COOKIES", False)
# "__Host-" cookies need Secure + Path=/ + no Domain, i.e. one public hostname (OQ-01).
_COOKIE_PREFIX = "__Host-" if get_bool("UPNEXT_HOST_COOKIE_PREFIX", False) else ""
SESSION_ENGINE = "django.contrib.sessions.backends.db"  # Redis is deferred (ADR-0004)
SESSION_COOKIE_NAME = f"{_COOKIE_PREFIX}upnext_sid"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = SECURE_COOKIES
SESSION_COOKIE_AGE = get_int("UPNEXT_SESSION_MAX_AGE_SECONDS", 60 * 60 * 24 * 30)  # PROPOSED, OQ-17
CSRF_COOKIE_NAME = f"{_COOKIE_PREFIX}upnext_csrf"
CSRF_COOKIE_HTTPONLY = False  # the SPA echoes the token in X-CSRFToken
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = SECURE_COOKIES
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"
CSRF_TRUSTED_ORIGINS = get_list("DJANGO_CSRF_TRUSTED_ORIGINS", [])

# --- Transport security ---------------------------------------------------------
# HSTS is off unless configured; never set includeSubDomains/preload without approval because the
# domain is shared with The Granite Post (SECURITY_ARCHITECTURE §6.1).
SECURE_HSTS_SECONDS = get_int("DJANGO_HSTS_SECONDS", 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
if get_bool("UPNEXT_TRUST_PROXY_HEADERS", False):
    # Only enable behind a proxy that overwrites X-Forwarded-Proto (to be verified before Phase 7).
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = False

# --- Internationalisation -------------------------------------------------------
LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"  # all instants are stored in UTC; display zones are per-field
USE_I18N = True
USE_TZ = True

# --- Static files (Django admin assets) -----------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# --- Cache (rate-limit counters while Redis is deferred) ------------------------
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

# --- REST framework -------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["api.authentication.CsrfEnforcingSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],  # deny by default
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "api.errors.exception_handler",
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        "login_ip": get_str("UPNEXT_THROTTLE_LOGIN_IP", "20/15m"),  # PROPOSED, OQ-17
        "public_read": get_str("UPNEXT_THROTTLE_PUBLIC_READ", "240/1m"),  # PROPOSED
    },
    "URL_FORMAT_OVERRIDE": None,
}
UPNEXT_LOGIN_FAILURES_PER_EMAIL = get_int("UPNEXT_LOGIN_FAILURES_PER_EMAIL", 5)  # per 15 min
UPNEXT_LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60
# Peppers the hashed throttle keys so raw e-mail addresses never reach the cache table.
UPNEXT_THROTTLE_PEPPER = get_str("UPNEXT_THROTTLE_PEPPER", SECRET_KEY)

SPECTACULAR_SETTINGS = {
    "TITLE": "UPNEXT API",
    "DESCRIPTION": "Implemented subset of docs/engineering/openapi/openapi.yaml (Phase 1 foundation).",
    "VERSION": "1.0.0-phase1",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
    "OAS_VERSION": "3.1.0",
    "ENUM_NAME_OVERRIDES": {
        "AccountStatusEnum": "accounts.models.AccountStatus",
        "PublicListingStatusEnum": ["published", "expired", "withdrawn"],
    },
}

# --- Logging --------------------------------------------------------------------
LOG_LEVEL = get_str("UPNEXT_LOG_LEVEL", "INFO")
APPEND_SLASH = False  # the API contract has no trailing slashes; never redirect a POST

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_id": {"()": "core.logging.RequestIdFilter"},
        "redact": {"()": "core.logging.RedactionFilter"},
    },
    "formatters": {"json": {"()": "core.logging.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_id", "redact"],
        }
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        "django.server": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# Public base path is routed by the proxy; the API itself only knows /api/v1/.
API_VERSION = "v1"
