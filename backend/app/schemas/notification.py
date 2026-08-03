"""Request/response models for the shared notification feed."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationType


class NotificationRead(BaseModel):
    """Named to match the ComponentRead/ProjectRead convention elsewhere
    in this codebase — not to be confused with the NotificationReceipt
    model, which is the thing that actually makes `is_read` true."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    title: str
    message: str
    link: str | None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationRead]
    unread_count: int
    total: int
    limit: int
    offset: int


class UnreadCountResponse(BaseModel):
    unread_count: int
