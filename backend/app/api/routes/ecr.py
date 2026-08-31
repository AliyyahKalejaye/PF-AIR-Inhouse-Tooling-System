import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.component import Component
from app.models.ecr import ECRStatus, EngineeringChangeRequest
from app.models.project import Project
from app.models.user import User
from app.schemas.ecr import ECRCreate, ECRDecision, ECRListItem, ECRRead
from app.services.notifications import (
    notify_ecr_decided,
    notify_ecr_implemented,
    notify_ecr_submitted,
)

router = APIRouter(prefix="/ecr", tags=["engineering-change-requests"])

_EAGER_LOAD = (
    selectinload(EngineeringChangeRequest.project),
    selectinload(EngineeringChangeRequest.component),
    selectinload(EngineeringChangeRequest.requester),
    selectinload(EngineeringChangeRequest.reviewer),
)


async def _get_ecr_or_404(db: AsyncSession, ecr_id: uuid.UUID) -> EngineeringChangeRequest:
    result = await db.execute(
        select(EngineeringChangeRequest)
        .options(*_EAGER_LOAD)
        .where(EngineeringChangeRequest.id == ecr_id)
    )
    ecr = result.scalar_one_or_none()
    if ecr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found."
        )
    return ecr


@router.get("", response_model=list[ECRListItem])
async def list_ecrs(
    ecr_status: ECRStatus | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EngineeringChangeRequest]:
    query = select(EngineeringChangeRequest).options(*_EAGER_LOAD)
    if ecr_status is not None:
        query = query.where(EngineeringChangeRequest.status == ecr_status)
    result = await db.execute(query.order_by(EngineeringChangeRequest.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ECRRead, status_code=status.HTTP_201_CREATED)
async def create_ecr(
    payload: ECRCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngineeringChangeRequest:
    if payload.project_id is not None:
        project = await db.get(Project, payload.project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Project not found."
            )
    if payload.component_id is not None:
        component = await db.get(Component, payload.component_id)
        if component is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Component not found."
            )

    ecr = EngineeringChangeRequest(**payload.model_dump(), requested_by=current_user.id)
    db.add(ecr)
    await db.flush()
    await notify_ecr_submitted(db, ecr)
    await db.commit()
    return await _get_ecr_or_404(db, ecr.id)


@router.get("/{ecr_id}", response_model=ECRRead)
async def get_ecr(
    ecr_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngineeringChangeRequest:
    return await _get_ecr_or_404(db, ecr_id)


@router.post("/{ecr_id}/approve", response_model=ECRRead)
async def approve_ecr(
    ecr_id: uuid.UUID,
    payload: ECRDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> EngineeringChangeRequest:
    ecr = await _get_ecr_or_404(db, ecr_id)
    if ecr.status != ECRStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request is already {ecr.status.value}.",
        )
    ecr.status = ECRStatus.approved
    ecr.reviewed_by = current_user.id
    ecr.review_notes = payload.review_notes
    await notify_ecr_decided(db, ecr)
    await db.commit()
    return await _get_ecr_or_404(db, ecr_id)


@router.post("/{ecr_id}/reject", response_model=ECRRead)
async def reject_ecr(
    ecr_id: uuid.UUID,
    payload: ECRDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> EngineeringChangeRequest:
    ecr = await _get_ecr_or_404(db, ecr_id)
    if ecr.status != ECRStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This request is already {ecr.status.value}.",
        )
    ecr.status = ECRStatus.rejected
    ecr.reviewed_by = current_user.id
    ecr.review_notes = payload.review_notes
    await notify_ecr_decided(db, ecr)
    await db.commit()
    return await _get_ecr_or_404(db, ecr_id)


@router.post("/{ecr_id}/implement", response_model=ECRRead)
async def implement_ecr(
    ecr_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngineeringChangeRequest:
    """Marks an approved ECR as implemented — a manual confirmation that
    the actual edit (to the Component/Project row, drawing, or process)
    has been made elsewhere, not something this endpoint does itself. Any
    authenticated user can flip this, not just admins: the requester is
    usually the one who did the work and knows it's done, and gatekeeping
    that behind admin-only would just mean an admin closes the loop on
    someone else's behalf for no real benefit."""
    ecr = await _get_ecr_or_404(db, ecr_id)
    if ecr.status != ECRStatus.approved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an approved request can be marked implemented.",
        )
    ecr.status = ECRStatus.implemented
    await notify_ecr_implemented(db, ecr)
    await db.commit()
    return await _get_ecr_or_404(db, ecr_id)


@router.delete("/{ecr_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ecr(
    ecr_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    ecr = await _get_ecr_or_404(db, ecr_id)
    await db.delete(ecr)
    await db.commit()
