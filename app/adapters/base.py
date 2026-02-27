"""Abstract base class for AI backend adapters.

Swap OpenClaw for another agent runtime by implementing this interface.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any


class AIBackendAdapter(ABC):
    """Contract that any AI backend must satisfy."""

    @abstractmethod
    async def connect(self) -> None:
        """Establish a connection to the backend."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Tear down the connection."""

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

    @abstractmethod
    async def list_sessions(self, agent_id: str) -> list[dict[str, Any]]:
        """List active sessions for an agent."""

    @abstractmethod
    async def get_session_history(
        self, agent_id: str, session_id: str
    ) -> list[dict[str, Any]]:
        """Retrieve message history for a session."""

    @abstractmethod
    async def resolve_approval(
        self, approval_id: str, *, approved: bool, reason: str = ""
    ) -> dict[str, Any]:
        """Approve or deny an exec approval request."""

    @abstractmethod
    async def get_health(self) -> dict[str, Any]:
        """Return backend health/status info."""
