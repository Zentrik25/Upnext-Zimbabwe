# syntax=docker/dockerfile:1.7
# Python 3.14.8 on Debian 13 (trixie), pinned by digest (OQ-28 / PHASE1_VERSION_VERIFICATION.md).
FROM python:3.14.8-slim-trixie@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170 AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN groupadd --system --gid 10001 upnext \
 && useradd --system --uid 10001 --gid upnext --home-dir /app --shell /usr/sbin/nologin upnext
WORKDIR /app
COPY requirements/runtime.txt requirements/runtime.txt
# Optional BuildKit secret `ca_bundle`: a PEM bundle for networks that intercept TLS (never baked into the image).
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -s /run/secrets/ca_bundle ]; then export PIP_CERT=/run/secrets/ca_bundle; fi; \
    pip install --require-hashes -r requirements/runtime.txt

# ---- development / test image (source is bind-mounted by Compose) ----
FROM base AS dev
COPY requirements/dev.txt requirements/dev.txt
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -s /run/secrets/ca_bundle ]; then export PIP_CERT=/run/secrets/ca_bundle; fi; \
    pip install --require-hashes -r requirements/dev.txt
COPY --chown=upnext:upnext . .
USER upnext
EXPOSE 8000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ---- production-style image ----
FROM base AS prod
COPY --chown=upnext:upnext . .
# Build-time placeholders only so `collectstatic` can import settings; no real secret is baked in.
# It must use the production settings: the manifest it writes is what the production storage reads.
# UPNEXT_ENVIRONMENT is set for this one command only (the start-up safeguards need real https settings,
# which do not exist at build time); it is not stored in the image environment.
RUN DJANGO_SETTINGS_MODULE=config.settings.prod UPNEXT_ENVIRONMENT=local-prod-like \
    DJANGO_SECRET_KEY=build-only-placeholder-build-only-placeholder-build-only-placeholder \
    DJANGO_ALLOWED_HOSTS=build UPNEXT_SECURE_COOKIES=true \
    POSTGRES_DB=build POSTGRES_USER=build POSTGRES_PASSWORD=build \
    python manage.py collectstatic --noinput \
 && chown -R upnext:upnext /app/staticfiles
USER upnext
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=2).status == 200 else 1)"]
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
# No gunicorn access log: the JSON request log (core.middleware) records every request without query strings.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "30"]
