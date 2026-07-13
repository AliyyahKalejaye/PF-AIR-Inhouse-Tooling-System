"""Cloudflare R2 upload for project media (images, video, 3D renders, CAD
files) — everything except `code`, which is a plain repo URL and never
uploaded (see ProjectMediaLinkCreate in app/schemas/project.py).

Unlike component images, several of these file types don't have a
reliable browser-reported Content-Type — .glb/.step/.sldprt commonly
arrive as "application/octet-stream" no matter what they actually are,
since browsers only recognize a small set of well-known MIME types. So
validation here is primarily by file extension, not the Content-Type
header; the header (or a best-effort guess) is still passed through to
R2's ContentType metadata so the file still opens correctly if someone
hits its public URL directly in a browser tab.
"""

import mimetypes
import uuid

from fastapi import HTTPException, UploadFile, status

from app.models.project import MediaType
from app.services.r2_client import put_object

# extension (lowercase, no dot) -> allowed for that media type.
ALLOWED_EXTENSIONS: dict[MediaType, set[str]] = {
    MediaType.image: {"jpg", "jpeg", "png", "webp"},
    MediaType.video: {"mp4", "mov"},
    MediaType.render_3d: {"glb", "gltf", "obj"},
    MediaType.cad: {"step", "stp", "sldprt"},
}

# Generous but bounded — these are occasional project-doc attachments,
# not a hot upload path, but a single video or CAD file can legitimately
# be far larger than a component thumbnail image.
MAX_BYTES: dict[MediaType, int] = {
    MediaType.image: 8 * 1024 * 1024,  # 8MB — same limit as component images
    MediaType.video: 150 * 1024 * 1024,  # 150MB
    MediaType.render_3d: 75 * 1024 * 1024,  # 75MB
    MediaType.cad: 75 * 1024 * 1024,  # 75MB
}

_UPLOADABLE_TYPES = {MediaType.image, MediaType.video, MediaType.render_3d, MediaType.cad}


def _extension(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


async def upload_project_media(
    file: UploadFile, *, project_id: uuid.UUID, media_type: MediaType
) -> tuple[str, str]:
    """Uploads a project media file to R2. Returns (file_url, filename).

    Raises 400 for `code` — that media type is a repo URL, added through
    POST /projects/{id}/media/link instead, since there's nothing to
    upload.
    """
    if media_type not in _UPLOADABLE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`code` media entries are a repo URL, not a file upload — "
            "use POST /projects/{id}/media/link instead.",
        )

    ext = _extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS[media_type]:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS[media_type]))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"That file type isn't supported for {media_type.value} — allowed: {allowed}.",
        )

    body = await file.read()
    max_bytes = MAX_BYTES[media_type]
    if len(body) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"File is larger than the {max_bytes // (1024 * 1024)}MB limit "
                f"for {media_type.value} files."
            ),
        )
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )

    content_type = (
        file.content_type
        or mimetypes.guess_type(file.filename or "")[0]
        or "application/octet-stream"
    )
    object_key = f"projects/{project_id}/{media_type.value}/{uuid.uuid4().hex}.{ext}"
    file_url = await put_object(object_key=object_key, body=body, content_type=content_type)
    return file_url, (file.filename or f"{media_type.value}.{ext}")


async def upload_staged_image(*, body: bytes, filename: str, content_type: str) -> str:
    """Stages an image extracted from an uploaded document (Phase 6's
    rule-based parser) before a project exists to attach it to yet — same
    R2 bucket, under a `projects/_staged/` prefix instead of a real
    project id. The frontend attaches it for real via
    POST /projects/{id}/media/link once the reviewed project is saved.
    """
    ext = _extension(filename) or "png"
    object_key = f"projects/_staged/{uuid.uuid4().hex}.{ext}"
    return await put_object(object_key=object_key, body=body, content_type=content_type)
