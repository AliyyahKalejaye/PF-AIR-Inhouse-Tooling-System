from httpx import AsyncClient


async def test_bulk_import_preview_auto_maps_known_headers(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    csv_body = b"Name,Type,Qty\nWidget A,Motor,10\nWidget B,Sensor,5\n"
    res = await client.post(
        "/api/v1/bulk-import/preview",
        files={"file": ("import.csv", csv_body, "text/csv")},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["rows_detected"] == 2
    by_column = {c["source_column"]: c for c in body["columns"]}
    assert by_column["Name"]["mapped_field"] == "name"
    assert by_column["Qty"]["mapped_field"] == "quantity"
    assert body["warnings"] == []


async def test_bulk_import_preview_warns_on_missing_name_mapping(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    csv_body = b"Widget Column,Other\nA,1\n"
    res = await client.post(
        "/api/v1/bulk-import/preview",
        files={"file": ("import.csv", csv_body, "text/csv")},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert any("Name" in w for w in res.json()["warnings"])


async def test_bulk_import_commit_creates_components(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    payload = {
        "filename": "import.csv",
        "mapping": {"Name": "name", "Qty": "quantity"},
        "rows": [
            {"Name": "Widget A", "Qty": "10"},
            {"Name": "Widget B", "Qty": "not-a-number"},
            {"Name": None, "Qty": "3"},
        ],
    }
    res = await client.post("/api/v1/bulk-import/commit", json=payload, headers=auth_headers)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["created"] == 2
    assert len(body["skipped_rows"]) == 1
    assert body["skipped_rows"][0]["row_index"] == 2
    assert any("wasn't a number" in w for w in body["warnings"])

    list_res = await client.get("/api/v1/components", headers=auth_headers)
    assert list_res.json()["total"] == 2


async def test_bulk_import_commit_without_name_mapping_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    payload = {"filename": "import.csv", "mapping": {"Qty": "quantity"}, "rows": [{"Qty": "1"}]}
    res = await client.post("/api/v1/bulk-import/commit", json=payload, headers=auth_headers)
    assert res.status_code == 400


async def test_bulk_import_commit_with_no_rows_rejected(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    payload = {"filename": "import.csv", "mapping": {"Name": "name"}, "rows": []}
    res = await client.post("/api/v1/bulk-import/commit", json=payload, headers=auth_headers)
    assert res.status_code == 400
