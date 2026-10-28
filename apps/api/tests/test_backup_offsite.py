"""The off-server copy script (B-07): verified copies, refusals. No provider or network is involved."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

BASH = shutil.which("bash") or "/bin/bash"
SCRIPT = Path(__file__).resolve().parents[3] / "infrastructure" / "backup" / "offsite.sh"


def run(file: Path, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [BASH, str(SCRIPT), str(file)],
        env={**os.environ, **env},
        capture_output=True,
        text=True,
        check=False,
    )


def test_dir_target_copy_is_verified_and_identical(tmp_path: Path) -> None:
    src, dest = tmp_path / "upnext-1.dump.enc", tmp_path / "remote"
    dest.mkdir()
    src.write_bytes(b"\x00encrypted\xff" * 100)
    result = run(src, UPNEXT_OFFSITE_KIND="dir", UPNEXT_OFFSITE_TARGET=str(dest))
    assert result.returncode == 0, result.stderr
    assert (dest / src.name).read_bytes() == src.read_bytes()
    assert not list(dest.glob("*.part"))


def test_missing_target_fails_so_the_backup_is_not_reported_offsite(tmp_path: Path) -> None:
    src = tmp_path / "b.dump.enc"
    src.write_bytes(b"x")
    result = run(src, UPNEXT_OFFSITE_KIND="dir", UPNEXT_OFFSITE_TARGET=str(tmp_path / "nope"))
    assert result.returncode == 4


@pytest.mark.parametrize(
    "env", [{}, {"UPNEXT_OFFSITE_KIND": "dir"}, {"UPNEXT_OFFSITE_KIND": "ftp", "UPNEXT_OFFSITE_TARGET": "x"}]
)
def test_unconfigured_or_unknown_kind_refuses(tmp_path: Path, env: dict[str, str]) -> None:
    src = tmp_path / "b.dump.enc"
    src.write_bytes(b"x")
    clean = {k: v for k, v in os.environ.items() if not k.startswith("UPNEXT_OFFSITE")}
    result = subprocess.run(
        [BASH, str(SCRIPT), str(src)], env={**clean, **env}, capture_output=True, text=True, check=False
    )
    assert result.returncode != 0
