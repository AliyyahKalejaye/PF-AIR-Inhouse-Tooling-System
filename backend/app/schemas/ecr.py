"""Request/response models for Engineering Change Requests (ECR).

Lightweight id+label reference schemas (ECRProjectRef / ECRComponentRef /
ECRUserRef) are used instead of the full ProjectRead/ComponentRead shapes —
an ECR card or detail view only ever needs enough to identify and link to
the related row, not its whole nested detail (same reasoning as
ProjectListItem in app/schemas/project.py)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.ecr import ECRStatus


class ECRProjectRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str


class ECRComponentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sku: str | None


class ECRUserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ECRCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    reason: str = Field(min_length=1)
    description: str | None = None
    project_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None


class ECRDecision(BaseModel):
    """Payload for approving or rejecting a submitted ECR — admin-only, see
    POST /ecr/{id}/approve and /ecr/{id}/reject in api/routes/ecr.py."""

    review_notes: str | None = None


class ECRRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    reason: str
    description: str | None
    status: ECRStatus
    project: ECRProjectRef | None
    component: ECRComponentRef | None
    requester: ECRUserRef | None
    reviewer: ECRUserRef | None
    review_notes: str | None
    created_at: datetime
    updated_at: datetime


class ECRListItem(BaseModel):
    """Deliberately lighter than ECRRead — no `description`/`review_notes`
    — same reasoning as ProjectListItem: the list view only ever renders a
    title, status pill, related project/component, and requester."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    reason: str
    status: ECRStatus
    project: ECRProjectRef | None
    component: ECRComponentRef | None
    requester: ECRUserRef | None
    created_at: datetime
    updated_at: datetime
