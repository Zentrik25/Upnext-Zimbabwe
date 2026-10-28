"""Guards of the deployment scripts: they must refuse without the explicit final authorisation (no VPS involved)."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

DEPLOY = Path(__file__).resolve().parents[3] / "infrastructure" / "deploy"
BASH = shutil.which("bash") or "/bin/bash"


def run(script: str, **env: str) -> subprocess.CompletedProcess[str]:
    clean = {k: v for k, v in os.environ.items() if not k.startswith("UPNEXT_")}
    return subprocess.run(
        [BASH, str(DEPLOY / script)], env={**clean, **env}, capture_output=True, text=True, check=False
    )


@pytest.mark.parametrize("script", ["release.sh", "rollback.sh"])
def test_refuse_without_the_final_authorisation(script: str) -> None:
    result = run(script, UPNEXT_ENV_FILE="/nonexistent", UPNEXT_RELEASE="x")
    assert result.returncode == 2
    assert "refused" in result.stderr


@pytest.mark.parametrize("script", ["release.sh", "rollback.sh"])
def test_confirmation_must_be_the_exact_domain(script: str) -> None:
    assert run(script, UPNEXT_DEPLOY_CONFIRM="yes").returncode == 2
    assert run(script, UPNEXT_DEPLOY_CONFIRM="www.upnext.co.zw").returncode == 2


def test_release_refuses_a_missing_env_file_and_bad_release_names(tmp_path: Path) -> None:
    ok = {"UPNEXT_DEPLOY_CONFIRM": "upnext.co.zw"}
    assert (
        run("release.sh", **ok, UPNEXT_ENV_FILE=str(tmp_path / "none"), UPNEXT_RELEASE="r1").returncode == 2
    )
    env = tmp_path / "env"
    env.write_text("")
    assert run("release.sh", **ok, UPNEXT_ENV_FILE=str(env), UPNEXT_RELEASE="r 1; rm -rf /").returncode == 2


def test_rollback_refuses_without_a_recorded_previous_release(tmp_path: Path) -> None:
    result = run("rollback.sh", UPNEXT_DEPLOY_CONFIRM="upnext.co.zw", UPNEXT_STATE_DIR=str(tmp_path))
    assert result.returncode == 2
    assert "no previous release" in result.stderr


def test_every_script_has_valid_syntax_and_changes_nothing_by_default() -> None:
    for path in DEPLOY.glob("*.sh"):
        assert subprocess.run([BASH, "-n", str(path)], check=False).returncode == 0, path.name
    text = (DEPLOY / "inspect-vps.sh").read_text()
    for forbidden in (
        "docker run",
        "docker rm",
        "docker stop",
        "systemctl",
        " rm ",
        "iptables",
        "docker compose up",
    ):
        assert forbidden not in text, forbidden
