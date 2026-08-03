from httpx import AsyncClient

SIGNUP_PAYLOAD = {
    "name": "Ada Engineer",
    "email": "ada@proforcedefence.com",
    "staff_id": "PF-1001",
    "password": "correct-horse-battery",
}


async def test_signup_then_login(client: AsyncClient) -> None:
    signup_res = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert signup_res.status_code == 201
    body = signup_res.json()
    assert body["email"] == SIGNUP_PAYLOAD["email"]
    assert "hashed_password" not in body  # never leak the hash

    login_res = await client.post(
        "/api/v1/auth/login",
        data={"username": SIGNUP_PAYLOAD["email"], "password": SIGNUP_PAYLOAD["password"]},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    assert token

    me_res = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me_res.status_code == 200
    assert me_res.json()["staff_id"] == SIGNUP_PAYLOAD["staff_id"]


async def test_signup_duplicate_email_rejected(client: AsyncClient) -> None:
    first = await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)
    assert first.status_code == 201

    dupe_payload = {**SIGNUP_PAYLOAD, "staff_id": "PF-1002"}
    second = await client.post("/api/v1/auth/signup", json=dupe_payload)
    assert second.status_code == 409


async def test_login_wrong_password_rejected(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/signup", json=SIGNUP_PAYLOAD)

    res = await client.post(
        "/api/v1/auth/login",
        data={"username": SIGNUP_PAYLOAD["email"], "password": "not-the-password"},
    )
    assert res.status_code == 401


async def _signup_and_login(client: AsyncClient, payload: dict) -> dict[str, str]:
    signup_res = await client.post("/api/v1/auth/signup", json=payload)
    assert signup_res.status_code == 201, signup_res.text
    login_res = await client.post(
        "/api/v1/auth/login",
        data={"username": payload["email"], "password": payload["password"]},
    )
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def test_update_profile_name(client: AsyncClient) -> None:
    headers = await _signup_and_login(client, SIGNUP_PAYLOAD)

    res = await client.patch("/api/v1/auth/me", json={"name": "Ada L."}, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "Ada L."

    # Persisted, not just echoed back.
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    assert me_res.json()["name"] == "Ada L."


async def test_update_profile_requires_auth(client: AsyncClient) -> None:
    res = await client.patch("/api/v1/auth/me", json={"name": "Nobody"})
    assert res.status_code == 401


async def test_change_password_then_login_with_new_password(client: AsyncClient) -> None:
    headers = await _signup_and_login(client, SIGNUP_PAYLOAD)

    res = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": SIGNUP_PAYLOAD["password"],
            "new_password": "new-strong-password",
        },
        headers=headers,
    )
    assert res.status_code == 200

    old_login = await client.post(
        "/api/v1/auth/login",
        data={"username": SIGNUP_PAYLOAD["email"], "password": SIGNUP_PAYLOAD["password"]},
    )
    assert old_login.status_code == 401

    new_login = await client.post(
        "/api/v1/auth/login",
        data={"username": SIGNUP_PAYLOAD["email"], "password": "new-strong-password"},
    )
    assert new_login.status_code == 200


async def test_change_password_wrong_current_rejected(client: AsyncClient) -> None:
    headers = await _signup_and_login(client, SIGNUP_PAYLOAD)

    res = await client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "not-the-current-password",
            "new_password": "new-strong-password",
        },
        headers=headers,
    )
    assert res.status_code == 401


async def test_change_password_requires_auth(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "whatever", "new_password": "new-strong-password"},
    )
    assert res.status_code == 401
