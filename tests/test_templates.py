"""Template API tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_templates_empty(client: AsyncClient):
    resp = await client.get("/api/templates/")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_and_render_template(client: AsyncClient):
    payload = {
        "id": "test-tpl",
        "name": "Test Template",
        "category": "sql",
        "description": "A test SQL template",
        "content": "SELECT * FROM {{ schema }}.{{ table }};",
        "variables": ["schema", "table"],
    }
    resp = await client.post("/api/templates/", json=payload)
    assert resp.status_code == 201

    # Render
    resp = await client.post(
        "/api/templates/test-tpl/render",
        json={"variables": {"schema": "public", "table": "users"}},
    )
    assert resp.status_code == 200
    assert resp.json()["rendered"] == "SELECT * FROM public.users;"
