"""Tests for the OpenClaw lifecycle management API."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.schemas.lifecycle import (
    ActionResult,
    ConfigGetResponse,
    ConfigPatchResponse,
    DoctorResult,
    FullStatus,
    GatewayStartRequest,
    GatewayState,
    GatewayStatus,
    HealthResult,
    InstallResult,
    NodeStatus,
    NpmStatus,
    OnboardingStatus,
    OpenClawPackage,
    PrerequisiteStatus,
    UpdateResult,
)

LIFECYCLE = "app.services.openclaw_lifecycle"


# ── GET /api/openclaw/status ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_status(client: AsyncClient):
    mock_status = FullStatus(
        prerequisites=PrerequisiteStatus(
            node=NodeStatus(installed=True, version="22.11.0", meets_minimum=True),
            npm=NpmStatus(installed=True, version="10.9.2"),
            openclaw=OpenClawPackage(installed=True, version="2026.2.23"),
            ready=True,
        ),
        gateway=GatewayStatus(state=GatewayState.RUNNING, port=18789),
    )
    with patch(f"{LIFECYCLE}.get_full_status", new_callable=AsyncMock, return_value=mock_status):
        resp = await client.get("/api/openclaw/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["prerequisites"]["ready"] is True
    assert data["gateway"]["state"] == "running"


@pytest.mark.asyncio
async def test_get_status_not_installed(client: AsyncClient):
    mock_status = FullStatus(
        prerequisites=PrerequisiteStatus(ready=False),
        gateway=GatewayStatus(state=GatewayState.NOT_INSTALLED),
    )
    with patch(f"{LIFECYCLE}.get_full_status", new_callable=AsyncMock, return_value=mock_status):
        resp = await client.get("/api/openclaw/status")
    assert resp.status_code == 200
    assert resp.json()["gateway"]["state"] == "not_installed"
    assert resp.json()["prerequisites"]["ready"] is False


# ── GET /api/openclaw/onboarding ─────────────────────────────────────


@pytest.mark.asyncio
async def test_get_onboarding(client: AsyncClient):
    mock = OnboardingStatus(
        config_exists=True, workspace_exists=True,
        gateway_token_set=True, any_channel_configured=False,
        any_api_key_configured=True, onboarded=True,
    )
    with patch(f"{LIFECYCLE}.check_onboarding", new_callable=AsyncMock, return_value=mock):
        resp = await client.get("/api/openclaw/onboarding")
    assert resp.status_code == 200
    assert resp.json()["onboarded"] is True


# ── POST /api/openclaw/install ───────────────────────────────────────


@pytest.mark.asyncio
async def test_install(client: AsyncClient):
    mock_result = InstallResult(success=True, version_installed="2026.2.23", message="Done")
    with patch(f"{LIFECYCLE}.install_openclaw", new_callable=AsyncMock, return_value=mock_result):
        resp = await client.post("/api/openclaw/install", json={"version": "latest"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["version_installed"] == "2026.2.23"


@pytest.mark.asyncio
async def test_install_no_node(client: AsyncClient):
    mock_result = InstallResult(success=False, message="Node.js >= 22 required.")
    with patch(f"{LIFECYCLE}.install_openclaw", new_callable=AsyncMock, return_value=mock_result):
        resp = await client.post("/api/openclaw/install")
    assert resp.status_code == 200
    assert resp.json()["success"] is False


# ── POST /api/openclaw/update ────────────────────────────────────────


@pytest.mark.asyncio
async def test_update(client: AsyncClient):
    mock = UpdateResult(success=True, previous_version="2026.2.22", new_version="2026.2.23")
    with patch(f"{LIFECYCLE}.update_openclaw", new_callable=AsyncMock, return_value=mock):
        resp = await client.post("/api/openclaw/update", json={"channel": "stable"})
    assert resp.status_code == 200
    assert resp.json()["new_version"] == "2026.2.23"


# ── POST /api/openclaw/start ────────────────────────────────────────


@pytest.mark.asyncio
async def test_start(client: AsyncClient):
    mock = ActionResult(success=True, message="Gateway started")
    with patch(f"{LIFECYCLE}.start_gateway", new_callable=AsyncMock, return_value=mock):
        resp = await client.post("/api/openclaw/start", json={"port": 18789})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ── POST /api/openclaw/stop ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_stop(client: AsyncClient):
    mock = ActionResult(success=True, message="Gateway stopped.")
    with patch(f"{LIFECYCLE}.stop_gateway", new_callable=AsyncMock, return_value=mock):
        resp = await client.post("/api/openclaw/stop")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ── POST /api/openclaw/restart ──────────────────────────────────────


@pytest.mark.asyncio
async def test_restart(client: AsyncClient):
    mock = ActionResult(success=True, message="Gateway restarted.")
    with patch(f"{LIFECYCLE}.restart_gateway", new_callable=AsyncMock, return_value=mock):
        resp = await client.post("/api/openclaw/restart")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ── GET /api/openclaw/health ────────────────────────────────────────


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    mock = HealthResult(healthy=True, raw={"status": "ok"})
    with patch(f"{LIFECYCLE}.get_health", new_callable=AsyncMock, return_value=mock):
        resp = await client.get("/api/openclaw/health")
    assert resp.status_code == 200
    assert resp.json()["healthy"] is True


# ── GET /api/openclaw/doctor ────────────────────────────────────────


@pytest.mark.asyncio
async def test_doctor(client: AsyncClient):
    mock = DoctorResult(success=True, issues=[], fixes_applied=[])
    with patch(f"{LIFECYCLE}.run_doctor", new_callable=AsyncMock, return_value=mock):
        resp = await client.get("/api/openclaw/doctor")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert resp.json()["issues"] == []


@pytest.mark.asyncio
async def test_doctor_with_fix(client: AsyncClient):
    mock = DoctorResult(success=True, fixes_applied=["Fixed X"])
    with patch(f"{LIFECYCLE}.run_doctor", new_callable=AsyncMock, return_value=mock):
        resp = await client.get("/api/openclaw/doctor?fix=true")
    assert resp.status_code == 200
    assert "Fixed X" in resp.json()["fixes_applied"]


# ── GET /api/openclaw/logs ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_logs(client: AsyncClient):
    with patch(f"{LIFECYCLE}.get_logs", new_callable=AsyncMock, return_value="log line 1\nlog line 2"):
        resp = await client.get("/api/openclaw/logs?lines=50")
    assert resp.status_code == 200
    assert "log line 1" in resp.json()["output"]


# ── Config endpoints ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_config(client: AsyncClient):
    mock = ConfigGetResponse(path="/home/.openclaw/openclaw.json", exists=True, config={"agent": {}})
    with patch(f"{LIFECYCLE}.get_config", new_callable=AsyncMock, return_value=mock):
        resp = await client.get("/api/openclaw/config")
    assert resp.status_code == 200
    assert resp.json()["exists"] is True


@pytest.mark.asyncio
async def test_set_config(client: AsyncClient):
    new_conf = {"agent": {"model": "anthropic/claude-opus-4-6"}}
    mock = ConfigPatchResponse(success=True, config=new_conf, message="Config written.")
    with patch(f"{LIFECYCLE}.set_config", new_callable=AsyncMock, return_value=mock):
        resp = await client.put("/api/openclaw/config", json={"config": new_conf})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_patch_config(client: AsyncClient):
    patch_data = {"channels": {"whatsapp": {"allowFrom": ["+1555"]}}}
    mock = ConfigPatchResponse(success=True, config=patch_data, message="Config patched.")
    with patch(f"{LIFECYCLE}.patch_config", new_callable=AsyncMock, return_value=mock):
        resp = await client.patch("/api/openclaw/config", json={"patch": patch_data})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
