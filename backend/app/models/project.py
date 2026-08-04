import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.component import Component


class ProjectStatus(enum.StrEnum):
    active = "active"
    done = "done"
    paused = "paused"
    relegated = "relegated"


class MediaType(enum.StrEnum):
    image = "image"
    video = "video"
    render_3d = "3d_render"
    cad = "cad"
    code = "code"  # file_url holds a repo URL rather than an R2 object for this type


class Project(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    problem_statement: Mapped[str | None] = mapped_column(Text)
    abstract: Mapped[str | None] = mapped_column(Text)
    specifications: Mapped[str | None] = mapped_column(Text)
    requirement: Mapped[str | None] = mapped_column(Text)
    next_steps: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)

    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status", native_enum=False, length=20),
        default=ProjectStatus.active,
        nullable=False,
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    media: Mapped[list["ProjectMedia"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    mil_items: Mapped[list["MILItem"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectMedia(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "project_media"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    project: Mapped[Project] = relationship(back_populates="media")

    media_type: Mapped[MediaType] = mapped_column(
        Enum(MediaType, name="media_type", native_enum=False, length=20), nullable=False
    )
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    filename: Mapped[str | None] = mapped_column(String(300))
    # Client-rendered preview image (a captured video frame, or an
    # off-screen three.js/occt-import-js snapshot of a 3D/STEP model) used
    # for the Media & Files grid tile — see app/services/project_media.py's
    # upload_project_media_thumbnail. Optional: images don't need one (the
    # original serves as its own thumbnail), and .sldprt/`code` entries
    # have nothing that can be rendered to snapshot.
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000))


class MILItem(UUIDPkMixin, TimestampMixin, Base):
    """Minimum Item List — links a project to real inventory components,
    which is the whole point of sharing one database across tools."""

    __tablename__ = "mil_items"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    project: Mapped[Project] = relationship(back_populates="mil_items")

    component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("components.id", ondelete="RESTRICT"), nullable=False
    )
    # No back_populates — Component doesn't need a reverse `mil_items`
    # collection of its own, same one-directional pattern as
    # BOMItem.matched_component/suggested_component in app/models/bom.py.
    component: Mapped[Component] = relationship()
    quantity_required: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
