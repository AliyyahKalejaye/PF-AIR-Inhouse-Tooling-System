from httpx import AsyncClient

COMPONENT_PAYLOAD = {
    "name": "Widget A",
    "type": "Motor",
    "sku": "WID-A-001",
    "brand": "Acme",
    "description": "A test widget.",
    "quantity": 25,
    "low_stock_threshold": 5,
}


async def test_create_get_update_delete_component(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create_res = await client.post(
        "/api/v1/components", json=COMPONENT_PAYLOAD, headers=auth_headers
    )
    assert create_res.status_code == 201, create_res.text
    created = create_res.json()
    assert created["name"] == "Widget A"
    assert created["is_low_stock"] is False
    component_id = created["id"]

    get_res = await client.get(f"/api/v1/components/{component_id}", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["sku"] == "WID-A-001"

    patch_res = await client.patch(
        f"/api/v1/components/{component_id}", json={"quantity": 2}, headers=auth_headers
    )
    assert patch_res.status_code == 200
    patched = patch_res.json()
    assert patched["quantity"] == 2
    assert patched["is_low_stock"] is True

    delete_res = await client.delete(f"/api/v1/components/{component_id}", headers=auth_headers)
    assert delete_res.status_code == 204

    missing_res = await client.get(f"/api/v1/components/{component_id}", headers=auth_headers)
    assert missing_res.status_code == 404


async def test_create_component_duplicate_sku_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    first = await client.post("/api/v1/components", json=COMPONENT_PAYLOAD, headers=auth_headers)
    assert first.status_code == 201

    dupe = {**COMPONENT_PAYLOAD, "name": "Widget B"}
    second = await client.post("/api/v1/components", json=dupe, headers=auth_headers)
    assert second.status_code == 409


async def test_list_components_search_filters_and_paginates(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    for i in range(3):
        payload = {**COMPONENT_PAYLOAD, "name": f"Searchable Widget {i}", "sku": f"SW-{i}"}
        res = await client.post("/api/v1/components", json=payload, headers=auth_headers)
        assert res.status_code == 201

    other = {**COMPONENT_PAYLOAD, "name": "Totally Different Part", "sku": "TDP-1"}
    res = await client.post("/api/v1/components", json=other, headers=auth_headers)
    assert res.status_code == 201

    list_res = await client.get(
        "/api/v1/components", params={"q": "Searchable", "limit": 2}, headers=auth_headers
    )
    assert list_res.status_code == 200
    body = list_res.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert all("Searchable" in item["name"] for item in body["items"])


async def test_get_component_not_found(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    res = await client.get(
        "/api/v1/components/00000000-0000-0000-0000-000000000000", headers=auth_headers
    )
    assert res.status_code == 404


async def test_components_require_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/components")
    assert res.status_code == 401
