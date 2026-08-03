from httpx import AsyncClient


async def _create_component(
    client: AsyncClient, headers: dict[str, str], *, name: str, quantity: int
) -> dict:
    payload = {"name": name, "type": "Motor", "quantity": quantity, "low_stock_threshold": 5}
    res = await client.post("/api/v1/components", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


async def test_bom_check_and_reserve_happy_path(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    component = await _create_component(client, auth_headers, name="Widget A", quantity=10)

    csv_body = b"Part Name,Qty\nWidget A,3\n"
    check_res = await client.post(
        "/api/v1/bom/check",
        files={"file": ("bom.csv", csv_body, "text/csv")},
        headers=auth_headers,
    )
    assert check_res.status_code == 200, check_res.text
    checked = check_res.json()
    assert checked["summary"]["available"] == 1
    assert checked["items"][0]["matched_component"]["id"] == component["id"]
    bom_id = checked["bom_id"]

    reserve_res = await client.post(f"/api/v1/bom/{bom_id}/reserve", headers=auth_headers)
    assert reserve_res.status_code == 200, reserve_res.text
    reserved = reserve_res.json()
    assert reserved["reserved"][0]["remaining_quantity"] == 7
    assert reserved["skipped"] == []

    component_res = await client.get(
        f"/api/v1/components/{component['id']}", headers=auth_headers
    )
    assert component_res.json()["quantity"] == 7


async def test_bom_reserve_twice_is_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await _create_component(client, auth_headers, name="Widget A", quantity=10)
    csv_body = b"Part Name,Qty\nWidget A,1\n"
    check_res = await client.post(
        "/api/v1/bom/check",
        files={"file": ("bom.csv", csv_body, "text/csv")},
        headers=auth_headers,
    )
    bom_id = check_res.json()["bom_id"]

    first = await client.post(f"/api/v1/bom/{bom_id}/reserve", headers=auth_headers)
    assert first.status_code == 200
    second = await client.post(f"/api/v1/bom/{bom_id}/reserve", headers=auth_headers)
    assert second.status_code == 409


async def test_bom_check_missing_part_reports_missing_status(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    csv_body = b"Part Name,Qty\nSomething Nobody Stocks,1\n"
    res = await client.post(
        "/api/v1/bom/check",
        files={"file": ("bom.csv", csv_body, "text/csv")},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["summary"]["missing"] == 1
    assert body["items"][0]["matched_component"] is None


async def test_bom_check_empty_file_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    res = await client.post(
        "/api/v1/bom/check",
        files={"file": ("bom.csv", b"", "text/csv")},
        headers=auth_headers,
    )
    assert res.status_code == 400
