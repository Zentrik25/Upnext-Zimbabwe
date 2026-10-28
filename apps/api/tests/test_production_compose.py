"""Static validation of infrastructure/compose/compose.production.yaml (B-04/B-08) without a VPS or a daemon.

`docker compose config` only interprets the file. The tests assert the isolation and safety properties promised in
the deployment plan, and boot Django's production settings with the exact environment the file gives the API, so
a start-up safeguard that would refuse the real configuration fails here first."""

import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

COMPOSE_DIR = Path(__file__).resolve().parents[3] / "infrastructure" / "compose"
FILE = COMPOSE_DIR / "compose.production.yaml"
EDGE = COMPOSE_DIR / "compose.production.edge.yaml"
DOCKER = shutil.which("docker")

pytestmark = pytest.mark.skipif(DOCKER is None, reason="docker CLI (compose config) is required")


def _random() -> str:
    return secrets.token_urlsafe(40)


REQUIRED = {
    "POSTGRES_DB": "upnext",
    "POSTGRES_USER": "dbowner",
    "POSTGRES_PASSWORD": _random(),
    "POSTGRES_MIGRATOR_USER": "dbowner",
    "POSTGRES_MIGRATOR_PASSWORD": _random(),
    "DJANGO_SECRET_KEY": _random(),
    "UPNEXT_TOKEN_KEY": _random(),
    "UPNEXT_THROTTLE_PEPPER": _random(),
    "UPNEXT_DB_APP_PASSWORD": _random(),
    "UPNEXT_DB_READONLY_PASSWORD": _random(),
    "UPNEXT_RELEASE": "test",
    "UPNEXT_EDGE_CIDR": "172.18.0.0/16",
    "UPNEXT_BACKUP_KEY_HOST_PATH": "/etc/upnext/backup.key",
}


