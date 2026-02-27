"""Skill API tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_skills_empty(client: AsyncClient):
    resp = await client.get("/api/skills/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_skill(client: AsyncClient):
    payload = {
        "id": "test-skill",
        "name": "Test Skill",
        "description": "A test skill",
        "content": "---\nname: test-skill\ndescription: A test skill\n---\n\nDo the thing.\n",
    }
    resp = await client.post("/api/skills/", json=payload)
    assert resp.status_code == 201
    assert resp.json()["id"] == "test-skill"
