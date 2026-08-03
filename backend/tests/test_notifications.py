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

PROJECT_PAYLOAD = {
    "title": "Test Project",
    "problem_statement": "A problem.",
}


async def test_component_low_and_out_of_stock_notify_once_each(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create_res = await client.post(
        "/api/v1/components", json=COMPONENT_PAYLOAD, headers=auth_headers
    )
    component_id = create_res.json()["id"]

    # ok (25) -> low (5, threshold 5): one low-stock notification.
    res = await client.patch(
        f"/api/v1/components/{component_id}", json={"quantity": 5}, headers=auth_headers
    )
    assert res.status_code == 200

    list_res = await client.get("/api/v1/notifications", headers=auth_headers)
    assert list_res.status_code == 200
    body = list_res.json()
    assert body["unread_count"] == 1
    assert body["items"][0]["type"] == "component_low_stock"
    assert body["items"][0]["is_read"] is False

    # Still low (4): should NOT notify again — edge-triggered, not level.
    res = await client.patch(
        f"/api/v1/components/{component_id}", json={"quantity": 4}, headers=auth_headers
    )
    assert res.status_code == 200
    list_res = await client.get("/api/v1/notifications", headers=auth_headers)
    assert list_res.json()["unread_count"] == 1

    # low (4) -> out (0): a second, distinct notification.
    res = await client.patch(
        f"/api/v1/components/{component_id}", json={"quantity": 0}, headers=auth_headers
    )
    assert res.status_code == 200
    list_res = await client.get("/api/v1/notifications", headers=auth_headers)
    body = list_res.json()
    assert body["unread_count"] == 2
    assert body["items"][0]["type"] == "component_out_of_stock"


async def test_component_deleted_notifies(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create_res = await client.post(
        "/api/v1/components", json=COMPONENT_PAYLOAD, headers=auth_headers
    )
    component_id = create_res.json()["id"]

    del_res = await client.delete(f"/api/v1/components/{component_id}", headers=auth_headers)
    assert del_res.status_code == 204

    list_res = await client.get("/api/v1/notifications", headers=auth_headers)
    items = list_res.json()["items"]
    assert any(i["type"] == "component_deleted" for i in items)


async def test_project_created_status_changed_deleted_notify(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    create_res = await client.post(
        "/api/v1/projects", json=PROJECT_PAYLOAD, headers=auth_headers
    )
    assert create_res.status_code == 201
    project_id = create_res.json()["id"]

    patch_res = await client.patch(
        f"/api/v1/projects/{project_id}", json={"status": "done"}, headers=auth_headers
    )
    assert patch_res.status_code == 200

    # No-op status "change" (same value) shouldn't add a second notification.
    patch_res = await client.patch(
        f"/api/v1/projects/{project_id}", json={"status": "done"}, headers=auth_headers
    )
    assert patch_res.status_code == 200

    del_res = await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert del_res.status_code == 204

    list_res = await client.get(
        "/api/v1/notifications", params={"limit": 100}, headers=auth_headers
    )
    types = [i["type"] for i in list_res.json()["items"]]
    assert types.count("project_created") == 1
    assert types.count("project_status_changed") == 1
    assert types.count("project_deleted") == 1


async def test_mark_read_marks_single_notification(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.post("/api/v1/components", json=COMPONENT_PAYLOAD, headers=auth_headers)
    create_res = await client.post(
        "/api/v1/components", json={**COMPONENT_PAYLOAD, "sku": "WID-A-002"}, headers=auth_headers
    )
    component_id = create_res.json()["id"]
    await client.patch(
        f"/api/v1/components/{component_id}", json={"quantity": 0}, headers=auth_headers
    )

    unread_res = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert unread_res.json()["unread_count"] == 1

    list_res = await client.get("/api/v1/notifications", headers=auth_headers)
    notification_id = list_res.json()["items"][0]["id"]

    read_res = await client.post(
        f"/api/v1/notifications/{notification_id}/read", headers=auth_headers
    )
    assert read_res.status_code == 200

    unread_res = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert unread_res.json()["unread_count"] == 0

    # Mark-read is idempotent — reading an already-read notification again
    # shouldn't error or double-insert a receipt.
    read_res = await client.post(
        f"/api/v1/notifications/{notification_id}/read", headers=auth_headers
    )
    assert read_res.status_code == 200


async def test_mark_all_read(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    create_res = await client.post(
        "/api/v1/components", json=COMPONENT_PAYLOAD, headers=auth_headers
    )
    component_id = create_res.json()["id"]
    await client.patch(
        f"/api/v1/components/{component_id}", json={"quantity": 5}, headers=auth_headers
    )
    await client.patch(
        f"/api/v1/components/{component_id}", json={"quantity": 0}, headers=auth_headers
    )

    unread_res = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert unread_res.json()["unread_count"] == 2

    read_all_res = await client.post("/api/v1/notifications/read-all", headers=auth_headers)
    assert read_all_res.status_code == 200

    unread_res = await client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert unread_res.json()["unread_count"] == 0


async def test_notifications_require_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/notifications")
    assert res.status_code == 401
