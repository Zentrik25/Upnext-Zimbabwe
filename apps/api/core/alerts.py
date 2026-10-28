"""The alert catalogue (P5-05). `evaluate()` returns what is wrong right now; `notify()` tells a person.

Nothing here invents a channel: alerts always go to the structured log (`alert.fired`) and, only when the
operator sets `UPNEXT_ALERT_WEBHOOK_URL`, to that HTTPS endpoint as a small JSON document with no personal
data. Who receives them is an owner decision (OQ-26) and is not configured.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import socket
import ssl
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from django.db import connection
from django.utils import timezone

logger = logging.getLogger("upnext.alerts")

CRITICAL, WARNING = "critical", "warning"


@dataclass(frozen=True)
class Alert:
    code: str
    severity: str
    message: str
    runbook: str  # section in docs/engineering/MONITORING_AND_ALERTING.md


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def evaluate(now: datetime | None = None) -> list[Alert]:
    from accounts.models import StaffRoleAssignment
    from audit.models import AuditEvent
    from core.models import JobRun
    from notifications.models import OutboxStatus
    from notifications.services import status_summary

    now = now or timezone.now()
    found: list[Alert] = []

    summary = status_summary(now)
    if summary["counts"].get(OutboxStatus.DEAD, 0):
        found.append(
            Alert(
                "mail.dead",
                CRITICAL,
                f"{summary['counts'][OutboxStatus.DEAD]} dead e-mail message(s)",
                "mail",
            )
        )
    age = summary["oldest_waiting_seconds"]
    if age is not None and age > 600:
        found.append(Alert("mail.stuck", CRITICAL, f"oldest waiting e-mail is {int(age)} s old", "mail"))

    expected = {x for x in os.environ.get("UPNEXT_ALERTS_EXPECT_JOBS", "").split(",") if x}
    limits = {"worker": 120, "housekeeping": 900, "expiry": 900}
    rows = {r.name: r for r in JobRun.objects.filter(name__in=[*limits, "backup", "restore"])}
    for name, seconds in limits.items():
        row = rows.get(name)
        if row is None:
            if name in expected:
                found.append(
                    Alert(f"job.{name}_missing", CRITICAL, f"no {name} run has ever been recorded", "worker")
                )
            continue
        if row.last_status == "failed":
            found.append(Alert(f"job.{name}_failed", CRITICAL, f"the last {name} run failed", "worker"))
        if row.last_finished_at is None or (now - row.last_finished_at).total_seconds() > seconds:
            found.append(
                Alert(f"job.{name}_stale", CRITICAL, f"no {name} run for over {seconds} s", "worker")
            )

    if os.environ.get("UPNEXT_BACKUP_EXPECTED") == "1":
        backup = rows.get("backup")
        max_age = _env_int("UPNEXT_BACKUP_MAX_AGE_HOURS", 26)
        if backup is None or backup.last_ok_at is None:
            found.append(
                Alert("backup.never_ok", CRITICAL, "no successful backup has been recorded", "backup")
            )
        elif now - backup.last_ok_at > timedelta(hours=max_age):
            found.append(
                Alert("backup.stale", CRITICAL, f"last successful backup is older than {max_age} h", "backup")
            )
        if backup is not None and backup.last_status == "ok" and "offsite=no" in backup.last_detail:
            found.append(
                Alert("backup.local_only", WARNING, "the last backup was not copied off the server", "backup")
            )
        if backup is not None and backup.last_status == "failed":
            found.append(Alert("backup.failed", CRITICAL, "the last backup run failed", "backup"))

    restore = rows.get("restore")
    if (
        restore is not None
        and restore.last_finished_at
        and now - restore.last_finished_at < timedelta(hours=24)
    ):
        found.append(
            Alert("restore.performed", WARNING, "a restore was recorded in the last 24 hours", "restore")
        )

    window = now - timedelta(minutes=15)
    failures = AuditEvent.objects.filter(action="auth.login_failed", occurred_at__gte=window).count()
    if failures >= _env_int("UPNEXT_ALERT_LOGIN_FAILURES", 50):
        found.append(
            Alert("auth.login_failures", WARNING, f"{failures} failed sign-ins in 15 minutes", "auth")
        )
    mfa = AuditEvent.objects.filter(action="staff.mfa_failed", occurred_at__gte=window).count()
    if mfa >= _env_int("UPNEXT_ALERT_MFA_FAILURES", 5):
        found.append(
            Alert(
                "auth.mfa_failures", CRITICAL, f"{mfa} failed staff second-step checks in 15 minutes", "auth"
            )
        )

    day = now - timedelta(hours=24)
    changes = (
        StaffRoleAssignment.objects.filter(granted_at__gte=day).count()
        + StaffRoleAssignment.objects.filter(revoked_at__gte=day).count()
    )
    if changes:
        found.append(
            Alert("staff.role_changed", WARNING, f"{changes} staff role change(s) in 24 hours", "staff")
        )

    for path in [p for p in os.environ.get("UPNEXT_ALERT_DISK_PATHS", "/").split(",") if p]:
        try:
            usage = shutil.disk_usage(path)
        except OSError:
            continue
        used = 100 * usage.used / usage.total if usage.total else 0
        if used >= _env_int("UPNEXT_ALERT_DISK_PERCENT", 85):
            found.append(Alert("disk.low", CRITICAL, f"{path} is {used:.0f}% full", "capacity"))

    limit = _env_int("UPNEXT_ALERT_DB_BYTES", 0)  # 0 = off until the real capacity is known (OQ-10)
    if limit:
        with connection.cursor() as cur:
            cur.execute("SELECT pg_database_size(current_database())")
            size = cur.fetchone()[0]
        if size >= limit:
            found.append(Alert("db.size", WARNING, f"database is {size // 1_048_576} MiB", "capacity"))

    host = os.environ.get("UPNEXT_ALERT_CERT_HOST", "")  # host:port of the public front
    if host:
        found.extend(_certificate_alerts(host, now))
    return found


def _certificate_alerts(host: str, now: datetime) -> list[Alert]:
    name, _, port = host.partition(":")
    try:
        ctx = ssl.create_default_context(cafile=os.environ.get("UPNEXT_ALERT_CERT_CA") or None)
        with (
            socket.create_connection((name, int(port or 443)), timeout=10) as raw,
            ctx.wrap_socket(raw, server_hostname=name) as s,
        ):
            cert = s.getpeercert()
        expires = datetime.strptime(str((cert or {})["notAfter"]), "%b %d %H:%M:%S %Y %Z").replace(tzinfo=UTC)
    except (OSError, ssl.SSLError, KeyError, ValueError) as e:
        return [
            Alert("cert.unreadable", CRITICAL, f"certificate check failed: {type(e).__name__}", "certificate")
        ]
    days = (expires - now).days
    if days < 7:
        return [Alert("cert.expiring", CRITICAL, f"certificate expires in {days} day(s)", "certificate")]
    if days < 30:
        return [Alert("cert.expiring", WARNING, f"certificate expires in {days} day(s)", "certificate")]
    return []


def notify(alerts: list[Alert], *, opener: Any = urllib.request.urlopen) -> bool:
    """Log every alert; POST them to the configured webhook. Returns True when nothing failed to deliver."""
    for a in alerts:
        logger.warning(
            "alert",
            extra={
                "event": "alert.fired",
                "code": a.code,
                "severity": a.severity,
                "detail": a.message,
                "runbook": a.runbook,
            },
        )
    url = os.environ.get("UPNEXT_ALERT_WEBHOOK_URL", "")
    if not alerts or not url:
        return True
    if not url.startswith("https://") and os.environ.get("UPNEXT_ENVIRONMENT") == "production":
        logger.error("alert webhook must be https", extra={"event": "alert.webhook_refused"})
        return False
    if not url.startswith(("https://", "http://")):
        logger.error("alert webhook must be http(s)", extra={"event": "alert.webhook_refused"})
        return False
    body = json.dumps({"service": "upnext", "alerts": [asdict(a) for a in alerts]}).encode()
    req = urllib.request.Request(  # noqa: S310 - the scheme is checked above
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with opener(req, timeout=10) as r:
            return bool(200 <= r.status < 300)
    except OSError:
        logger.error("alert webhook failed", extra={"event": "alert.webhook_failed"})
        return False


class Debouncer:
    """Notify when an alert first fires, then again only after `repeat` has passed (no flood every cycle)."""

    def __init__(self, repeat: timedelta | None = None) -> None:
        self.repeat = repeat or timedelta(hours=_env_int("UPNEXT_ALERT_REPEAT_HOURS", 6))
        self._last: dict[str, datetime] = {}

    def due(self, firing: list[Alert], now: datetime | None = None) -> list[Alert]:
        now = now or timezone.now()
        current = {a.code for a in firing}
        for code in list(self._last):
            if code not in current:
                del self._last[code]  # resolved: a later recurrence notifies again
        out = []
        for a in firing:
            last = self._last.get(a.code)
            if last is None or now - last >= self.repeat:
                self._last[a.code] = now
                out.append(a)
        return out
