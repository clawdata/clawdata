"""Agent API tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_agents_empty(client: AsyncClient):
    resp = await client.get("/api/agents/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_and_get_agent(client: AsyncClient):
    payload = {
        "id": "test-head",
        "name": "Test Head Agent",
        "description": "A test agent",
        "role": "agent",
    }
    resp = await client.post("/api/agents/", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == "test-head"
    assert data["name"] == "Test Head Agent"
    assert data["is_active"] is True
    assert data["source"] == "local"

    # Get by ID
    resp = await client.get("/api/agents/test-head")
    assert resp.status_code == 200
    assert resp.json()["id"] == "test-head"


@pytest.mark.asyncio
async def test_create_duplicate_agent(client: AsyncClient):
    payload = {"id": "dup-agent", "name": "Dup"}
    await client.post("/api/agents/", json=payload)
    resp = await client.post("/api/agents/", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_agent(client: AsyncClient):
    await client.post("/api/agents/", json={"id": "upd-agent", "name": "Before"})
    resp = await client.patch("/api/agents/upd-agent", json={"name": "After"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "After"


@pytest.mark.asyncio
async def test_delete_agent(client: AsyncClient):
    await client.post("/api/agents/", json={"id": "del-agent", "name": "Delete Me"})
    resp = await client.delete("/api/agents/del-agent")
    assert resp.status_code == 204

    resp = await client.get("/api/agents/del-agent")
    assert resp.status_code == 404
