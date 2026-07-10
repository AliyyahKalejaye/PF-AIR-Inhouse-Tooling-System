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
