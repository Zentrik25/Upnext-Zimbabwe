"""Settings shared by every environment. Secrets and hosts come from the environment only."""

from __future__ import annotations

from pathlib import Path

from .env import get_bool, get_int, get_list, get_str

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = get_str("DJANGO_SECRET_KEY", required=True)
DEBUG = get_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = get_list("DJANGO_ALLOWED_HOSTS", [])

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "drf_spectacular",
    "core",
    "accounts",
    "audit",
    "catalog",
    "opportunities",
    "notifications",
    "employers",
    "profiles",
    "alerts",
    "reports",
]

MIDDLEWARE = [
    "core.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.StaffHardeningMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.RequestLogMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
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
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("email", "display_name")},
    },
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
UPNEXT_STAFF_SESSION_SECONDS = get_int("UPNEXT_STAFF_SESSION_SECONDS", 60 * 60 * 8)  # absolute; PROPOSED
UPNEXT_STAFF_MFA_REQUIRED = get_bool("UPNEXT_STAFF_MFA_REQUIRED", True)  # P3-07 (OQ-16 provisional)
UPNEXT_STAFF_IDLE_SECONDS = get_int("UPNEXT_STAFF_IDLE_SECONDS", 30 * 60)  # PROPOSED, OQ-17
UPNEXT_SEEKER_IDLE_SECONDS = get_int("UPNEXT_SEEKER_IDLE_SECONDS", 7 * 24 * 3600)  # PROPOSED, OQ-17
UPNEXT_SEEKER_ABSOLUTE_SECONDS = get_int("UPNEXT_SEEKER_ABSOLUTE_SECONDS", 30 * 24 * 3600)  # PROPOSED
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
    },
    # Per-process memory, never shared: only for data that is cheap to lose and safe to count per process
    # (anonymous read throttle counters, the sitemap feed). Security counters stay in the database cache.
    "local": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "upnext-local"},
}
UPNEXT_SITEMAP_API_CACHE_SECONDS = get_int("UPNEXT_SITEMAP_API_CACHE_SECONDS", 300)

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
        "register_ip": get_str("UPNEXT_THROTTLE_REGISTER_IP", "5/1h"),  # PROPOSED
        "email_request_ip": get_str("UPNEXT_THROTTLE_EMAIL_REQUEST_IP", "10/1h"),  # PROPOSED
        "token_ip": get_str("UPNEXT_THROTTLE_TOKEN_IP", "10/1h"),  # PROPOSED
        "me_write": get_str("UPNEXT_THROTTLE_ME_WRITE", "60/1m"),  # PROPOSED
        "listing_event_ip": get_str("UPNEXT_THROTTLE_LISTING_EVENT", "120/1m"),  # PROPOSED (Phase 6A)
        "for_you_user": get_str("UPNEXT_THROTTLE_FOR_YOU", "120/1m"),  # PROPOSED (Phase 6B)
        "unsubscribe_ip": get_str("UPNEXT_THROTTLE_UNSUBSCRIBE", "30/1h"),  # PROPOSED (Phase 6B)
        "report_ip": get_str("UPNEXT_THROTTLE_REPORT", "5/1h"),  # PROPOSED (M2)
    },
    "URL_FORMAT_OVERRIDE": None,
}
UPNEXT_LOGIN_FAILURES_PER_EMAIL = get_int("UPNEXT_LOGIN_FAILURES_PER_EMAIL", 5)  # per 15 min
UPNEXT_LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60
# Account deletion (OQ-09, provisional default P4-05) and retention windows (P4-06).
UPNEXT_DELETION_COOLING_OFF_DAYS = get_int("UPNEXT_DELETION_COOLING_OFF_DAYS", 14)
UPNEXT_RETENTION_TOKEN_DAYS = get_int("UPNEXT_RETENTION_TOKEN_DAYS", 7)
UPNEXT_RETENTION_OUTBOX_SENT_DAYS = get_int("UPNEXT_RETENTION_OUTBOX_SENT_DAYS", 30)
UPNEXT_RETENTION_OUTBOX_DEAD_DAYS = get_int("UPNEXT_RETENTION_OUTBOX_DEAD_DAYS", 90)
UPNEXT_RETENTION_REVOKED_SESSION_DAYS = get_int("UPNEXT_RETENTION_REVOKED_SESSION_DAYS", 30)
# Daily listing counters (D-36): provisional 12 months, then deleted; subject to legal and privacy review.
UPNEXT_RETENTION_LISTING_STATS_DAYS = get_int("UPNEXT_RETENTION_LISTING_STATS_DAYS", 365)
# Reports (M2): the optional contact address and the repeat key of a closed report are cleared after this many
# days (provisional, P-REPORT-02); one listing accepts at most this many new reports a day.
UPNEXT_RETENTION_REPORT_CONTACT_DAYS = get_int("UPNEXT_RETENTION_REPORT_CONTACT_DAYS", 30)
UPNEXT_REPORT_LISTING_DAILY_CAP = get_int("UPNEXT_REPORT_LISTING_DAILY_CAP", 30)
# Employers are reminded this many days before a published listing closes (M2).
UPNEXT_EXPIRY_REMINDER_DAYS = get_int("UPNEXT_EXPIRY_REMINDER_DAYS", 7)
UPNEXT_EMAIL_REQUEST_GAP_SECONDS = get_int("UPNEXT_EMAIL_REQUEST_GAP_SECONDS", 60)  # PROPOSED
UPNEXT_EMAIL_REQUESTS_PER_HOUR = get_int("UPNEXT_EMAIL_REQUESTS_PER_HOUR", 3)  # PROPOSED
# Peppers the hashed throttle keys so raw e-mail addresses never reach the cache table.
UPNEXT_THROTTLE_PEPPER = get_str("UPNEXT_THROTTLE_PEPPER", SECRET_KEY)
# Signs e-mail tokens and derives staff TOTP secrets. Rotating it invalidates outstanding tokens and resets
# staff two-step devices (acceptable: short token lifetimes; devices can be re-enrolled).
UPNEXT_TOKEN_KEY = get_str("UPNEXT_TOKEN_KEY", SECRET_KEY)

