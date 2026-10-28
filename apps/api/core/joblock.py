"""One run at a time for a background job, across every worker process (M1, A-02).

A PostgreSQL session-level advisory lock: it never waits, it vanishes with the connection (so a crashed
worker cannot leave a job blocked), and it needs no table. It is not meant for use through a
transaction-pooling proxy; the Compose stack connects directly.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager

from django.db import connection


def lock_key(name: str) -> int:
    """A stable signed 64-bit key for a job name (the same in every process and release)."""
    digest = hashlib.blake2b(f"upnext:job:{name}".encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big", signed=True)


@contextmanager
def job_lock(name: str) -> Iterator[bool]:
    """Yield True when this process now holds the job's lock, False when another run already holds it."""
    key = lock_key(name)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [key])
        row = cursor.fetchone()
    acquired = bool(row and row[0])
    try:
        yield acquired
    finally:
        if acquired:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [key])
