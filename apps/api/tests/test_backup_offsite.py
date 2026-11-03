"""The off-server copy script (B-07): verified copies, refusals. No provider or network is involved."""

import os
import secrets
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


SECRET = secrets.token_hex(12)


def _tool(bindir: Path, name: str, body: str) -> None:
    bindir.mkdir(exist_ok=True)
    path = bindir / name
    path.write_text(f"#!{BASH}\n{body}\n")
    path.chmod(0o755)


def run_with_tools(file: Path, bindir: Path, **env: str) -> subprocess.CompletedProcess[str]:
    return run(file, PATH=f"{bindir}:{os.environ['PATH']}", **env)


def test_target_with_embedded_credentials_is_refused_without_echoing_them(tmp_path: Path) -> None:
    src = tmp_path / "b.dump.enc"
    src.write_bytes(b"x")
    target = f"https://user:{SECRET}@storage.invalid/bucket"
    result = run(src, UPNEXT_OFFSITE_KIND="rclone", UPNEXT_OFFSITE_TARGET=target)
    assert result.returncode == 6
    assert SECRET not in result.stdout + result.stderr


def test_failing_copy_tool_never_leaks_its_output(tmp_path: Path) -> None:
    src = tmp_path / "b.dump.enc"
    src.write_bytes(b"x")
    bindir = tmp_path / "bin"
    _tool(bindir, "rclone", f'echo "auth error token={SECRET} remote:bucket" >&2; exit 3')
    result = run_with_tools(src, bindir, UPNEXT_OFFSITE_KIND="rclone", UPNEXT_OFFSITE_TARGET="remote:bucket")
    assert result.returncode == 7
    assert SECRET not in result.stdout + result.stderr


def test_rclone_success_requires_matching_read_back(tmp_path: Path) -> None:
    src = tmp_path / "b.dump.enc"
    src.write_bytes(b"payload")
    bindir = tmp_path / "bin"
    _tool(bindir, "rclone", f'case "$1" in copyto) exit 0;; cat) cat "{src}";; esac')
    ok = run_with_tools(src, bindir, UPNEXT_OFFSITE_KIND="rclone", UPNEXT_OFFSITE_TARGET="remote:bucket")
    assert ok.returncode == 0, ok.stderr
    _tool(bindir, "rclone", 'case "$1" in copyto) exit 0;; cat) printf corrupted;; esac')
    bad = run_with_tools(src, bindir, UPNEXT_OFFSITE_KIND="rclone", UPNEXT_OFFSITE_TARGET="remote:bucket")
    assert bad.returncode == 5


def test_rsync_difference_on_verification_fails(tmp_path: Path) -> None:
    src = tmp_path / "b.dump.enc"
    src.write_bytes(b"payload")
    bindir = tmp_path / "bin"
    _tool(bindir, "rsync", 'case "$*" in *--dry-run*) echo ">fc.... b.dump.enc";; esac')
    result = run_with_tools(src, bindir, UPNEXT_OFFSITE_KIND="rsync", UPNEXT_OFFSITE_TARGET="h:/p/")
    assert result.returncode == 5
    _tool(bindir, "rsync", "exit 0")
    assert (
        run_with_tools(src, bindir, UPNEXT_OFFSITE_KIND="rsync", UPNEXT_OFFSITE_TARGET="h:/p/").returncode
        == 0
    )


def test_missing_backup_file_fails(tmp_path: Path) -> None:
    assert (
        run(tmp_path / "gone", UPNEXT_OFFSITE_KIND="dir", UPNEXT_OFFSITE_TARGET=str(tmp_path)).returncode == 2
    )