def compose(
    env: dict[str, str], *args: str, files: tuple[Path, ...] = (FILE,)
) -> subprocess.CompletedProcess[str]:
    assert DOCKER
    cmd = [DOCKER, "compose", "--project-directory", str(COMPOSE_DIR)]
    for f in files:
        cmd += ["-f", str(f)]
    clean = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith(("UPNEXT_", "POSTGRES_", "DJANGO_", "COMPOSE_"))
    }
    return subprocess.run(
        [*cmd, "--profile", "release", "--profile", "backup", *args],
        env={**clean, **env},
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture(scope="module")
def cfg() -> dict[str, Any]:
    result = compose(REQUIRED, "config", "--format", "json")
    assert result.returncode == 0, result.stderr
    data: dict[str, Any] = json.loads(result.stdout)
    return data


def test_project_networks_and_volumes_are_isolated_and_named(cfg: dict[str, Any]) -> None:
    assert cfg["name"] == "upnext-prod"
    assert {n["name"] for n in cfg["networks"].values()} == {
        "upnext-prod-data",
        "upnext-prod-app",
        "upnext-prod-egress",
    }
    assert all(not n.get("external") for n in cfg["networks"].values())
    assert cfg["networks"]["data"]["internal"] is True
    assert sorted(v["name"] for v in cfg["volumes"].values()) == ["upnext-prod-backups", "upnext-prod-pgdata"]
    assert all("container_name" not in s for s in cfg["services"].values())


def test_only_the_proxy_publishes_a_port_and_only_on_loopback(cfg: dict[str, Any]) -> None:
    for name, svc in cfg["services"].items():
        ports = svc.get("ports", [])
        if name != "proxy":
            assert not ports, name
    (port,) = cfg["services"]["proxy"]["ports"]
    assert port["host_ip"] == "127.0.0.1"


def test_database_is_reachable_only_through_the_internal_network(cfg: dict[str, Any]) -> None:
    assert set(cfg["services"]["db"]["networks"]) == {"data"}
    assert "app" not in cfg["services"]["worker"]["networks"]
    assert "egress" not in cfg["services"]["api"]["networks"]


def test_every_service_is_hardened_and_images_are_pinned(cfg: dict[str, Any]) -> None:
    for name, svc in cfg["services"].items():
        assert "no-new-privileges:true" in svc["security_opt"], name
        assert svc["cap_drop"] == ["ALL"], name
        assert svc.get("mem_limit"), name
        assert not svc.get("privileged"), name
        assert not any(
            v["type"] == "bind" and "rw" in str(v.get("read_only", "")) for v in svc.get("volumes", [])
        ), name
    for name in ("db", "proxy"):
        assert "@sha256:" in cfg["services"][name]["image"], name
    for name in ("api", "worker", "web", "migrate", "backup"):
        assert cfg["services"][name]["image"].endswith(":test"), name
        assert "latest" not in cfg["services"][name]["image"], name
    assert cfg["services"]["api"]["build"]["target"] == "prod"
    assert cfg["services"]["web"]["build"]["target"] == "prod"


def test_running_services_never_hold_owner_credentials(cfg: dict[str, Any]) -> None:
    for name in ("api", "worker"):
        env = cfg["services"][name]["environment"]
        assert env["POSTGRES_USER"] == "upnext_app"
        assert "POSTGRES_MIGRATOR_PASSWORD" not in env
        assert REQUIRED["POSTGRES_PASSWORD"] not in json.dumps(cfg["services"][name])
        assert REQUIRED["POSTGRES_MIGRATOR_PASSWORD"] not in json.dumps(cfg["services"][name])
    migrate = cfg["services"]["migrate"]
    assert migrate["environment"]["POSTGRES_USER"] == "dbowner"
    assert migrate["profiles"] == ["release"]


def test_identity_is_the_root_domain_and_the_one_mailbox(cfg: dict[str, Any]) -> None:
    env = cfg["services"]["api"]["environment"]
    assert env["UPNEXT_PUBLIC_BASE_URL"] == "https://upnext.co.zw"
    assert env["DJANGO_ALLOWED_HOSTS"] == "upnext.co.zw"
    assert env["DJANGO_CSRF_TRUSTED_ORIGINS"] == "https://upnext.co.zw"
    mailboxes = {v for k, v in env.items() if "@" in str(v)}
    assert all("info@upnext.co.zw" in v for v in mailboxes)
    assert "www" not in json.dumps(cfg).lower().replace("www.w3.org", "")


def test_nothing_that_production_refuses_is_set(cfg: dict[str, Any]) -> None:
    text = json.dumps(cfg)
    for forbidden in ("UPNEXT_DEMO_TOOLS", "UPNEXT_DEMO_PASSWORD", "local-prod-like", "DJANGO_DEBUG"):
        assert forbidden not in text, forbidden
    env = cfg["services"]["api"]["environment"]
    assert env["UPNEXT_EMAIL_BACKEND"] == "none"  # sending stays off until B-01 and the owner say otherwise
    assert env["UPNEXT_STAFF_MFA_REQUIRED"] == "true"


@pytest.mark.parametrize("missing", sorted(REQUIRED))
def test_a_missing_required_value_is_a_hard_error(missing: str) -> None:
    env = {k: v for k, v in REQUIRED.items() if k != missing}
    result = compose(env, "config", "-q")
    assert result.returncode != 0, missing


def test_edge_overlay_requires_an_existing_named_network_and_drops_the_published_port() -> None:
    assert compose(REQUIRED, "config", "-q", files=(FILE, EDGE)).returncode != 0  # UPNEXT_EDGE_NETWORK unset
    result = compose(
        {**REQUIRED, "UPNEXT_EDGE_NETWORK": "shared-edge"}, "config", "--format", "json", files=(FILE, EDGE)
    )
    assert result.returncode == 0, result.stderr
    merged = json.loads(result.stdout)
    assert merged["networks"]["edge"]["external"] is True
    assert not merged["services"]["proxy"].get("ports")


def test_production_settings_accept_the_environment_the_compose_file_gives_the_api(
    cfg: dict[str, Any],
) -> None:
    env = {k: str(v) for k, v in cfg["services"]["api"]["environment"].items()}
    code = "import django; django.setup(); from django.conf import settings; print(settings.UPNEXT_PUBLIC_BASE_URL)"
    api_dir = Path(__file__).resolve().parents[1]
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("UPNEXT_", "POSTGRES_", "DJANGO_"))}
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=api_dir,
        env={**clean, **env, "POSTGRES_HOST": "localhost"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr[-1500:]
    assert result.stdout.strip() == "https://upnext.co.zw"


def test_backup_job_uses_the_read_only_role_and_a_read_only_key_mount(cfg: dict[str, Any]) -> None:
    backup = cfg["services"]["backup"]
    assert backup["profiles"] == ["backup"]
    assert backup["environment"]["PGUSER"] == "upnext_readonly"
    assert set(backup["networks"]) == {"data", "egress"}
    key = next(v for v in backup["volumes"] if v["target"] == "/run/upnext/backup.key")
    assert key["read_only"] is True
    assert REQUIRED["POSTGRES_PASSWORD"] not in json.dumps(backup)
