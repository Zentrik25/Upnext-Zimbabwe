"""Liveness and readiness probes (unversioned; /health/*)."""

from __future__ import annotations

import logging

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.http import HttpRequest, JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

logger = logging.getLogger("upnext.health")


@csrf_exempt  # read-only probes; lets non-GET methods answer 405 instead of a CSRF 403
@require_GET
@never_cache
def live(request: HttpRequest) -> JsonResponse:
    """The process is up. Deliberately does not touch the database."""
    return JsonResponse({"status": "ok"})


@csrf_exempt
@require_GET
@never_cache
def ready(request: HttpRequest) -> JsonResponse:
    """The database answers and every migration is applied. Never leaks configuration."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        executor = MigrationExecutor(connection)
        if executor.migration_plan(executor.loader.graph.leaf_nodes()):
            logger.warning("readiness failed: unapplied migrations")
            return JsonResponse({"status": "unavailable"}, status=503)
    except Exception:
        logger.exception("readiness failed: database check")
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})
