"""Chat schemas for the WebSocket relay."""

from pydantic import BaseModel


class ChatMessage(BaseModel):
    """Inbound message from the client."""
    message: str
    agent_id: str = "head"
    session_key: str | None = None


class ChatEvent(BaseModel):
    """Outbound event to the client."""
    type: str  # text | tool_start | tool_end | status | error
    content: str = ""
    run_id: str | None = None
    agent_id: str | None = None
    metadata: dict | None = None
