"""Request/response models for the Projects Progress Report tool (Phase 6/7).

Document-parsing note: the "Upload a Document" creation path is explicitly
rule-based (heading match against a fixed set of known section names), not
AI/LLM extraction — see app/services/document_parser.py's module docstring.
The MIL (Minimum Item List) is never auto-extracted from a document: it
links to real Component Inventory rows by id, and free text in a write-up
("Airframe, ESC x2, FC...") can't be safely turned into that link without a
fuzzy-matching system of its own (the BOM matcher already does this for a
different flow — see app/services/bom_matcher.py). MIL items are always
added explicitly via the /projects/{id}/mil-items endpoints, whether the
project was created manually or from a parsed document.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.project import MediaType, ProjectStatus
from app.schemas.inventory import ComponentRead

# The 7 text fields a project write-up's headings are matched against.
# Order matches the standard template and the manual-entry form.
PROJECT_TEXT_FIELDS = [
    "title",
    "problem_statement",
    "abstract",
    "specifications",
    "requirement",
    "next_steps",
    "note",
]


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    problem_statement: str | None = None
    abstract: str | None = None
    specifications: str | None = None
    requirement: str | None = None
    next_steps: str | None = None
    note: str | None = None
    status: ProjectStatus = ProjectStatus.active


class ProjectUpdate(BaseModel):
    """Every field optional — this is a partial-update (PATCH) schema, and
    is the same shape the manual-entry form re-uses for editing."""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    problem_statement: str | None = None
    abstract: str | None = None
    specifications: str | None = None
    requirement: str | None = None
    next_steps: str | None = None
    note: str | None = None
    status: ProjectStatus | None = None


class ProjectMediaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    media_type: MediaType
    file_url: str
    filename: str | None
    thumbnail_url: str | None
    created_at: datetime


class MILItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    component: ComponentRead
    quantity_required: int
    created_at: datetime


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    problem_statement: str | None
    abstract: str | None
    specifications: str | None
    requirement: str | None
    next_steps: str | None
    note: str | None
    status: ProjectStatus
    media: list[ProjectMediaRead]
    mil_items: list[MILItemRead]
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def snippet(self) -> str:
        """Short one-line preview for the Projects list cards — prefers
        the problem statement (what the project is for) over the abstract
        (how it's solved), falling back to empty if neither is filled in
        yet (e.g. a just-created manual-entry project)."""
        source = self.problem_statement or self.abstract or ""
        source = " ".join(source.split())  # collapse newlines/whitespace
        return source if len(source) <= 160 else source[:157].rstrip() + "…"


class ProjectListItem(BaseModel):
    """Deliberately lighter than ProjectRead — the Projects list only ever
    renders a title, a one-line snippet, a status pill, and an updated
    date (see the approved projects-list mockup), so the list endpoint
    doesn't eager-load every project's media/MIL relationships just to
    discard them. Full detail, including media and MIL items, is only
    fetched per-project via GET /projects/{id}."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    problem_statement: str | None
    abstract: str | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def snippet(self) -> str:
        source = self.problem_statement or self.abstract or ""
        source = " ".join(source.split())
        return source if len(source) <= 160 else source[:157].rstrip() + "…"


# --- Media ---


class ProjectMediaLinkCreate(BaseModel):
    """Attaches media by URL rather than a file upload — used for `code`
    entries (a repo URL, never uploaded) and for attaching images that
    were already uploaded to R2 during document parsing (no need to
    re-upload something the parser already staged)."""

    media_type: MediaType
    file_url: str = Field(min_length=1, max_length=1000)
    filename: str | None = Field(default=None, max_length=300)


# --- MIL (Minimum Item List) ---


class MILItemCreate(BaseModel):
    component_id: uuid.UUID
    quantity_required: int = Field(default=1, ge=1)


class MILItemUpdate(BaseModel):
    quantity_required: int = Field(ge=1)


# --- Document parsing (rule-based heading match) ---


class ParsedField(BaseModel):
    value: str | None
    matched: bool
    heading: str | None = None  # the literal heading text that matched
    page: int | None = None  # 1-indexed; PDF only (docx has no page concept pre-render)


class ParsedMedia(BaseModel):
    """An image embedded in the uploaded document, already uploaded to R2
    under a staging key — pass its file_url straight to
    POST /projects/{id}/media/link once the project is saved, no need to
    re-upload the same bytes."""

    filename: str
    media_type: MediaType
    file_url: str


class DocumentParseResponse(BaseModel):
    filename: str
    doc_type: str  # "docx" | "pdf"
    page_count: int | None
    fields: dict[str, ParsedField]
    matched_count: int
    total_fields: int
    media: list[ParsedMedia]
