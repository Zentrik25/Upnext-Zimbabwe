"""Monitoring, alerting and restore helpers (P5-04, P5-05)."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from accounts import deletion
from accounts.management.commands.reapply_deletions import parse_ids
from accounts.models import AccountStatus, User
from audit.models import AuditEvent
from core import alerts
from core.logging import redact_text
from core.models import JobRun
from notifications.models import EmailOutbox, OutboxStatus


def codes(**env: str) -> set[str]:
    return {a.code for a in alerts.evaluate()}


def test_nothing_fires_on_a_quiet_system(db: None) -> None:
    assert alerts.evaluate() == []


def test_dead_mail_and_stuck_mail_fire(db: None, make_user: Any) -> None:
    user = make_user()
    EmailOutbox.objects.create(
        kind="account_verification_v1",
        to_address="x@example.org",
        user=user,
        status=OutboxStatus.DEAD,
        payload={},
        idempotency_key="dead-1",
    )
    row = EmailOutbox.objects.create(
        kind="account_verification_v1",
        to_address="y@example.org",
        user=user,
        status=OutboxStatus.PENDING,
        payload={},
        idempotency_key="pending-1",
    )
    EmailOutbox.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(hours=1))
    assert {"mail.dead", "mail.stuck"} <= codes()


def test_a_missing_or_stale_worker_fires_only_when_expected(
    db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert "job.worker_missing" not in codes()
    monkeypatch.setenv("UPNEXT_ALERTS_EXPECT_JOBS", "worker,housekeeping")
    assert {"job.worker_missing", "job.housekeeping_missing"} <= codes()
    JobRun.record("worker")
    JobRun.record("housekeeping")
    assert not codes() & {"job.worker_missing", "job.worker_stale"}
    JobRun.objects.filter(name="worker").update(last_finished_at=timezone.now() - timedelta(minutes=10))
    assert "job.worker_stale" in codes()
    JobRun.record("housekeeping", ok=False, detail="boom")
    assert "job.housekeeping_failed" in codes()


def test_backup_alerts(db: None, monkeypatch: pytest.MonkeyPatch) -> None:
    assert not codes() & {"backup.never_ok"}  # not expected on this system
    monkeypatch.setenv("UPNEXT_BACKUP_EXPECTED", "1")
    assert "backup.never_ok" in codes()
    JobRun.record("backup", detail="file=a offsite=no")
    assert "backup.never_ok" not in codes()
    assert "backup.local_only" in codes()
    JobRun.record("backup", detail="file=a offsite=yes")
    assert "backup.local_only" not in codes()
    JobRun.objects.filter(name="backup").update(last_ok_at=timezone.now() - timedelta(hours=30))
    assert "backup.stale" in codes()
    JobRun.record("backup", ok=False, detail="x")
    assert "backup.failed" in codes()


def test_security_signals(db: None, make_user: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPNEXT_ALERT_LOGIN_FAILURES", "3")
    monkeypatch.setenv("UPNEXT_ALERT_MFA_FAILURES", "2")
    for _ in range(3):
        AuditEvent.objects.create(actor_type="anonymous", action="auth.login_failed", object_type="session")
    for _ in range(2):
        AuditEvent.objects.create(actor_type="user", action="staff.mfa_failed", object_type="user")
    assert {"auth.login_failures", "auth.mfa_failures"} <= codes()


def test_a_staff_role_change_is_reported(db: None, make_user: Any) -> None:
    from accounts.models import StaffRoleAssignment

    StaffRoleAssignment.objects.create(user=make_user(), role="editor", reason="test")
    assert "staff.role_changed" in codes()


def test_disk_and_database_thresholds(db: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPNEXT_ALERT_DISK_PERCENT", "1")
    monkeypatch.setenv("UPNEXT_ALERT_DB_BYTES", "1")
    assert {"disk.low", "db.size"} <= codes()


def test_a_restore_record_is_a_warning(db: None) -> None:
    JobRun.record("restore", detail="rehearsal")
    assert "restore.performed" in codes()


def test_the_debouncer_notifies_once_then_after_the_repeat_period() -> None:
    d = alerts.Debouncer(repeat=timedelta(hours=6))
    a = alerts.Alert("x", alerts.CRITICAL, "m", "r")
    now = timezone.now()
    assert d.due([a], now) == [a]
    assert d.due([a], now + timedelta(hours=1)) == []
    assert d.due([a], now + timedelta(hours=7)) == [a]
    assert d.due([], now) == []
    assert d.due([a], now) == [a]  # resolved, then recurring: tell people again


class FakeResponse:
    status = 204

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *a: object) -> None:
        return None


def test_notify_logs_and_posts_only_the_alert_fields(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    sent: dict[str, Any] = {}

    def opener(req: Any, timeout: float) -> FakeResponse:
        sent["url"], sent["body"] = req.full_url, json.loads(req.data)
        return FakeResponse()

    monkeypatch.setenv("UPNEXT_ALERT_WEBHOOK_URL", "https://hooks.example.invalid/abc")
    a = alerts.Alert("mail.dead", alerts.CRITICAL, "1 dead e-mail message(s)", "mail")
    with caplog.at_level(logging.WARNING, logger="upnext.alerts"):
        assert alerts.notify([a], opener=opener) is True
    assert sent["url"] == "https://hooks.example.invalid/abc"
    assert sent["body"] == {
        "service": "upnext",
        "alerts": [
            {
                "code": "mail.dead",
                "severity": "critical",
                "message": "1 dead e-mail message(s)",
                "runbook": "mail",
            }
        ],
    }
    assert any(getattr(r, "event", "") == "alert.fired" for r in caplog.records)


def test_notify_reports_a_delivery_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def opener(req: Any, timeout: float) -> FakeResponse:
        raise OSError("down")

    monkeypatch.setenv("UPNEXT_ALERT_WEBHOOK_URL", "https://hooks.example.invalid/abc")
    assert alerts.notify([alerts.Alert("x", "warning", "m", "r")], opener=opener) is False


def test_production_refuses_a_plain_http_webhook(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UPNEXT_ALERT_WEBHOOK_URL", "http://hooks.example.invalid/abc")
    monkeypatch.setenv("UPNEXT_ENVIRONMENT", "production")
    called: list[object] = []
    assert (
        alerts.notify([alerts.Alert("x", "warning", "m", "r")], opener=lambda *a, **k: called.append(1))
        is False
    )
    assert called == []


def test_check_alerts_exits_non_zero_when_something_fires(db: None) -> None:
    call_command("check_alerts")  # quiet: no exception
    JobRun.record("restore", detail="x")
    with pytest.raises(CommandError):
        call_command("check_alerts")


def test_alert_and_log_text_carry_no_personal_data() -> None:
    line = redact_text("alert for someone@example.org token=abc123 password=hunter2")
    assert "someone@example.org" not in line and "abc123" not in line and "hunter2" not in line


def test_record_job_keeps_one_bounded_row_per_job(db: None) -> None:
    for _ in range(3):
        call_command("record_job", "backup", "--detail", "x" * 500)
    row = JobRun.objects.get(name="backup")
    assert JobRun.objects.filter(name="backup").count() == 1
    assert row.runs == 3 and len(row.last_detail) == 200


# --- restore helpers -----------------------------------------------------------------------------------------------


def test_restore_check_describes_and_compares(
    db: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    call_command("restore_check", "--json")
    report = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert "accounts_user" in report["counts"] and "django_session" not in report["counts"]
    f = tmp_path / "source.json"
    f.write_text(json.dumps(report))
    call_command("restore_check", "--expect", str(f))
    report["counts"]["accounts_user"] += 1
    f.write_text(json.dumps(report))
    with pytest.raises(CommandError, match="accounts_user"):
        call_command("restore_check", "--expect", str(f))


def test_restore_check_smoke_answers_the_public_paths(db: None) -> None:
    call_command("restore_check", "--smoke")


def test_parse_ids_reads_log_lines_and_plain_ids() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    text = "\n".join(
        [
            json.dumps({"event": "account.deletion_completed", "user_id": str(a)}),
            json.dumps({"event": "other", "user_id": str(uuid.uuid4())}),
            "not json {",
            str(b),
            str(a),
            "garbage",
            "",
        ]
    )
    assert parse_ids(text) == [a, b]


def test_reapplying_a_deletion_removes_a_resurrected_account_without_mail(
    db: None, make_user: Any, tmp_path: Path
) -> None:
    user = make_user()  # as if restored from a backup taken before the person was deleted
    assert user.deleted_at is None and user.deletion_requested_at is None
    EmailOutbox.objects.all().delete()
    log = tmp_path / "deletions.log"
    log.write_text(json.dumps({"event": "account.deletion_completed", "user_id": str(user.pk)}) + "\n")
    call_command("reapply_deletions", str(log))
    user.refresh_from_db()
    assert user.deleted_at is not None
    assert user.status == AccountStatus.DEACTIVATED and not user.has_usable_password()
    assert user.email.endswith("@deleted.invalid")
    assert EmailOutbox.objects.count() == 0, "no second completion e-mail"
    assert AuditEvent.objects.filter(action="account.deletion_reapplied", object_id=user.pk).exists()
    call_command("reapply_deletions", str(log))  # idempotent


def test_reapply_dry_run_changes_nothing(db: None, make_user: Any, tmp_path: Path) -> None:
    user = make_user()
    log = tmp_path / "ids.txt"
    log.write_text(str(user.pk))
    call_command("reapply_deletions", str(log), "--dry-run")
    user.refresh_from_db()
    assert user.deleted_at is None


def test_reapplying_never_deletes_a_staff_member(db: None, make_user: Any, tmp_path: Path) -> None:
    from accounts.models import StaffRoleAssignment

    user = make_user()
    StaffRoleAssignment.objects.create(user=user, role="editor", reason="t")
    assert deletion.execute(user.pk, restored=True) is False
    assert User.objects.get(pk=user.pk).deleted_at is None


def test_the_worker_records_its_jobs(db: None) -> None:
    call_command("run_worker", "--once")
    names = set(JobRun.objects.values_list("name", flat=True))
    assert {"worker", "housekeeping"} <= names
