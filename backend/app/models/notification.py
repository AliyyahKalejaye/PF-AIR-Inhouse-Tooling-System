import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin


class NotificationType(enum.StrEnum):
    component_out_of_stock = "component_out_of_stock"
    component_low_stock = "component_low_stock"
    component_deleted = "component_deleted"
    project_created = "project_created"
    project_status_changed = "project_status_changed"
    project_deleted = "project_deleted"


class Notification(UUIDPkMixin, TimestampMixin, Base):
    """A single event in the shared notification feed.

    The app has no per-user ownership model (no "my projects", no assigned
    components — see app/services/notifications.py's module docstring), so
    every notification broadcasts to every user. Per-user read/unread
    state is tracked separately in NotificationReceipt rather than as a
    column here, since one notification has many readers.
    """

    __tablename__ = "notifications"

    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type", native_enum=False, length=40),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    # Frontend route to send the user to on click — e.g. "/inventory" or
    # "/projects/{id}". Null for events about a row that's already gone
    # (e.g. a deleted project has nowhere left to link to).
    link: Mapped[str | None] = mapped_column(String(500))

    receipts: Mapped[list["NotificationReceipt"]] = relationship(
        back_populates="notification", cascade="all, delete-orphan"
    )


class NotificationReceipt(UUIDPkMixin, TimestampMixin, Base):
    """Marks one user as having read one notification. Existence of a row
    = read; absence = unread. `created_at` (from TimestampMixin) doubles
    as the read timestamp; `updated_at` is unused but kept for the same
    reason every other model in this codebase carries both — consistency
    beats a one-off leaner mixin for a single table."""

    __tablename__ = "notification_receipts"
    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_user_read"),
    )

    notification_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False
    )
    notification: Mapped[Notification] = relationship(back_populates="receipts")

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
