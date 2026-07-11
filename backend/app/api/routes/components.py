import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.component import Category, Component
from app.models.user import User
from app.schemas.inventory import (
    ComponentCreate,
    ComponentListResponse,
    ComponentRead,
    ComponentUpdate,
    InventoryStats,
)
from app.services.r2 import upload_component_image

router = APIRouter(prefix="/components", tags=["inventory"])


async def _get_component_or_404(db: AsyncSession, component_id: uuid.UUID) -> Component:
    result = await db.execute(
        select(Component)
        .options(selectinload(Component.category))
        .where(Component.id == component_id)
    )
    component = result.scalar_one_or_none()
    if component is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found.")
    return component


async def _compute_stats(db: AsyncSession) -> InventoryStats:
    total_skus = await db.scalar(select(func.count()).select_from(Component)) or 0
    low_stock = await db.scalar(
        select(func.count())
        .select_from(Component)
        .where(Component.quantity > 0, Component.quantity <= Component.low_stock_threshold)
    ) or 0
    out_of_stock = await db.scalar(
        select(func.count()).select_from(Component).where(Component.quantity <= 0)
    ) or 0
    categories = await db.scalar(select(func.count()).select_from(Category)) or 0
    return InventoryStats(
        total_skus=total_skus,
        low_stock=low_stock,
        out_of_stock=out_of_stock,
        categories=categories,
    )


@router.get("", response_model=ComponentListResponse)
async def list_components(
    q: str | None = Query(
        default=None, description="Free-text search across name/description/brand/type/sku"
    ),
    category_id: uuid.UUID | None = None,
    stock: str = Query(default="all", pattern="^(all|low|out)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentListResponse:
    # v1 search is plain ILIKE text matching — see the module docstring in
    # app/schemas/inventory.py for why real semantic/image search is
    # deferred rather than half-implemented here.
    filters = []
    if q:
        term = f"%{q.strip()}%"
        filters.append(
            or_(
                Component.name.ilike(term),
                Component.description.ilike(term),
                Component.brand.ilike(term),
                Component.type.ilike(term),
                Component.sku.ilike(term),
            )
        )
    if category_id is not None:
        filters.append(Component.category_id == category_id)
    if stock == "low":
        filters.append(Component.quantity > 0)
        filters.append(Component.quantity <= Component.low_stock_threshold)
    elif stock == "out":
        filters.append(Component.quantity <= 0)

    base_query = select(Component).options(selectinload(Component.category))
    count_query = select(func.count()).select_from(Component)
    for f in filters:
        base_query = base_query.where(f)
        count_query = count_query.where(f)

    total = await db.scalar(count_query) or 0
    result = await db.execute(
        base_query.order_by(Component.created_at.desc()).limit(limit).offset(offset)
    )
    items = list(result.scalars().all())
    stats = await _compute_stats(db)

    return ComponentListResponse(items=items, total=total, limit=limit, offset=offset, stats=stats)


@router.post("", response_model=ComponentRead, status_code=status.HTTP_201_CREATED)
async def create_component(
    payload: ComponentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Component:
    if payload.sku:
        existing = await db.scalar(select(Component).where(Component.sku == payload.sku))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A component with SKU '{payload.sku}' already exists.",
            )

    component = Component(**payload.model_dump(), created_by=current_user.id)
    db.add(component)
    await db.commit()
    return await _get_component_or_404(db, component.id)


@router.get("/{component_id}", response_model=ComponentRead)
async def get_component(
    component_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Component:
    return await _get_component_or_404(db, component_id)


@router.patch("/{component_id}", response_model=ComponentRead)
async def update_component(
    component_id: uuid.UUID,
    payload: ComponentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Component:
    component = await _get_component_or_404(db, component_id)

    updates = payload.model_dump(exclude_unset=True)
    if "sku" in updates and updates["sku"] and updates["sku"] != component.sku:
        existing = await db.scalar(select(Component).where(Component.sku == updates["sku"]))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A component with SKU '{updates['sku']}' already exists.",
            )

    for field_name, value in updates.items():
        setattr(component, field_name, value)

    await db.commit()
    return await _get_component_or_404(db, component_id)


@router.delete("/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_component(
    component_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    component = await _get_component_or_404(db, component_id)
    await db.delete(component)
    await db.commit()


@router.post("/{component_id}/image", response_model=ComponentRead)
async def upload_component_image_route(
    component_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Component:
    component = await _get_component_or_404(db, component_id)
    image_url = await upload_component_image(file, component_id=component_id)
    component.image_url = image_url
    await db.commit()
    return await _get_component_or_404(db, component_id)
