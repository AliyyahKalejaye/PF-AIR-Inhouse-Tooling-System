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

    Review is a single sign-off (`reviewed_by` + `review_notes`) by
    whichever person the requester tagged as `assigned_approver` — there's
    no real admin-provisioning flow in this app (anyone can sign up, and
    nothing ever promotes a user to UserRole.admin in practice), so
    approval routing is per-request and by-person rather than by role. See
    api/routes/ecr.py's approve_ecr / reject_ecr: only the tagged
    `assigned_approver` can decide on a request, which also means a
    request left untagged can't be approved or rejected until it's edited
    to name someone.

    Editing and deleting are both locked to `status == submitted` — once a
    request has been decided (approved/rejected/implemented) it's a record
    of what actually happened and shouldn't quietly change shape after the
    fact. Within that window the requester can edit their own still-open
    request or withdraw it; UserRole.admin (if a row is ever manually
    flipped to it) can still act on anything as an escape hatch — see
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

    # Who's expected to review this — any existing user, tagged by email;
    # not gated to a role since this app has no real admin-provisioning
    # flow. This is the actual approval routing, not just a notification:
    # only this user can approve/reject the request (see approve_ecr /
    # reject_ecr in api/routes/ecr.py). Optional — an untagged request just
    # can't be decided on until it's edited to add someone. See
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

    # Discussion trail — see ECRComment below. Ordered oldest-first (how a
    # conversation reads); cascade-deleted with the request since a
    # comment has no meaning detached from what it's discussing.
    comments: Mapped[list["ECRComment"]] = relationship(
        back_populates="ecr", cascade="all, delete-orphan", order_by="ECRComment.created_at"
    )


class ECRComment(UUIDPkMixin, TimestampMixin, Base):
    """One message in an ECR's discussion trail. No separate permission
    model: anyone who can load the request (every authenticated user —
    see get_ecr in api/routes/ecr.py) can read and post its comments,
    regardless of status — a decided request can still be discussed, it
    just can't be edited or have its own decision re-made.

    Also doubles as a reminder mechanism for a request that's stalled
    awaiting a decision: posting one notifies whichever of
    {assigned_approver, requester} isn't the comment's own author, so a
    nudge in the thread actually reaches the person who'd otherwise never
    see it unless they happened to revisit the page. See
    notify_ecr_commented in app/services/notifications.py.
    """

    __tablename__ = "ecr_comments"

    ecr_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("engineering_change_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    ecr: Mapped[EngineeringChangeRequest] = relationship(back_populates="comments")

    # SET NULL rather than CASCADE on the author's own account deletion —
    # a comment's text is still meaningful history for the thread even if
    # the person who wrote it is gone (same reasoning as
    # EngineeringChangeRequest.requested_by).
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    author: Mapped[User | None] = relationship()

    body: Mapped[str] = mapped_column(Text, nullable=False)
