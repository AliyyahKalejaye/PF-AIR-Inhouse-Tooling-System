import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin

# CLIP ViT-B/32 (or similar) produces 512-dim embeddings. If a different
# model is picked in Phase 4, change this constant and re-run a migration
# to alter the column + rebuild the HNSW index — don't just change it here.
EMBEDDING_DIM = 512


class Category(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    components: Mapped[list["Component"]] = relationship(back_populates="category")


class Component(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "components"

    name: Mapped[str] = mapped_column(String(300), nullable=False)
    type: Mapped[str] = mapped_column(String(150), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    brand: Mapped[str | None] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000))

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL")
    )
    category: Mapped[Category | None] = relationship(back_populates="components")

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    # Combined text+image embedding — populated by the Phase 4 embedding
    # pipeline (background job via Redis), not set synchronously on create.
    # Nullable until that job runs; HNSW index only indexes non-null rows.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)

    @property
    def is_low_stock(self) -> bool:
        return 0 < self.quantity <= self.low_stock_threshold

    @property
    def is_out_of_stock(self) -> bool:
        return self.quantity <= 0
