"""OpenClaw Gateway WebSocket adapter.

Implements the Gateway WS protocol:
  - connect handshake (with auth token + device identity signing)
  - req/res pattern for agent, health, sessions
  - event streaming for agent output + exec approvals
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_pem_private_key,
    load_pem_public_key,
)

import os
import websockets
from websockets.asyncio.client import ClientConnection

from app.adapters.base import AIBackendAdapter
from app.config import settings

logger = logging.getLogger(__name__)

OPENCLAW_HOME = Path.home() / ".openclaw"
DEVICE_IDENTITY_PATH = OPENCLAW_HOME / "identity" / "device.json"

# ── Valid protocol constants (must match gateway source) ─────────────
PROTOCOL_VERSION = 3
CLIENT_ID = "gateway-client"  # GATEWAY_CLIENT_IDS.GATEWAY_CLIENT
CLIENT_MODE = "backend"  # GATEWAY_CLIENT_MODES.BACKEND


# ── Device identity helpers ──────────────────────────────────────────


def _b64url_encode(data: bytes) -> str:
    """Base64-URL encode without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _fingerprint_public_key(pub_key: Ed25519PublicKey) -> str:
    """SHA-256 hex digest of the raw 32-byte public key."""
    raw = pub_key.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return hashlib.sha256(raw).hexdigest()


def _load_or_create_device_identity() -> tuple[str, Ed25519PrivateKey, Ed25519PublicKey]:
    """Load device identity from ~/.openclaw/identity/device.json.

    If it doesn't exist, generate one and persist it (matching OpenClaw CLI behaviour).
    Returns (deviceId, privateKey, publicKey).
    """
    if DEVICE_IDENTITY_PATH.exists():
        data = json.loads(DEVICE_IDENTITY_PATH.read_text())
        priv = load_pem_private_key(data["privateKeyPem"].encode(), password=None)
        pub = load_pem_public_key(data["publicKeyPem"].encode())
        assert isinstance(priv, Ed25519PrivateKey)
        assert isinstance(pub, Ed25519PublicKey)
        device_id = _fingerprint_public_key(pub)
        return device_id, priv, pub

    # Generate new identity
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    device_id = _fingerprint_public_key(pub)

    identity = {
        "version": 1,
        "deviceId": device_id,
        "publicKeyPem": pub.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode(),
        "privateKeyPem": priv.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode(),
        "createdAtMs": int(time.time() * 1000),
    }

    DEVICE_IDENTITY_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEVICE_IDENTITY_PATH.write_text(json.dumps(identity, indent=2) + "\n")
    DEVICE_IDENTITY_PATH.chmod(0o600)
    logger.info("Generated new device identity: %s", device_id)

    return device_id, priv, pub


def _build_device_auth_payload(
    *,
    device_id: str,
    client_id: str,
    client_mode: str,
    role: str,
    scopes: list[str],
    signed_at_ms: int,
    token: str | None,
    nonce: str,
) -> str:
    """Build the v2 device auth payload string (pipe-delimited)."""
    return "|".join([
        "v2",
        device_id,
        client_id,
        client_mode,
        role,
        ",".join(scopes),
        str(signed_at_ms),
        token or "",
        nonce,
    ])


def _sign_payload(private_key: Ed25519PrivateKey, payload: str) -> str:
    """Sign payload with Ed25519 and return base64url-encoded signature."""
    sig = private_key.sign(payload.encode("utf-8"))
    return _b64url_encode(sig)


def _public_key_raw_b64url(pub_key: Ed25519PublicKey) -> str:
    """Export public key as raw 32-byte base64url string."""
    raw = pub_key.public_bytes(Encoding.Raw, PublicFormat.Raw)
    return _b64url_encode(raw)


def _resolve_gateway_token() -> str | None:
    """Resolve the gateway auth token.

    Priority: 1) CLAWDATA_OPENCLAW_GATEWAY_TOKEN env / settings
              2) ~/.openclaw/openclaw.json  gateway.auth.token
    """
    if settings.openclaw_gateway_token:
        return settings.openclaw_gateway_token

    config_path = OPENCLAW_HOME / "openclaw.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text())
            token = cfg.get("gateway", {}).get("auth", {}).get("token")
            if token:
                logger.debug("Resolved gateway token from openclaw.json")
                return token
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read openclaw.json for token: %s", exc)

    return None