# --- E-mail (provider not chosen: OQ-03). "none" sends nothing; "file"/"console" are development and CI only.
# "production" (set by config.settings.prod unless overridden), "local-prod-like", or "development".
UPNEXT_ENVIRONMENT = get_str("UPNEXT_ENVIRONMENT", "development")
UPNEXT_EMAIL_BACKEND = get_str("UPNEXT_EMAIL_BACKEND", "none")
UPNEXT_EMAIL_FILE_DIR = get_str("UPNEXT_EMAIL_FILE_DIR", "/tmp/upnext-mail")  # noqa: S108
# Public identity (owner decision D-42): the brand, its domain and its one official mailbox. Everything the
# API says in public (e-mail sender name, subjects, footers, admin titles) comes from these four values.
UPNEXT_BRAND_NAME = get_str("UPNEXT_BRAND_NAME", "UPNEXT Careers")
UPNEXT_BRAND_SHORT = get_str("UPNEXT_BRAND_SHORT", "UPNEXT")
UPNEXT_BRAND_DOMAIN = get_str("UPNEXT_BRAND_DOMAIN", "upnext.co.zw")
UPNEXT_OFFICIAL_EMAIL = get_str("UPNEXT_OFFICIAL_EMAIL", "info@upnext.co.zw")
# Sender "UPNEXT Careers <info@upnext.co.zw>", reply-to the same mailbox. No other mailbox is invented. Real
# sending stays off until the sender and domain are verified (delivery_verified, B-01).
UPNEXT_EMAIL_FROM = get_str("UPNEXT_EMAIL_FROM", f"{UPNEXT_BRAND_NAME} <{UPNEXT_OFFICIAL_EMAIL}>")
UPNEXT_SMTP_HOST = get_str("UPNEXT_SMTP_HOST", "")
UPNEXT_SMTP_PORT = get_int("UPNEXT_SMTP_PORT", 587)
UPNEXT_SMTP_SECURITY = get_str("UPNEXT_SMTP_SECURITY", "starttls")  # starttls | ssl | none (dev stubs only)
UPNEXT_SMTP_TIMEOUT_SECONDS = get_int("UPNEXT_SMTP_TIMEOUT_SECONDS", 15)
UPNEXT_EMAIL_REPLY_TO = get_str("UPNEXT_EMAIL_REPLY_TO", UPNEXT_OFFICIAL_EMAIL)
# Mailbox named in the footer of e-mails: the official address (D-42).
UPNEXT_SUPPORT_EMAIL = get_str("UPNEXT_SUPPORT_EMAIL", UPNEXT_OFFICIAL_EMAIL)
UPNEXT_SMTP_USER = get_str("UPNEXT_SMTP_USER", "")
UPNEXT_SMTP_PASSWORD = get_str("UPNEXT_SMTP_PASSWORD", "")
# Origin used in e-mailed links; the public site is path-routed on one hostname (OQ-01).
UPNEXT_EMAIL_WEBHOOK_SECRET = get_str("UPNEXT_EMAIL_WEBHOOK_SECRET", "")  # off until set (P5-01)
# Resend signs webhooks with a Svix secret ("whsec_..."). Off until set; never commit it (D-34).
UPNEXT_RESEND_WEBHOOK_SECRET = get_str("UPNEXT_RESEND_WEBHOOK_SECRET", "")
UPNEXT_PUBLIC_BASE_URL = get_str("UPNEXT_PUBLIC_BASE_URL", "http://localhost:8080")
# Version of the Terms and Privacy Policy a new account agrees to (matches the legal content files).
UPNEXT_TERMS_VERSION = get_str("UPNEXT_TERMS_VERSION", "1.1")
# Sign in with Google (OpenID Connect, authorisation-code flow with PKCE). Off until both values are set; the
# redirect address to register with Google is UPNEXT_PUBLIC_BASE_URL + /api/v1/auth/google/callback.
UPNEXT_GOOGLE_CLIENT_ID = get_str("UPNEXT_GOOGLE_CLIENT_ID", "")
UPNEXT_GOOGLE_CLIENT_SECRET = get_str("UPNEXT_GOOGLE_CLIENT_SECRET", "")

SPECTACULAR_SETTINGS = {
    "TITLE": f"{UPNEXT_BRAND_SHORT} Careers API",
    "DESCRIPTION": "Implemented subset of docs/engineering/openapi/openapi.yaml (Phase 1 foundation).",
    "VERSION": "1.0.0-phase1",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
    "OAS_VERSION": "3.1.0",
    "ENUM_NAME_OVERRIDES": {
        "AccountStatusEnum": "accounts.models.AccountStatus",
        "ExperienceLevelEnum": "opportunities.models.ExperienceLevel",
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
