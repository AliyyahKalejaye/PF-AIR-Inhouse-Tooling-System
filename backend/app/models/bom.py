import enum
import uuid

from sqlalchemy import Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin


class BOMItemStatus(str, enum.Enum):
    available = "available"
    low_stock = "low_stock"
    missing = "missing"


class BOM(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "boms"

    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    items: Mapped[list["BOMItem"]] = relationship(back_populates="bom", cascade="all, delete-orphan")


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
    status: Mapped[BOMItemStatus] = mapped_column(
        Enum(BOMItemStatus, name="bom_item_status", native_enum=False, length=20),
        nullable=False,
    )

    # Populated only when status == missing — the Phase 4 BOM matcher's
    # nearest-neighbor suggestion for a replacement part.
    suggested_component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("components.id", ondelete="SET NULL")
    )
    suggested_match_score: Mapped[float | None] = mapped_column(Float)
