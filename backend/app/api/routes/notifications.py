import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.notification import Notification, NotificationReceipt
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.notification import NotificationListResponse, NotificationRead, UnreadCountResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _visible_to(user_id: uuid.UUID):
    """A notification is visible to a user if it's a broadcast
    (target_user_id is null) or specifically targeted at them — see
    app/models/notification.py's Notification.target_user_id docstring.
    Every query below that lists/counts notifications filters through
    this, so a targeted one (e.g. an ECR assigned to a specific admin)
    never appears in anyone else's feed or unread count."""
    return or_(Notification.target_user_id.is_(None), Notification.target_user_id == user_id)


def _unread_subquery(user_id: uuid.UUID):
    """Notification ids the given user has NOT yet read — a NOT IN
    against this is how every endpoint below computes "unread"."""
    return select(NotificationReceipt.notification_id).where(
        NotificationReceipt.user_id == user_id
    )


async def _unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(_visible_to(user_id), Notification.id.notin_(_unread_subquery(user_id)))
    )
    return count or 0


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    base_query = select(Notification).where(_visible_to(current_user.id))
    count_query = select(func.count()).select_from(Notification).where(_visible_to(current_user.id))
    if unread_only:
        base_query = base_query.where(Notification.id.notin_(_unread_subquery(current_user.id)))
        count_query = count_query.where(
            Notification.id.notin_(_unread_subquery(current_user.id))
        )

    total = await db.scalar(count_query) or 0
    result = await db.execute(
        base_query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    )
    items = list(result.scalars().all())

    read_ids: set[uuid.UUID] = set()
    if items:
        read_result = await db.execute(
            select(NotificationReceipt.notification_id).where(
                NotificationReceipt.user_id == current_user.id,
                NotificationReceipt.notification_id.in_([n.id for n in items]),
            )
        )
        read_ids = set(read_result.scalars().all())

    return NotificationListResponse(
        items=[
            NotificationRead(
                id=n.id,
                type=n.type,
                title=n.title,
                message=n.message,
                link=n.link,
                is_read=n.id in read_ids,
                created_at=n.created_at,
            )
            for n in items
        ],
        unread_count=await _unread_count(db, current_user.id),
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountResponse:
    return UnreadCountResponse(unread_count=await _unread_count(db, current_user.id))


@router.post("/read-all", response_model=MessageResponse)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    unread_ids = (
        await db.execute(
            select(Notification.id).where(
                _visible_to(current_user.id),
                Notification.id.notin_(_unread_subquery(current_user.id)),
            )
        )
    ).scalars().all()

    for notification_id in unread_ids:
        db.add(NotificationReceipt(notification_id=notification_id, user_id=current_user.id))
    if unread_ids:
        await db.commit()

    return MessageResponse(message="All notifications marked as read.")


@router.post("/{notification_id}/read", response_model=MessageResponse)
async def mark_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    notification = await db.get(Notification, notification_id)
    if notification is None or (
        notification.target_user_id is not None and notification.target_user_id != current_user.id
    ):
        # Same 404 for "doesn't exist" and "exists but is targeted at
        # someone else" — no reason to let a user distinguish the two.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")

    existing = await db.scalar(
        select(NotificationReceipt).where(
            NotificationReceipt.notification_id == notification_id,
            NotificationReceipt.user_id == current_user.id,
        )
    )
    if existing is None:
        db.add(NotificationReceipt(notification_id=notification_id, user_id=current_user.id))
        await db.commit()

    return MessageResponse(message="Marked as read.")
