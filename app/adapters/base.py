"""Abstract base class for AI backend adapters.

Thin interface — connect, send, stream, sessions, approvals, health, agent files.
Swap OpenClaw for Claude Code (or another runtime) by implementing this interface.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any


class AIBackendAdapter(ABC):
    """Contract that any AI backend must satisfy."""

    # ── Connection lifecycle ─────────────────────────────────────────

    @abstractmethod
    async def connect(self) -> None:
        """Establish a connection to the backend."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Tear down the connection."""

    # ── Chat ─────────────────────────────────────────────────────────

    @abstractmethod
    async def send_message(
        self,
        agent_id: str,
        message: str,
        *,
        session_key: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        """Send a user message and return the initial ack/response."""

    @abstractmethod
    async def stream_response(
        self,
        agent_id: str,
        run_id: str,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield streamed agent events for a given run."""

    # ── Sessions ─────────────────────────────────────────────────────

    @abstractmethod
    async def list_sessions(self, agent_id: str) -> list[dict[str, Any]]:
        """List active sessions for an agent."""

    @abstractmethod
    async def get_session_history(
        self, agent_id: str, session_id: str
    ) -> list[dict[str, Any]]:
        """Retrieve message history for a session."""

    # ── Approvals ────────────────────────────────────────────────────

    @abstractmethod
    async def resolve_approval(
        self, approval_id: str, *, approved: bool, reason: str = ""
    ) -> dict[str, Any]:
        """Approve or deny an exec approval request."""

    # ── Health ───────────────────────────────────────────────────────

    @abstractmethod
    async def get_health(self) -> dict[str, Any]:
        """Return backend health/status info."""

    # ── Agents (read-only listing) ───────────────────────────────────

    @abstractmethod
    async def list_agents(self) -> dict[str, Any]:
        """List agents registered in the runtime."""

    # ── Agent files ──────────────────────────────────────────────────

    @abstractmethod
    async def get_agent_files(self, agent_id: str) -> list[dict[str, Any]]:
        """List workspace files for an agent."""

    @abstractmethod
    async def read_agent_file(self, agent_id: str, name: str) -> dict[str, Any]:
        """Read a workspace file's content."""

    @abstractmethod
    async def write_agent_file(self, agent_id: str, name: str, content: str) -> dict[str, Any]:
        """Write content to a workspace file."""

    # ── Costing ──────────────────────────────────────────────────────

    @abstractmethod
    async def get_all_sessions_for_costing(self, *, limit: int = 500) -> list[dict[str, Any]]:
        """Fetch all sessions with token metadata for costing aggregation."""
