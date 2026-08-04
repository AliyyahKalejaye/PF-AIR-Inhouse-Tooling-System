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


async def test_bulk_import_commit_second_upload_merges_quantity(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """Parts repeat across inventory sheets — re-uploading a sheet that
    includes an already-imported part should add to its stock count, not
    create a second near-duplicate component."""
    payload = {
        "filename": "import.csv",
        "mapping": {"Name": "name", "Brand": "brand", "Qty": "quantity"},
        "rows": [{"Name": "Widget A", "Brand": "Acme", "Qty": "10"}],
    }
    first = await client.post("/api/v1/bulk-import/commit", json=payload, headers=auth_headers)
    assert first.status_code == 201, first.text
    assert first.json()["created"] == 1
    assert first.json()["updated"] == []

    # Same part, case-insensitive name match, more stock arriving.
    second_payload = {
        "filename": "import2.csv",
        "mapping": {"Name": "name", "Brand": "brand", "Qty": "quantity"},
        "rows": [{"Name": "widget a", "Brand": "Acme", "Qty": "5"}],
    }
    second = await client.post(
        "/api/v1/bulk-import/commit", json=second_payload, headers=auth_headers
    )
    assert second.status_code == 201, second.text
    body = second.json()
    assert body["created"] == 0
    assert len(body["updated"]) == 1
    updated = body["updated"][0]
    assert updated["previous_quantity"] == 10
    assert updated["added_quantity"] == 5
    assert updated["new_quantity"] == 15

    list_res = await client.get("/api/v1/components", headers=auth_headers)
    list_body = list_res.json()
    assert list_body["total"] == 1
    assert list_body["items"][0]["quantity"] == 15


async def test_bulk_import_commit_merges_duplicate_rows_within_same_file(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    payload = {
        "filename": "import.csv",
        "mapping": {"Name": "name", "Qty": "quantity"},
        "rows": [
            {"Name": "Widget B", "Qty": "4"},
            {"Name": "Widget B", "Qty": "6"},
        ],
    }
    res = await client.post("/api/v1/bulk-import/commit", json=payload, headers=auth_headers)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["created"] == 1
    assert len(body["updated"]) == 1
    assert body["updated"][0]["row_index"] == 1
    assert body["updated"][0]["new_quantity"] == 10

    list_res = await client.get("/api/v1/components", headers=auth_headers)
    assert list_res.json()["total"] == 1
