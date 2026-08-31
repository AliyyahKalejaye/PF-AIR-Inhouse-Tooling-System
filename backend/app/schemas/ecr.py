"""Request/response models for Engineering Change Requests (ECR).

Lightweight id+label reference schemas (ECRProjectRef / ECRComponentRef /
ECRUserRef) are used instead of the full ProjectRead/ComponentRead shapes —
an ECR card or detail view only ever needs enough to identify and link to
the related row, not its whole nested detail (same reasoning as
ProjectListItem in app/schemas/project.py)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.ecr import ECRPriority, ECRStatus


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
    # Included so the "who needs to approve" picker can search/display by
    # email, not just name — there's no admin role gating who can be
    # tagged (see GET /ecr/approvers), so email is what makes a specific
    # person unambiguous to pick out of the full user list.
    email: str


class ECRCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    reason: str = Field(min_length=1)
    description: str | None = None
    priority: ECRPriority = ECRPriority.medium
    project_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None
    # Free-text fallback when the part isn't in the Inventory catalog yet —
    # only used when component_id is left unset; the create route drops
    # this if component_id is also given (a real component wins). See
    # app/models/ecr.py's EngineeringChangeRequest.component_name.
    component_name: str | None = Field(default=None, max_length=300)
    # Who should review this — any existing user, tagged by email (there's
    # no admin role gating this: the app has no real admin-provisioning
    # flow, so "must be an admin" would mean nobody could ever be tagged).
    # This is the actual approval routing, not just a notification: only
    # the tagged user can approve/reject this request (see approve_ecr /
    # reject_ecr in api/routes/ecr.py). Optional — leaving it unset means
    # the request can't be approved or rejected by anyone until it's
    # edited to add someone.
    assigned_approver_id: uuid.UUID | None = None


class ECRUpdate(BaseModel):
    """Every field optional — partial-update (PATCH) schema, same pattern
    as ProjectUpdate/ComponentUpdate. Only usable while status is still
    `submitted` — see PATCH /ecr/{id} in api/routes/ecr.py; there's no
    `status` field here on purpose, since status only ever moves via the
    approve/reject/implement endpoints, never a generic field edit."""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    reason: str | None = Field(default=None, min_length=1)
    description: str | None = None
    priority: ECRPriority | None = None
    project_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None
    component_name: str | None = Field(default=None, max_length=300)
    assigned_approver_id: uuid.UUID | None = None


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
    priority: ECRPriority
    project: ECRProjectRef | None
    component: ECRComponentRef | None
    component_name: str | None
    requester: ECRUserRef | None
    assigned_approver: ECRUserRef | None
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
    priority: ECRPriority
    project: ECRProjectRef | None
    component: ECRComponentRef | None
    component_name: str | None
    requester: ECRUserRef | None
    assigned_approver: ECRUserRef | None
    created_at: datetime
    updated_at: datetime
