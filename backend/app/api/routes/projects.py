import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.component import Component
from app.models.project import MediaType, MILItem, Project, ProjectMedia, ProjectStatus
from app.models.user import User
from app.schemas.project import (
    DocumentParseResponse,
    MILItemCreate,
    MILItemRead,
    MILItemUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectMediaLinkCreate,
    ProjectMediaRead,
    ProjectRead,
    ProjectUpdate,
)
from app.services.document_parser import parse_project_document
from app.services.notifications import (
    notify_project_created,
    notify_project_deleted,
    notify_project_status_changed,
)
from app.services.project_media import upload_project_media
from app.services.r2_client import delete_object, object_key_from_url

router = APIRouter(prefix="/projects", tags=["projects"])


async def _get_project_or_404(db: AsyncSession, project_id: uuid.UUID) -> Project:
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.media),
            selectinload(Project.mil_items)
            .selectinload(MILItem.component)
            .selectinload(Component.category),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


async def _project_exists_or_404(db: AsyncSession, project_id: uuid.UUID) -> Project:
    """Lightweight existence check — no eager-loading — for routes that
    only need to confirm the project exists (e.g. before attaching a
    child row) and don't return the project's own detail payload."""
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


async def _get_mil_item_or_404(
    db: AsyncSession, project_id: uuid.UUID, mil_item_id: uuid.UUID
) -> MILItem:
    result = await db.execute(
        select(MILItem).where(MILItem.id == mil_item_id, MILItem.project_id == project_id)
    )
    mil_item = result.scalar_one_or_none()
    if mil_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MIL item not found.")
    return mil_item


async def _get_media_or_404(
    db: AsyncSession, project_id: uuid.UUID, media_id: uuid.UUID
) -> ProjectMedia:
    result = await db.execute(
        select(ProjectMedia).where(
            ProjectMedia.id == media_id, ProjectMedia.project_id == project_id
        )
    )
    media = result.scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found.")
    return media


@router.get("", response_model=list[ProjectListItem])
async def list_projects(
    project_status: ProjectStatus | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Project]:
    query = select(Project)
    if project_status is not None:
        query = query.where(Project.status == project_status)
    result = await db.execute(query.order_by(Project.updated_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    project = Project(**payload.model_dump(), created_by=current_user.id)
    db.add(project)
    await db.flush()
    await notify_project_created(db, project)
    await db.commit()
    return await _get_project_or_404(db, project.id)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    return await _get_project_or_404(db, project_id)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    project = await _get_project_or_404(db, project_id)
    old_status = project.status
    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(project, field_name, value)
    if "status" in updates:
        await notify_project_status_changed(db, project, old_status)
    await db.commit()
    return await _get_project_or_404(db, project_id)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    project = await _get_project_or_404(db, project_id)
    # Best-effort storage cleanup — the DB rows go regardless (cascade
    # delete on the FK), so a storage hiccup here shouldn't block the
    # delete the user actually asked for.
    for media in project.media:
        object_key = object_key_from_url(media.file_url)
        if object_key is not None:
            await delete_object(object_key)
    await notify_project_deleted(db, project)
    await db.delete(project)
    await db.commit()


# --- Media ---


@router.post(
    "/{project_id}/media", response_model=ProjectMediaRead, status_code=status.HTTP_201_CREATED
)
async def upload_project_media_route(
    project_id: uuid.UUID,
    file: UploadFile,
    media_type: MediaType = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMedia:
    project = await _project_exists_or_404(db, project_id)
    file_url, filename = await upload_project_media(
        file, project_id=project.id, media_type=media_type
    )
    media = ProjectMedia(
        project_id=project.id, media_type=media_type, file_url=file_url, filename=filename
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return media


@router.post(
    "/{project_id}/media/link", response_model=ProjectMediaRead, status_code=status.HTTP_201_CREATED
)
async def link_project_media(
    project_id: uuid.UUID,
    payload: ProjectMediaLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMedia:
    """Attaches media by URL rather than a file upload — a `code` repo
    link, or an image already staged in R2 by the document parser (see
    ProjectMediaLinkCreate's docstring)."""
    project = await _project_exists_or_404(db, project_id)
    media = ProjectMedia(
        project_id=project.id,
        media_type=payload.media_type,
        file_url=payload.file_url,
        filename=payload.filename,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return media


@router.delete("/{project_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_media(
    project_id: uuid.UUID,
    media_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    media = await _get_media_or_404(db, project_id, media_id)
    object_key = object_key_from_url(media.file_url)
    if object_key is not None:
        await delete_object(object_key)
    await db.delete(media)
    await db.commit()


# --- MIL (Minimum Item List) ---


@router.post(
    "/{project_id}/mil-items", response_model=MILItemRead, status_code=status.HTTP_201_CREATED
)
async def add_mil_item(
    project_id: uuid.UUID,
    payload: MILItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MILItem:
    await _project_exists_or_404(db, project_id)  # 404s before touching anything else

    component = await db.get(Component, payload.component_id)
    if component is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found.")

    existing = await db.scalar(
        select(MILItem).where(
            MILItem.project_id == project_id, MILItem.component_id == payload.component_id
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{component.name}' is already on this project's MIL — "
                "update its quantity instead."
            ),
        )

    mil_item = MILItem(
        project_id=project_id,
        component_id=payload.component_id,
        quantity_required=payload.quantity_required,
    )
    db.add(mil_item)
    await db.commit()

    result = await db.execute(
        select(MILItem)
        .options(selectinload(MILItem.component).selectinload(Component.category))
        .where(MILItem.id == mil_item.id)
    )
    return result.scalar_one()


@router.patch("/{project_id}/mil-items/{mil_item_id}", response_model=MILItemRead)
async def update_mil_item(
    project_id: uuid.UUID,
    mil_item_id: uuid.UUID,
    payload: MILItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MILItem:
    mil_item = await _get_mil_item_or_404(db, project_id, mil_item_id)
    mil_item.quantity_required = payload.quantity_required
    await db.commit()

    result = await db.execute(
        select(MILItem)
        .options(selectinload(MILItem.component).selectinload(Component.category))
        .where(MILItem.id == mil_item.id)
    )
    return result.scalar_one()


@router.delete("/{project_id}/mil-items/{mil_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mil_item(
    project_id: uuid.UUID,
    mil_item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    mil_item = await _get_mil_item_or_404(db, project_id, mil_item_id)
    await db.delete(mil_item)
    await db.commit()


# --- Document parsing (rule-based heading match, not AI — see
# app/services/document_parser.py's module docstring) ---


@router.post("/parse-document", response_model=DocumentParseResponse)
async def parse_document(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
) -> DocumentParseResponse:
    return await parse_project_document(file)
