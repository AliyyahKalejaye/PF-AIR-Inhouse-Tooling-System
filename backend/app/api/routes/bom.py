import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.bom import BOM, BOMItem, BOMItemStatus
from app.models.component import Component
from app.models.user import User
from app.schemas.inventory import (
    BOMCheckResponse,
    BOMItemRead,
    BOMReserveResponse,
    BOMReserveResult,
    BOMReserveSkipped,
    BOMSummary,
)
from app.services.bom_matcher import extract_bom_lines, match_bom_line
from app.services.spreadsheet import parse_spreadsheet

router = APIRouter(prefix="/bom", tags=["inventory"])


async def _get_bom_or_404(db: AsyncSession, bom_id: uuid.UUID) -> BOM:
    result = await db.execute(
        select(BOM)
        .options(
            selectinload(BOM.items)
            .selectinload(BOMItem.matched_component)
            .selectinload(Component.category),
            selectinload(BOM.items)
            .selectinload(BOMItem.suggested_component)
            .selectinload(Component.category),
        )
        .where(BOM.id == bom_id)
    )
    bom = result.scalar_one_or_none()
    if bom is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BOM not found.")
    return bom


def _to_summary(items: list[BOMItem]) -> BOMSummary:
    return BOMSummary(
        available=sum(1 for i in items if i.status == BOMItemStatus.available),
        low_stock=sum(1 for i in items if i.status == BOMItemStatus.low_stock),
        missing=sum(1 for i in items if i.status == BOMItemStatus.missing),
    )


@router.post("/check", response_model=BOMCheckResponse)
async def check_bom(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BOMCheckResponse:
    rows, columns, _sheet = await parse_spreadsheet(file)
    lines = extract_bom_lines(rows, columns)
    if not lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Couldn't find any line items in that file.",
        )

    components = list((await db.execute(select(Component))).scalars().all())

    bom = BOM(filename=file.filename or "bom.csv", uploaded_by=current_user.id)
    db.add(bom)
    await db.flush()  # populate bom.id (client-side default) without committing yet

    for raw_name, quantity_requested in lines:
        result = match_bom_line(raw_name, quantity_requested, components)
        db.add(
            BOMItem(
                bom_id=bom.id,
                raw_name=result.raw_name,
                quantity_requested=result.quantity_requested,
                status=BOMItemStatus(result.status),
                matched_component_id=result.matched_component_id,
                suggested_component_id=result.suggested_component_id,
                suggested_match_score=result.suggested_match_score,
            )
        )

    await db.commit()
    bom = await _get_bom_or_404(db, bom.id)

    return BOMCheckResponse(
        bom_id=bom.id,
        filename=bom.filename,
        items=[BOMItemRead.model_validate(item) for item in bom.items],
        summary=_to_summary(bom.items),
    )


@router.post("/{bom_id}/reserve", response_model=BOMReserveResponse)
async def reserve_bom(
    bom_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BOMReserveResponse:
    bom = await _get_bom_or_404(db, bom_id)
    if bom.reserved_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This BOM has already been reserved.",
        )

    reserved: list[BOMReserveResult] = []
    skipped: list[BOMReserveSkipped] = []

    for item in bom.items:
        if item.status != BOMItemStatus.available or item.matched_component is None:
            reason = (
                "No confident match in inventory."
                if item.status == BOMItemStatus.missing
                else "Insufficient or low stock to fully reserve."
            )
            skipped.append(
                BOMReserveSkipped(bom_item_id=item.id, raw_name=item.raw_name, reason=reason)
            )
            continue

        component = item.matched_component
        component.quantity = max(component.quantity - item.quantity_requested, 0)
        reserved.append(
            BOMReserveResult(
                component_id=component.id,
                name=component.name,
                quantity_deducted=item.quantity_requested,
                remaining_quantity=component.quantity,
            )
        )

    bom.reserved_at = datetime.now(UTC)
    await db.commit()

    return BOMReserveResponse(bom_id=bom.id, reserved=reserved, skipped=skipped)
