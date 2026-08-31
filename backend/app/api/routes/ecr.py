import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.component import Component
from app.models.ecr import ECRStatus, EngineeringChangeRequest
from app.models.project import Project
from app.models.user import User, UserRole
from app.schemas.ecr import ECRCreate, ECRDecision, ECRListItem, ECRRead, ECRUpdate, ECRUserRef
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
    selectinload(EngineeringChangeRequest.assigned_approver),
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


async def _validate_refs(
    db: AsyncSession,
    *,
    project_id: uuid.UUID | None,
    component_id: uuid.UUID | None,
    assigned_approver_id: uuid.UUID | None,
) -> None:
    """Shared by create_ecr and update_ecr — both need the same "does this
    id actually point at something real" checks before the row is written."""
    if project_id is not None:
        project = await db.get(Project, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Project not found."
            )
    if component_id is not None:
        component = await db.get(Component, component_id)
        if component is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Component not found."
            )
    if assigned_approver_id is not None:
        approver = await db.get(User, assigned_approver_id)
        if approver is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="That user could not be found.",
            )


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


@router.get("/approvers", response_model=list[ECRUserRef])
async def list_approvers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[User]:
    """Every user — populates the "who needs to approve" picker on the New
    Change Request form. Not filtered to UserRole.admin: this app has no
    real admin-provisioning flow (anyone can sign up, nobody's ever
    actually promoted), so approval is routed to a specific tagged person
    rather than gated by role. Registered before GET /{ecr_id} so
    "approvers" doesn't get swallowed by that route's uuid path param."""
    result = await db.execute(select(User).order_by(User.name))
    return list(result.scalars().all())


@router.post("", response_model=ECRRead, status_code=status.HTTP_201_CREATED)
async def create_ecr(
    payload: ECRCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngineeringChangeRequest:
    await _validate_refs(
        db,
        project_id=payload.project_id,
        component_id=payload.component_id,
        assigned_approver_id=payload.assigned_approver_id,
    )

    data = payload.model_dump()
    # A real component (component_id) always wins over the freeform
    # fallback name — see ECRCreate.component_name's docstring.
    if data["component_id"] is not None:
        data["component_name"] = None

    ecr = EngineeringChangeRequest(**data, requested_by=current_user.id)
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


@router.patch("/{ecr_id}", response_model=ECRRead)
async def update_ecr(
    ecr_id: uuid.UUID,
    payload: ECRUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngineeringChangeRequest:
    """Edit a still-open request. Locked to `status == submitted` — see the
    EngineeringChangeRequest docstring — once it's been decided, this is a
    record of what happened and shouldn't quietly change shape. Allowed for
    an admin at any time, or the original requester while it's still theirs
    to edit."""
    ecr = await _get_ecr_or_404(db, ecr_id)

    is_owner = current_user.id == ecr.requested_by
    if not (current_user.role == UserRole.admin or is_owner):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin or the original requester can edit this request.",
        )
    if ecr.status != ECRStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a still-submitted request can be edited.",
        )

    data = payload.model_dump(exclude_unset=True)
    await _validate_refs(
        db,
        project_id=data.get("project_id", ecr.project_id),
        component_id=data.get("component_id", ecr.component_id),
        assigned_approver_id=data.get("assigned_approver_id", ecr.assigned_approver_id),
    )
    if "component_id" in data and data["component_id"] is not None:
        data["component_name"] = None

    for field, value in data.items():
        setattr(ecr, field, value)

    await db.commit()
    return await _get_ecr_or_404(db, ecr_id)


def _require_tagged_approver(ecr: EngineeringChangeRequest, current_user: User) -> None:
    """approve_ecr and reject_ecr both gate on the same rule: only the
    person tagged as `assigned_approver` may decide. Not role-based (see
    the EngineeringChangeRequest docstring for why) — an untagged request
    can't be decided on by anyone until it's edited to name someone."""
    if ecr.assigned_approver_id is None or current_user.id != ecr.assigned_approver_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the person tagged as approver on this request can decide on it.",
        )


@router.post("/{ecr_id}/approve", response_model=ECRRead)
async def approve_ecr(
    ecr_id: uuid.UUID,
    payload: ECRDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EngineeringChangeRequest:
    ecr = await _get_ecr_or_404(db, ecr_id)
    _require_tagged_approver(ecr, current_user)
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
    current_user: User = Depends(get_current_user),
) -> EngineeringChangeRequest:
    ecr = await _get_ecr_or_404(db, ecr_id)
    _require_tagged_approver(ecr, current_user)
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
    current_user: User = Depends(get_current_user),
) -> None:
    """An admin can delete a request at any point in its life. The original
    requester can only withdraw it while it's still `submitted` — once it's
    been decided it's part of the audit trail, not theirs alone to remove."""
    ecr = await _get_ecr_or_404(db, ecr_id)

    is_owner = current_user.id == ecr.requested_by
    can_delete = current_user.role == UserRole.admin or (
        is_owner and ecr.status == ECRStatus.submitted
    )
    if not can_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin, or the requester while it's still submitted, can delete this.",
        )

    await db.delete(ecr)
    await db.commit()
