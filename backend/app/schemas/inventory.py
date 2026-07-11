"""Request/response models for the Inventory Management tool (Phase 4/5).

Search note: the `Component.embedding` column exists (populated later by an
async Redis-queued job — see app/services/embedding_queue.py) for the
eventual CLIP-style semantic + image search shown in the mockups. Until a
concrete embedding model is wired in, list/search below runs on plain
Postgres ILIKE text matching across name/description/brand/type/sku. This
keeps search fully working today without committing this deploy to a heavy
ML dependency (torch/open-clip) that Render's free/starter tier may not
have the memory to run.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.bom import BOMItemStatus


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str


class ComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    type: str = Field(min_length=1, max_length=150)
    sku: str | None = Field(default=None, max_length=100)
    brand: str | None = Field(default=None, max_length=150)
    description: str | None = None
    quantity: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=10, ge=0)
    image_url: str | None = Field(default=None, max_length=1000)
    category_id: uuid.UUID | None = None


class ComponentUpdate(BaseModel):
    """Every field optional — this is a partial-update (PATCH) schema."""

    name: str | None = Field(default=None, min_length=1, max_length=300)
    type: str | None = Field(default=None, min_length=1, max_length=150)
    sku: str | None = Field(default=None, max_length=100)
    brand: str | None = Field(default=None, max_length=150)
    description: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    low_stock_threshold: int | None = Field(default=None, ge=0)
    image_url: str | None = Field(default=None, max_length=1000)
    category_id: uuid.UUID | None = None


class ComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: str
    sku: str | None
    brand: str | None
    description: str | None
    quantity: int
    low_stock_threshold: int
    image_url: str | None
    category: CategoryRead | None
    is_low_stock: bool
    is_out_of_stock: bool
    created_at: datetime
    updated_at: datetime


class InventoryStats(BaseModel):
    total_skus: int
    low_stock: int
    out_of_stock: int
    categories: int


class ComponentListResponse(BaseModel):
    items: list[ComponentRead]
    total: int
    limit: int
    offset: int
    stats: InventoryStats


# --- BOM check ---


class BOMItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    raw_name: str
    quantity_requested: int
    status: BOMItemStatus
    matched_component: ComponentRead | None = None
    suggested_component: ComponentRead | None = None
    suggested_match_score: float | None = None


class BOMSummary(BaseModel):
    available: int
    low_stock: int
    missing: int


class BOMCheckResponse(BaseModel):
    bom_id: uuid.UUID
    filename: str
    items: list[BOMItemRead]
    summary: BOMSummary


class BOMReserveResult(BaseModel):
    component_id: uuid.UUID
    name: str
    quantity_deducted: int
    remaining_quantity: int


class BOMReserveSkipped(BaseModel):
    bom_item_id: uuid.UUID
    raw_name: str
    reason: str


class BOMReserveResponse(BaseModel):
    bom_id: uuid.UUID
    reserved: list[BOMReserveResult]
    skipped: list[BOMReserveSkipped]


# --- Bulk import ---

# The seven fields a spreadsheet column can be mapped to. Deliberately
# excludes `sku` — per the approved bulk-import mockup, vendor/supplier SKUs
# in an imported sheet don't map onto this system's own internal SKU field,
# so that column is always left for the user to map elsewhere or skip.
BULK_IMPORT_TARGET_FIELDS = [
    "name",
    "type",
    "category",
    "brand",
    "description",
    "quantity",
    "image_url",
]


class BulkImportColumn(BaseModel):
    source_column: str
    sample: str | None
    mapped_field: str | None  # one of BULK_IMPORT_TARGET_FIELDS, or None
    status: str  # "auto" | "manual"


class BulkImportPreviewResponse(BaseModel):
    filename: str
    rows_detected: int
    columns_detected: int
    sheet: str | None
    columns: list[BulkImportColumn]
    rows: list[dict[str, str | None]]
    warnings: list[str]


class BulkImportCommitRequest(BaseModel):
    filename: str
    mapping: dict[str, str]  # source_column -> target field, or "skip"
    rows: list[dict[str, str | None]]


class BulkImportSkippedRow(BaseModel):
    row_index: int
    reason: str


class BulkImportCommitResponse(BaseModel):
    created: int
    skipped_rows: list[BulkImportSkippedRow]
    warnings: list[str]
