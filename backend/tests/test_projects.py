from httpx import AsyncClient

PROJECT_PAYLOAD = {
    "title": "Test Project",
    "problem_statement": "The widget doesn't widget.",
    "abstract": "We fixed it.",
}


async def _create_project(client: AsyncClient, headers: dict[str, str]) -> dict:
    res = await client.post("/api/v1/projects", json=PROJECT_PAYLOAD, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


async def _create_component(client: AsyncClient, headers: dict[str, str]) -> dict:
    payload = {"name": "MIL Widget", "type": "Motor", "quantity": 10}
    res = await client.post("/api/v1/components", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


async def test_create_get_update_delete_project(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    project = await _create_project(client, auth_headers)
    assert project["title"] == "Test Project"
    assert project["snippet"] == "The widget doesn't widget."
    assert project["media"] == []
    assert project["mil_items"] == []
    project_id = project["id"]

    get_res = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert get_res.status_code == 200

    patch_res = await client.patch(
        f"/api/v1/projects/{project_id}", json={"status": "done"}, headers=auth_headers
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "done"

    delete_res = await client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert delete_res.status_code == 204

    missing_res = await client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
    assert missing_res.status_code == 404


async def test_list_projects_filters_by_status(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await _create_project(client, auth_headers)  # defaults to "active"
    done_payload = {**PROJECT_PAYLOAD, "title": "Second Project", "status": "done"}
    await client.post("/api/v1/projects", json=done_payload, headers=auth_headers)

    all_res = await client.get("/api/v1/projects", headers=auth_headers)
    assert len(all_res.json()) == 2

    active_res = await client.get(
        "/api/v1/projects", params={"project_status": "active"}, headers=auth_headers
    )
    assert len(active_res.json()) == 1
    assert active_res.json()[0]["title"] == "Test Project"


async def test_project_media_link_and_delete(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    project = await _create_project(client, auth_headers)
    link_payload = {
        "media_type": "code",
        "file_url": "https://github.com/proforce/example",
        "filename": "example",
    }
    link_res = await client.post(
        f"/api/v1/projects/{project['id']}/media/link", json=link_payload, headers=auth_headers
    )
    assert link_res.status_code == 201, link_res.text
    media = link_res.json()

    get_res = await client.get(f"/api/v1/projects/{project['id']}", headers=auth_headers)
    assert len(get_res.json()["media"]) == 1

    delete_res = await client.delete(
        f"/api/v1/projects/{project['id']}/media/{media['id']}", headers=auth_headers
    )
    assert delete_res.status_code == 204

    get_res_2 = await client.get(f"/api/v1/projects/{project['id']}", headers=auth_headers)
    assert get_res_2.json()["media"] == []


async def test_mil_item_lifecycle(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    project = await _create_project(client, auth_headers)
    component = await _create_component(client, auth_headers)

    add_res = await client.post(
        f"/api/v1/projects/{project['id']}/mil-items",
        json={"component_id": component["id"], "quantity_required": 2},
        headers=auth_headers,
    )
    assert add_res.status_code == 201, add_res.text
    mil_item = add_res.json()
    assert mil_item["component"]["id"] == component["id"]

    dupe_res = await client.post(
        f"/api/v1/projects/{project['id']}/mil-items",
        json={"component_id": component["id"], "quantity_required": 1},
        headers=auth_headers,
    )
    assert dupe_res.status_code == 409

    update_res = await client.patch(
        f"/api/v1/projects/{project['id']}/mil-items/{mil_item['id']}",
        json={"quantity_required": 5},
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["quantity_required"] == 5

    delete_res = await client.delete(
        f"/api/v1/projects/{project['id']}/mil-items/{mil_item['id']}", headers=auth_headers
    )
    assert delete_res.status_code == 204


async def test_mil_item_unknown_component_404(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    project = await _create_project(client, auth_headers)
    res = await client.post(
        f"/api/v1/projects/{project['id']}/mil-items",
        json={"component_id": "00000000-0000-0000-0000-000000000000", "quantity_required": 1},
        headers=auth_headers,
    )
    assert res.status_code == 404


async def test_projects_require_auth(client: AsyncClient) -> None:
    res = await client.get("/api/v1/projects")
    assert res.status_code == 401
