import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.component import Component


class BOMItemStatus(enum.StrEnum):
    available = "available"
    low_stock = "low_stock"
    missing = "missing"


class BOM(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "boms"

    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # Set once "Reserve available items" is actually applied — guards
    # against double-clicking (or retrying) reserve from decrementing
    # inventory quantities a second time for the same BOM.
    reserved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["BOMItem"]] = relationship(
        back_populates="bom", cascade="all, delete-orphan"
    )


class BOMItem(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "bom_items"

    bom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boms.id", ondelete="CASCADE"), nullable=False
    )
    bom: Mapped[BOM] = relationship(back_populates="items")

    # Exactly as it appeared in the uploaded BOM file, before any matching.
    raw_name: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity_requested: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    matched_component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("components.id", ondelete="SET NULL")
    )
    # Two FKs to components.id from this table (matched + suggested) means
    # SQLAlchemy can't infer which column each relationship uses on its
    # own — foreign_keys= disambiguates.
    matched_component: Mapped[Component | None] = relationship(foreign_keys=[matched_component_id])
    status: Mapped[BOMItemStatus] = mapped_column(
        Enum(BOMItemStatus, name="bom_item_status", native_enum=False, length=20),
        nullable=False,
    )

    # Populated only when status == missing — the Phase 4 BOM matcher's
    # fuzzy-match suggestion for a replacement part.
    suggested_component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("components.id", ondelete="SET NULL")
    )
    suggested_component: Mapped[Component | None] = relationship(
        foreign_keys=[suggested_component_id]
    )
    suggested_match_score: Mapped[float | None] = mapped_column(Float)
