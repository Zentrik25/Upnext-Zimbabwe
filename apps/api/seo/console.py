"""Search Console figures for the administrator's SEO page (ADR-0027).

Rules this module keeps:
  - A figure is shown only if Google returned it. When the property, the key or the permission is missing, or Google
    refuses, the answer is a state (`setup_required` or `error`) with the next step, never a made-up or zero number.
  - Four different things stay apart: a notification UPNEXT sent (`indexing`, from our own table), Google accepting it
    (HTTP 200: still not indexing), a page Google reports as indexed (URL Inspection, a small sample only), and search
    performance (impressions, clicks: from Search Analytics, which lags about two days).
  - Results are cached in process for a while, so opening the page does not spend Google's quotas.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.core.cache import caches
from django.utils import timezone

from . import google
from .models import IndexingNotification, NotificationKind, NotificationStatus

logger = logging.getLogger("upnext.searchconsole")
CACHE_KEY = "seo-console-report"
CACHE_SECONDS = 1800
INSPECTION_SAMPLE = 5
DATA_LAG_DAYS = 3  # Search Analytics is final about two days late
WINDOW_DAYS = 28

NEXT_STEPS = {
    "permission": (
        "Google refused access. In Search Console open Settings > Users and permissions for the property and add the "
        "service-account e-mail with at least Restricted access (Owner is needed for the Indexing API)."
    ),
    "auth": "Google did not accept the service-account key. Check that the key was not deleted or rotated.",
    "quota": "Google's quota was reached. Try again later.",
    "not_found": "Search Console does not know this property. Check UPNEXT_SEARCH_CONSOLE_SITE.",
}


def _clients() -> tuple[google.SearchConsoleClient, str]:
    transport = google.default_transport
    credentials = google.load_credentials()
    return google.SearchConsoleClient(
        google.TokenSource(credentials, transport), transport
    ), credentials.client_email


def _setup_required(reason: str, steps: list[str]) -> dict[str, Any]:
    return {"state": "setup_required", "reason": reason, "steps": steps}


def _metrics(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "clicks": int(row.get("clicks", 0)),
        "impressions": int(row.get("impressions", 0)),
        "ctr": float(row.get("ctr", 0.0)),
        "position": round(float(row.get("position", 0.0)), 1),
    }


def _inspection(summary: dict[str, Any], url: str) -> dict[str, Any]:
    index = summary.get("indexStatusResult", {}) or {}
    rich = summary.get("richResultsResult", {}) or {}
    issues: list[str] = []
    for item in rich.get("detectedItems", []) or []:
        for found in item.get("items", []) or []:
            for issue in found.get("issues", []) or []:
                issues.append(
                    f"{item.get('richResultType', 'item')}: {issue.get('issueMessage', 'issue')}"[:200]
                )
    return {
        "url": url,
        "verdict": index.get("verdict"),  # PASS means indexed; this is Google's own report
        "coverage": index.get("coverageState"),
        "last_crawl": index.get("lastCrawlTime"),
        "google_canonical": index.get("googleCanonical"),
        "rich_results_verdict": rich.get("verdict"),
        "rich_results_issues": issues[:10],
    }


def _sample_urls() -> list[str]:
    """The most recent addresses UPNEXT announced as updated (not removed), newest first."""
    rows = (
        IndexingNotification.objects.filter(status=NotificationStatus.SENT, kind=NotificationKind.UPDATED)
        .order_by("-sent_at")
        .values_list("url", flat=True)[: INSPECTION_SAMPLE * 4]
    )
    seen: list[str] = []
    for url in rows:
        if url not in seen:
            seen.append(url)
    return seen[:INSPECTION_SAMPLE]


def build(
    client_factory: Callable[[], tuple[google.SearchConsoleClient, str]] | None = None,
) -> dict[str, Any]:
    site = str(settings.UPNEXT_SEARCH_CONSOLE_SITE or "")
    state, account = google.credentials_status()
    steps = []
    if state != "ok":
        steps.append(
            "Create a Google Cloud service account and supply its key (UPNEXT_GOOGLE_SERVICE_ACCOUNT_FILE)."
            if state == "missing"
            else "The service-account key is configured but cannot be read; check it."
        )
    if not site:
        steps.append(
            'Set UPNEXT_SEARCH_CONSOLE_SITE to the verified property, e.g. "sc-domain:upnext.co.zw".'
        )
    if steps:
        return _setup_required("Search Console is not connected.", steps)
    end = timezone.now().date() - timedelta(days=DATA_LAG_DAYS)
    start = end - timedelta(days=WINDOW_DAYS - 1)
    result: dict[str, Any] = {
        "state": "ready",
        "site": site,
        "service_account": account,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "note": "Search performance lags about three days. It counts Google Search results only.",
    }
    try:
        client, _ = (client_factory or _clients)()
        totals = client.analytics(
            site, start=start.isoformat(), end=end.isoformat(), dimensions=[], row_limit=1
        )
        result["totals"] = (
            _metrics(totals[0]) if totals else {"clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0}
        )
        for name, dimension in (("queries", "query"), ("pages", "page")):
            rows = client.analytics(
                site, start=start.isoformat(), end=end.isoformat(), dimensions=[dimension], row_limit=10
            )
            result[name] = [{"key": r["keys"][0], **_metrics(r)} for r in rows if r.get("keys")]
        result["sitemaps"] = [
            {
                "path": m.get("path"),
                "last_submitted": m.get("lastSubmitted"),
                "last_downloaded": m.get("lastDownloaded"),
                "pending": bool(m.get("isPending")),
                "errors": int(m.get("errors", 0)),
                "warnings": int(m.get("warnings", 0)),
                "submitted": {
                    c.get("type"): int(c.get("submitted", 0))
                    for c in m.get("contents", []) or []
                    if c.get("type")
                },
            }
            for m in client.sitemaps(site)
        ]
        inspections = []
        for url in _sample_urls():
            try:
                inspections.append(_inspection(client.inspect(site, url), url))
            except google.ApiError as exc:  # one address failing must not hide the rest
                inspections.append({"url": url, "error": exc.kind})
        result["inspections"] = inspections
    except google.CredentialsError as exc:
        return _setup_required("Search Console is not connected.", [str(exc)])
    except google.ApiError as exc:
        logger.warning(
            "search console read failed", extra={"event": "searchconsole.failed", "kind": exc.kind}
        )
        return {
            "state": "error",
            "reason": f"Google did not return Search Console data ({exc.kind}).",
            "steps": [NEXT_STEPS.get(exc.kind, "Try again later; if it persists, check the server log.")],
            "service_account": account,
            "site": site,
        }
    return result


def report(
    *, client_factory: Callable[[], tuple[google.SearchConsoleClient, str]] | None = None
) -> dict[str, Any]:
    """The cached Search Console section. Only a `ready` answer is cached for the full period; a failure is
    cached briefly so a broken setup is not retried on every page view."""
    cache = caches["local"]
    cached = cache.get(CACHE_KEY)
    if cached is not None and client_factory is None:
        return cached  # type: ignore[no-any-return]
    data = build(client_factory)
    if client_factory is None:
        cache.set(CACHE_KEY, data, CACHE_SECONDS if data["state"] == "ready" else 120)
    return data
