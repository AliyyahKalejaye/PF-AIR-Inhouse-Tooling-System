"""Cloudflare R2 upload for component images.

The shared client/upload/delete plumbing (credential checks, public URL
building, boto error translation) lives in app/services/r2_client.py —
this module is just the component-image-specific policy (allowed types,
size limit, object key layout) on top of it. See r2_client.py's docstring
for why a second Phase 6 module (project_media.py) made that split worth
doing.
"""

import mimetypes
import uuid

from fastapi import HTTPException, UploadFile, status

from app.services.r2_client import put_object

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8MB, matches the Add Component mockup copy


async def upload_component_image(file: UploadFile, *, component_id: uuid.UUID) -> str:
    """Uploads a component image to R2 and returns its public URL.

    Validates content type and size before ever touching R2 so a bad
    upload fails fast with a normal 4xx instead of an opaque provider
    error partway through.
    """
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0]
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Images must be JPG, PNG, or WEBP.",
        )

    body = await file.read()
    if len(body) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image is larger than the 8MB limit.",
        )
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[content_type]
    object_key = f"components/{component_id}/{uuid.uuid4().hex}.{ext}"
    return await put_object(object_key=object_key, body=body, content_type=content_type)
