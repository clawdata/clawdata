"""Chat tests (WebSocket — requires OpenClaw to be running, skip by default)."""

import pytest


@pytest.mark.skip(reason="Requires a running OpenClaw gateway")
@pytest.mark.asyncio
async def test_chat_ws():
    """Placeholder — integration test for the chat WebSocket."""
    pass
