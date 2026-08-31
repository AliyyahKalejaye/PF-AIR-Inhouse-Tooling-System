import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.component import Component
from app.models.project import Project
from app.models.user import User


class ECRStatus(enum.StrEnum):
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"
    implemented = "implemented"


class ECRPriority(enum.StrEnum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class EngineeringChangeRequest(UUIDPkMixin, TimestampMixin, Base):
    """An Engineering Change Request: a formal, reviewed proposal to change
    something about an already-released project or inventory component.

    Deliberately does NOT auto-apply the change once approved (e.g. editing
    the linked Component/Project row itself) — the whole point of an ECR is
    that a human makes the actual edit deliberately, not that a status flip
    does it silently. `implemented` is the requester or an admin confirming
    afterward that the real-world change happened, closing the loop for the
    audit trail without this table ever mutating inventory/project data on
    its own.

    Review is a single admin sign-off (`reviewed_by` + `review_notes`)
    rather than a multi-department chain (design/manufacturing/QA) — the
    only role structure this app has is UserRole.engineer/.admin (see
    app/models/user.py), so that's what the workflow is built against. See
    app/api/deps.py's require_admin.

    Editing and deleting are both locked to `status == submitted` — once a
    request has been decided (approved/rejected/implemented) it's a record
    of what actually happened and shouldn't quietly change shape after the
    fact. Within that window, both the requester (editing their own
    still-open request, or withdrawing it) and any admin can act — see
    api/routes/ecr.py's update_ecr / delete_ecr for the exact permission
    check.
    """

    __tablename__ = "engineering_change_requests"

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    # Why the change is needed — required, since an ECR with no stated
    # reason gives a reviewer nothing to evaluate.
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # What the change actually is (optional: some requests are adequately
    # explained by title + reason alone, e.g. a one-line spec correction).
    description: Mapped[str | None] = mapped_column(Text)

    status: Mapped[ECRStatus] = mapped_column(
        Enum(ECRStatus, name="ecr_status", native_enum=False, length=20),
        default=ECRStatus.submitted,
        nullable=False,
    )
    priority: Mapped[ECRPriority] = mapped_column(
        Enum(ECRPriority, name="ecr_priority", native_enum=False, length=20),
        default=ECRPriority.medium,
        nullable=False,
    )

    # Both optional and independent — an ECR can reference a project, a
    # component, both, or (rarely) neither (e.g. a process change with no
    # single row to point at).
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    # No back_populates — Project doesn't need a reverse `ecrs` collection
    # of its own, same one-directional pattern as MILItem.component in
    # app/models/project.py.
    project: Mapped[Project | None] = relationship()

    component_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("components.id", ondelete="SET NULL")
    )
    component: Mapped[Component | None] = relationship()
    # Free-text fallback for a part that isn't in the Inventory catalog yet
    # (a new part being proposed, or one nobody's logged as a Component
    # row) — only meaningful when component_id is null; the create route
    # clears one whenever the other is set, so a request is never "about"
    # both a real component and a freeform name at once.
    component_name: Mapped[str | None] = mapped_column(String(300))

    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    requester: Mapped[User | None] = relationship(foreign_keys=[requested_by])

    # Who's expected to review this — optional (an unassigned request is
    # still visible to every admin on the ECR list, just not targeted at
    # one). Deliberately a User, not a role: assigning "an admin" in the
    # abstract wouldn't give notify_ecr_submitted anyone concrete to
    # target. The create route only accepts an admin here — see
    # ECRCreate.assigned_approver_id / GET /ecr/approvers.
    assigned_approver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    assigned_approver: Mapped[User | None] = relationship(foreign_keys=[assigned_approver_id])

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewer: Mapped[User | None] = relationship(foreign_keys=[reviewed_by])
    review_notes: Mapped[str | None] = mapped_column(Text)
