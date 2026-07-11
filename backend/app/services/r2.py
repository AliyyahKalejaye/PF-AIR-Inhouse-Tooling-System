"""Cloudflare R2 (S3-compatible object storage) client for component images.

R2 credentials are optional at the settings level (see app/core/config.py —
they default to empty strings for local dev). If they're unset, upload
calls raise a clear 503 rather than a confusing boto3 stack trace, so a
half-configured deploy fails loudly at the one endpoint that needs R2
instead of crashing the whole app at import time.

boto3 is synchronous; R2 uploads are not a hot path (occasional component
creation/edit), so each call is off-loaded to FastAPI's threadpool via
`run_in_threadpool` rather than pulling in aioboto3 for one client.
"""

import mimetypes
import uuid

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings

settings = get_settings()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8MB, matches the Add Component mockup copy


def _client():
    if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image upload isn't configured yet (R2 credentials missing on the server).",
        )
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _public_url(object_key: str) -> str:
    base = settings.r2_public_base_url.rstrip("/")
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image upload isn't configured yet (R2 public base URL missing on the server).",
        )
    return f"{base}/{object_key}"


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

    def _put() -> None:
        client = _client()
        try:
            client.put_object(
                Bucket=settings.r2_bucket_name,
                Key=object_key,
                Body=body,
                ContentType=content_type,
            )
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to upload image to storage. Please try again.",
            ) from exc

    await run_in_threadpool(_put)
    return _public_url(object_key)