async def _auto_approve_device(request_id: str | None = None) -> bool:
    """Approve this device's pairing request via the CLI.

    Returns True if approval succeeded.
    """
    import shutil
    oc = shutil.which("openclaw")
    if not oc:
        logger.warning("Cannot auto-approve: openclaw not on PATH")
        return False

    if request_id:
        cmd = ["openclaw", "devices", "approve", request_id, "--json"]
    else:
        cmd = ["openclaw", "devices", "approve", "--latest", "--json"]

    # Also pass the gateway token so the CLI can authenticate
    gw_token = _resolve_gateway_token()
    if gw_token:
        cmd.extend(["--token", gw_token])

    logger.info("Auto-approving device pairing: %s", " ".join(cmd))
    try:
        env = os.environ.copy()
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        out = stdout.decode(errors="replace").strip()
        err = stderr.decode(errors="replace").strip()
        if proc.returncode == 0:
            logger.info("Device pairing approved: %s", out or "ok")
            return True
        else:
            logger.warning("Device approve failed (exit %d): %s %s", proc.returncode, out, err)
            return False
    except Exception as exc:
        logger.warning("Device approve error: %s", exc)
        return False


class OpenClawAdapter(AIBackendAdapter):
    """WebSocket client for the OpenClaw Gateway."""

    def __init__(self) -> None:
        self._ws: ClientConnection | None = None
        self._pending: dict[str, asyncio.Future[dict]] = {}
        self._event_queues: dict[str, asyncio.Queue[dict]] = {}
        self._listener_task: asyncio.Task | None = None
        self._connected = False

    # ── Connection lifecycle ─────────────────────────────────────────

    async def connect(self) -> None:
        if self._connected and self._ws and self._listener_task and not self._listener_task.done():
            return

        # If previously connected but listener died, clean up first
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
            self._connected = False

        # Attempt connection with auto-pairing retry
        max_pair_attempts = 3
        for attempt in range(max_pair_attempts):
            await self._do_connect_handshake(attempt=attempt)
            if self._connected:
                return
        # If we exhausted retries without connecting, raise
        raise ConnectionError(
            "Failed to connect to OpenClaw gateway after pairing attempts. "
            "Try: openclaw devices approve --latest"
        )

    async def _do_connect_handshake(self, *, attempt: int = 0) -> None:
        """Perform the WS connect handshake. Sets self._connected on success."""
        url = settings.openclaw_ws_url
        logger.info("Connecting to OpenClaw gateway at %s (attempt %d)", url, attempt + 1)

        self._ws = await websockets.connect(url)

        # Wait for connect.challenge event
        raw = await self._ws.recv()
        challenge = json.loads(raw)
        if challenge.get("event") != "connect.challenge":
            raise ConnectionError(f"Expected connect.challenge, got: {challenge}")

        nonce = challenge["payload"]["nonce"]

        # Load device identity for signed auth
        device_id, priv_key, pub_key = _load_or_create_device_identity()

        role = "operator"
        scopes = ["operator.read", "operator.write", "operator.approvals", "operator.admin"]
        auth_token = _resolve_gateway_token()
        signed_at_ms = int(time.time() * 1000)

        # Build and sign the device auth payload
        payload_str = _build_device_auth_payload(
            device_id=device_id,
            client_id=CLIENT_ID,
            client_mode=CLIENT_MODE,
            role=role,
            scopes=scopes,
            signed_at_ms=signed_at_ms,
            token=auth_token,
            nonce=nonce,
        )
        signature = _sign_payload(priv_key, payload_str)
        pub_key_b64 = _public_key_raw_b64url(pub_key)

        # Send connect request
        connect_req = {
            "type": "req",
            "id": self._make_id(),
            "method": "connect",
            "params": {
                "minProtocol": PROTOCOL_VERSION,
                "maxProtocol": PROTOCOL_VERSION,
                "client": {
                    "id": CLIENT_ID,
                    "version": "0.1.0",
                    "platform": "server",
                    "mode": CLIENT_MODE,
                },
                "role": role,
                "scopes": scopes,
                "caps": ["tool-events"],
                "auth": {"token": auth_token} if auth_token else {},
                "device": {
                    "id": device_id,
                    "publicKey": pub_key_b64,
                    "signature": signature,
                    "signedAt": signed_at_ms,
                    "nonce": nonce,
                },
            },
        }
        await self._ws.send(json.dumps(connect_req))

        # Wait for hello-ok
        raw = await self._ws.recv()
        hello = json.loads(raw)
        if not hello.get("ok"):
            error = hello.get("error", {})
            error_code = error.get("code", "")
            details = error.get("details", {})

            # Handle PAIRING_REQUIRED: auto-approve and retry
            if error_code == "NOT_PAIRED" or details.get("code") == "PAIRING_REQUIRED":
                request_id = details.get("requestId")
                logger.warning(
                    "Device not paired (requestId=%s, reason=%s). Auto-approving …",
                    request_id, details.get("reason", "unknown"),
                )
                try:
                    await self._ws.close()
                except Exception:
                    pass
                self._ws = None

                approved = await _auto_approve_device(request_id)
                if not approved:
                    raise ConnectionError(
                        f"Device pairing required but auto-approve failed. "
                        f"Run: openclaw devices approve --latest"
                    )
                # Give the gateway a moment to process the approval
                await asyncio.sleep(1)
                return  # caller will retry

            raise ConnectionError(f"Connect failed: {hello}")

        logger.info("Connected to OpenClaw gateway (protocol %s)", hello["payload"].get("protocol"))
        self._connected = True

        # Start background listener
        self._listener_task = asyncio.create_task(self._listen())

    async def disconnect(self) -> None:
        self._connected = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._ws:
            await self._ws.close()
            self._ws = None

    # ── Core protocol ────────────────────────────────────────────────

    async def _listen(self) -> None:
        """Background loop: dispatch responses and events."""
        assert self._ws is not None
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "res":
                    req_id = msg.get("id")
                    if req_id in self._pending:
                        self._pending[req_id].set_result(msg)
                elif msg_type == "event":
                    event_name = msg.get("event", "")
                    # Route to any subscribers
                    for key, queue in self._event_queues.items():
                        if event_name.startswith(key):
                            await queue.put(msg)
        except websockets.ConnectionClosed:
            logger.warning("OpenClaw gateway connection closed")
            self._connected = False
        except asyncio.CancelledError:
            pass

    async def _request(self, method: str, params: dict | None = None) -> dict:
        """Send a req and wait for the matching res."""
        if not self._ws or not self._connected:
            await self.connect()

        req_id = self._make_id()
        frame = {"type": "req", "id": req_id, "method": method}
        if params:
            frame["params"] = params

        future: asyncio.Future[dict] = asyncio.get_event_loop().create_future()
        self._pending[req_id] = future

        await self._ws.send(json.dumps(frame))  # type: ignore[union-attr]

        try:
            result = await asyncio.wait_for(future, timeout=60.0)
        finally:
            self._pending.pop(req_id, None)

        if not result.get("ok"):
            raise RuntimeError(f"OpenClaw request failed: {result.get('error')}")
        return result.get("payload", {})

    def _subscribe_events(self, prefix: str) -> asyncio.Queue[dict]:
        """Subscribe to events matching the given prefix."""
        queue: asyncio.Queue[dict] = asyncio.Queue()
        self._event_queues[prefix] = queue
        return queue

    def _unsubscribe_events(self, prefix: str) -> None:
        self._event_queues.pop(prefix, None)

    # ── Public API ───────────────────────────────────────────────────

    async def send_message(
        self,
        agent_id: str,
        message: str,
        *,
        session_key: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "message": message,
            "agentId": agent_id,
            "idempotencyKey": idempotency_key or self._make_id(),
        }
        if session_key:
            params["sessionKey"] = session_key

        return await self._request("agent", params)

    async def stream_response(
        self,
        agent_id: str,
        run_id: str,
    ) -> AsyncIterator[dict[str, Any]]:
        queue = self._subscribe_events("agent")
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=120.0)
                except TimeoutError:
                    break

                payload = event.get("payload", {})
                if payload.get("runId") == run_id:
                    yield event
                    # Lifecycle events signal run completion
                    stream = payload.get("stream")
                    if stream == "lifecycle":
                        phase = (payload.get("data") or {}).get("phase")
                        if phase in ("end", "error"):
                            break
        finally:
            self._unsubscribe_events("agent")

    async def list_sessions(self, agent_id: str) -> list[dict[str, Any]]:
        result = await self._request("sessions.list", {"agentId": agent_id})
        return result.get("sessions", [])

    async def get_session_history(
        self, agent_id: str, session_id: str
    ) -> list[dict[str, Any]]:
        result = await self._request(
            "sessions.history", {"agentId": agent_id, "sessionId": session_id}
        )
        return result.get("messages", [])

    async def resolve_approval(
        self, approval_id: str, *, approved: bool, reason: str = ""
    ) -> dict[str, Any]:
        return await self._request(
            "exec.approval.resolve",
            {"approvalId": approval_id, "approved": approved, "reason": reason},
        )

    async def get_health(self) -> dict[str, Any]:
        return await self._request("health")

    # ── Agents management ────────────────────────────────────────────

    async def list_agents(self) -> dict[str, Any]:
        """Call agents.list on the gateway."""
        return await self._request("agents.list", {})

    async def create_agent(
        self, *, name: str, workspace: str, emoji: str | None = None, avatar: str | None = None
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"name": name, "workspace": workspace}
        if emoji:
            params["emoji"] = emoji
        if avatar:
            params["avatar"] = avatar
        return await self._request("agents.create", params)

    async def update_agent(
        self, *, agent_id: str, name: str | None = None, model: str | None = None,
        workspace: str | None = None, avatar: str | None = None
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"agentId": agent_id}
        if name is not None:
            params["name"] = name
        if model is not None:
            params["model"] = model
        if workspace is not None:
            params["workspace"] = workspace
        if avatar is not None:
            params["avatar"] = avatar
        return await self._request("agents.update", params)

    async def delete_agent(
        self, agent_id: str, *, delete_files: bool = True
    ) -> dict[str, Any]:
        return await self._request(
            "agents.delete", {"agentId": agent_id, "deleteFiles": delete_files}
        )

    # ── Agent files management ───────────────────────────────────────

    async def agent_files_list(self, agent_id: str) -> dict[str, Any]:
        """List all workspace files for an agent."""
        return await self._request("agents.files.list", {"agentId": agent_id})

    async def agent_files_get(self, agent_id: str, name: str) -> dict[str, Any]:
        """Get a workspace file's content."""
        return await self._request("agents.files.get", {"agentId": agent_id, "name": name})

    async def agent_files_set(self, agent_id: str, name: str, content: str) -> dict[str, Any]:
        """Write content to a workspace file."""
        return await self._request("agents.files.set", {"agentId": agent_id, "name": name, "content": content})

    # ── Sessions management ──────────────────────────────────────────

    async def sessions_list_full(
        self,
        agent_id: str | None = None,
        *,
        limit: int = 50,
        include_derived_titles: bool = True,
        include_last_message: bool = True,
    ) -> dict[str, Any]:
        """List sessions with full metadata."""
        params: dict[str, Any] = {
            "limit": limit,
            "includeDerivedTitles": include_derived_titles,
            "includeLastMessage": include_last_message,
        }
        if agent_id:
            params["agentId"] = agent_id
        return await self._request("sessions.list", params)

    async def sessions_delete(self, key: str, *, delete_transcript: bool = True) -> dict[str, Any]:
        return await self._request("sessions.delete", {"key": key, "deleteTranscript": delete_transcript})

    async def sessions_reset(self, key: str) -> dict[str, Any]:
        return await self._request("sessions.reset", {"key": key, "reason": "reset"})

    async def sessions_compact(self, key: str) -> dict[str, Any]:
        return await self._request("sessions.compact", {"key": key})

    # ── Config management ────────────────────────────────────────────

    async def config_get(self) -> dict[str, Any]:
        """Get the full OpenClaw config."""
        return await self._request("config.get", {})

    async def config_patch(self, raw: str, *, note: str = "") -> dict[str, Any]:
        """Patch the OpenClaw config with a raw JSON string.

        Automatically fetches the base hash required by the gateway.
        """
        # Gateway requires baseHash for config.patch — fetch it first
        current = await self._request("config.get", {})
        base_hash = current.get("hash", "")

        params: dict[str, Any] = {"raw": raw, "baseHash": base_hash}
        if note:
            params["note"] = note
        return await self._request("config.patch", params)

    # ── Skills management ────────────────────────────────────────────

    async def skills_status(self, agent_id: str | None = None) -> dict[str, Any]:
        """Call skills.status on the gateway."""
        params: dict[str, Any] = {}
        if agent_id:
            params["agentId"] = agent_id
        return await self._request("skills.status", params)

    async def skills_bins(self) -> dict[str, Any]:
        """Call skills.bins to get available skill binaries."""
        return await self._request("skills.bins", {})

    async def skills_install(
        self, *, name: str, install_id: str, timeout_ms: int | None = None
    ) -> dict[str, Any]:
        """Install a skill binary."""
        params: dict[str, Any] = {"name": name, "installId": install_id}
        if timeout_ms is not None:
            params["timeoutMs"] = timeout_ms
        return await self._request("skills.install", params)

    async def skills_update(
        self,
        *,
        skill_key: str,
        enabled: bool | None = None,
        api_key: str | None = None,
        env: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Update a skill (enable/disable, set API key or env vars)."""
        params: dict[str, Any] = {"skillKey": skill_key}
        if enabled is not None:
            params["enabled"] = enabled
        if api_key is not None:
            params["apiKey"] = api_key
        if env is not None:
            params["env"] = env
        return await self._request("skills.update", params)

    # ── Costing ──────────────────────────────────────────────────────

    async def get_all_sessions_for_costing(
        self, *, limit: int = 500
    ) -> list[dict[str, Any]]:
        """Fetch all sessions with token metadata for costing aggregation."""
        result = await self._request("sessions.list", {
            "limit": limit,
            "includeDerivedTitles": True,
            "includeLastMessage": False,
        })
        return result.get("sessions", [])

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _make_id() -> str:
        return str(uuid.uuid4())


# Singleton — shared across the application
openclaw = OpenClawAdapter()
