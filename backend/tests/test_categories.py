from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.component import Category


async def test_list_categories_empty(client: AsyncClient) -> None:
    res = await client.get("/api/v1/categories")
    assert res.status_code == 200
    assert res.json() == []


async def test_list_categories_sorted_by_name(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    db_session.add_all(
        [
            Category(name="Sensors", slug="sensors"),
            Category(name="Batteries", slug="batteries"),
            Category(name="Motors", slug="motors"),
        ]
    )
    await db_session.commit()

    res = await client.get("/api/v1/categories")
    assert res.status_code == 200
    names = [c["name"] for c in res.json()]
    assert names == ["Batteries", "Motors", "Sensors"]
