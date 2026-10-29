"""measure-restore.sh and restore.sh (B-07) with stub PostgreSQL clients: no database or network is involved.

openssl is real, so the encryption, the keyed MAC and the tamper refusal are the production ones. The stubs record
what the scripts asked of PostgreSQL (createdb, pg_restore, dropdb) so cleanup after failures can be asserted."""

import base64
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

BACKUP_DIR = Path(__file__).resolve().parents[3] / "infrastructure" / "backup"
BASH = shutil.which("bash") or "/bin/bash"
OPENSSL = shutil.which("openssl") or "/usr/bin/openssl"

pytestmark = pytest.mark.skipif(not shutil.which("openssl"), reason="openssl is required")


def _key_bytes() -> bytes:
    """A 48-byte passphrase without line breaks: `openssl -pass file:` reads only the first line, so raw random
    bytes occasionally produced an empty or truncated passphrase and a flaky failure."""
    return base64.b64encode(os.urandom(36))


def _stub(path: Path, body: str) -> None:
    path.write_text(f"#!{BASH}\n{body}\n")
    path.chmod(0o755)


class Rig:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.bin = root / "bin"
        self.bin.mkdir()
        self.calls = root / "calls.log"
        self.key = root / "key"
        self.key.write_bytes(_key_bytes())
        self.backup = root / "upnext-1.dump.enc"
        self.report = root / "report.json"
        _stub(self.bin / "createdb", 'echo "createdb $*" >> "$CALLS"')
        _stub(self.bin / "dropdb", 'echo "dropdb $*" >> "$CALLS"')
        _stub(self.bin / "psql", "echo 42")
        _stub(self.bin / "pg_restore", 'cat > /dev/null; echo "pg_restore $*" >> "$CALLS"')

    def make_backup(self, payload: bytes = b"PGDMP-fake-dump" * 50) -> None:
        enc = subprocess.run(
            [
                OPENSSL,
                "enc",
                "-aes-256-cbc",
                "-pbkdf2",
                "-iter",
                "600000",
                "-salt",
                "-pass",
                f"file:{self.key}",
            ],
            input=payload,
            capture_output=True,
            check=True,
        ).stdout
        self.backup.write_bytes(enc)
        self.write_mac(self.key)

    def write_mac(self, key: Path) -> None:
        secret = base64.b64encode(key.read_bytes()).decode()
        mac = subprocess.run(
            [OPENSSL, "dgst", "-sha256", "-hmac", secret, "-r", str(self.backup)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.split()[0]
        Path(f"{self.backup}.mac").write_text(mac + "\n")

    def run(self, **extra: str) -> subprocess.CompletedProcess[str]:
        env = {
            **os.environ,
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "CALLS": str(self.calls),
            "UPNEXT_BACKUP_KEY_FILE": str(self.key),
            **extra,
        }
        return subprocess.run(
            [
                BASH,
                str(BACKUP_DIR / "measure-restore.sh"),
                str(self.backup),
                "restore_target",
                str(self.report),
            ],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def calls_text(self) -> str:
        return self.calls.read_text() if self.calls.exists() else ""

    def record(self) -> dict[str, object]:
        data: dict[str, object] = json.loads(self.report.read_text())
        return data


@pytest.fixture
def rig(tmp_path: Path) -> Rig:
    return Rig(tmp_path)


def test_successful_restore_writes_a_complete_record(rig: Rig) -> None:
    rig.make_backup()
    result = rig.run(UPNEXT_RESTORE_SOURCE="offsite")
    assert result.returncode == 0, result.stderr
    rec = rig.record()
    assert rec["status"] == "restored"
    assert rec["source"] == "offsite"
    assert rec["public_tables"] == 42
    assert rec["backup_bytes"] == rig.backup.stat().st_size
    assert rec["within_rto"] is True
    assert "createdb restore_target" in rig.calls_text()
    assert "dropdb" not in rig.calls_text()


def test_exceeding_the_rto_is_reported_not_hidden(rig: Rig) -> None:
    rig.make_backup()
    _stub(rig.bin / "pg_restore", "cat > /dev/null; sleep 2")
    result = rig.run(UPNEXT_RTO_SECONDS="1", UPNEXT_RESTORE_TIMEOUT_SECONDS="10")
    assert result.returncode == 0
    assert rig.record()["within_rto"] is False


@pytest.mark.parametrize("name", ["UPNEXT_RTO_SECONDS", "UPNEXT_RESTORE_TIMEOUT_SECONDS"])
@pytest.mark.parametrize("value", ["-1", "0", "abc", ""])
def test_invalid_limits_are_refused_before_restoring(rig: Rig, name: str, value: str) -> None:
    rig.make_backup()
    result = rig.run(**{name: value})
    if value == "":
        assert result.returncode == 0  # empty falls back to the default
        return
    assert result.returncode == 2
    assert rig.calls_text() == ""


def test_altered_backup_is_refused_before_any_database_is_created(rig: Rig) -> None:
    rig.make_backup()
    data = bytearray(rig.backup.read_bytes())
    data[40] ^= 0xFF
    rig.backup.write_bytes(bytes(data))
    result = rig.run()
    assert result.returncode != 0
    assert rig.record()["status"] == "failed"
    assert "authentication" in result.stderr
    assert rig.calls_text() == ""


def test_wrong_key_is_refused(rig: Rig) -> None:
    rig.make_backup()
    rig.key.write_bytes(_key_bytes())
    result = rig.run()
    assert result.returncode != 0
    assert rig.record()["status"] == "failed"
    assert rig.calls_text() == ""


def test_missing_mac_file_is_refused(rig: Rig) -> None:
    rig.make_backup()
    Path(f"{rig.backup}.mac").unlink()
    result = rig.run()
    assert result.returncode != 0
    assert rig.record()["status"] == "failed"


def test_missing_backup_file_still_produces_a_failed_record(rig: Rig) -> None:
    result = rig.run()
    assert result.returncode != 0
    rec = rig.record()
    assert rec["status"] == "failed"
    assert rec["backup_bytes"] == 0
    assert rec["within_rto"] is False


def test_valid_mac_but_undecryptable_payload_drops_the_partial_database(rig: Rig) -> None:
    rig.make_backup()
    rig.backup.write_bytes(b"not an openssl stream at all" * 10)
    rig.write_mac(rig.key)
    result = rig.run()
    assert result.returncode != 0
    assert rig.record()["status"] == "failed"
    calls = rig.calls_text()
    assert "createdb restore_target" in calls
    assert "dropdb --if-exists restore_target" in calls


def test_pg_restore_failure_drops_the_partial_database(rig: Rig) -> None:
    rig.make_backup()
    _stub(rig.bin / "pg_restore", "cat > /dev/null; exit 1")
    result = rig.run()
    assert result.returncode != 0
    assert rig.record()["status"] == "failed"
    assert "dropdb --if-exists restore_target" in rig.calls_text()


def test_stuck_restore_times_out_and_is_cleaned_up(rig: Rig) -> None:
    rig.make_backup()
    _stub(rig.bin / "pg_restore", "cat > /dev/null; sleep 30")
    result = rig.run(UPNEXT_RESTORE_TIMEOUT_SECONDS="2")
    assert result.returncode != 0
    assert rig.record()["status"] == "timeout"
    assert "dropdb --if-exists restore_target" in rig.calls_text()


def test_the_key_never_appears_in_output_or_record(rig: Rig) -> None:
    rig.make_backup()
    result = rig.run()
    secret = rig.key.read_bytes().hex()
    assert secret not in result.stdout + result.stderr + rig.report.read_text()
