"""Operational state shared by every module (P5-05)."""

from __future__ import annotations

from django.db import models
from django.utils import timezone


class JobRun(models.Model):
    """The last run of each background job: one bounded row per job name, never a history.

    `detail` is a short machine note (counts, a file name). It must not hold personal data.
    """

    name = models.CharField(max_length=48, unique=True)
    last_started_at = models.DateTimeField(null=True, blank=True)
    last_finished_at = models.DateTimeField(null=True, blank=True)
    last_ok_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=8, default="ok")  # ok | failed
    last_detail = models.CharField(max_length=200, blank=True, default="")
    runs = models.PositiveIntegerField(default=0)
    failures = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "core_jobrun"

    def __str__(self) -> str:
        return f"{self.name}: {self.last_status}"

    @classmethod
    def record(cls, name: str, *, ok: bool = True, detail: str = "", started_at=None) -> None:  # type: ignore[no-untyped-def]
        now = timezone.now()
        row, _ = cls.objects.get_or_create(name=name)
        row.last_started_at = started_at or now
        row.last_finished_at = now
        row.last_status = "ok" if ok else "failed"
        row.last_detail = detail[:200]
        row.runs += 1
        if ok:
            row.last_ok_at = now
        else:
            row.failures += 1
        row.save()
