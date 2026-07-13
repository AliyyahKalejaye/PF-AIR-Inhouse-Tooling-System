"""Shared low-level Cloudflare R2 (S3-compatible object storage) helpers.

Split out of app/services/r2.py once a second module (project_media.py,
Phase 6) needed the same "get a boto3 client" / "build a public URL" /
"put bytes, translating boto errors into a normal 502" logic — one copy
here keeps the two services' R2 error handling from silently drifting
apart as more upload types get added.

boto3 is synchronous; uploads are not a hot path (occasional
create/edit actions, not per-request), so each call is off-loaded to
FastAPI's threadpool via `run_in_threadpool` rather than pulling in
aioboto3 for one client.
"""

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.core.config import get_settings

settings = get_settings()


def get_client():
    if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File upload isn't configured yet (R2 credentials missing on the server).",
        )
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def public_url(object_key: str) -> str:
    base = settings.r2_public_base_url.rstrip("/")
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File upload isn't configured yet (R2 public base URL missing on the server).",
        )
    return f"{base}/{object_key}"


async def put_object(*, object_key: str, body: bytes, content_type: str) -> str:
    """Uploads bytes to R2 under object_key and returns its public URL."""

    def _put() -> None:
        client = get_client()
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
                detail="Failed to upload file to storage. Please try again.",
            ) from exc

    await run_in_threadpool(_put)
    return public_url(object_key)


async def delete_object(object_key: str) -> None:
    """Best-effort delete — a storage-side hiccup shouldn't block deleting
    the database row the user actually asked to remove, so errors here
    are swallowed rather than raised.

    Deliberately catches Exception, not just (BotoCoreError, ClientError):
    get_client() itself raises HTTPException(503) if R2 credentials are
    missing, and that must be swallowed here too — otherwise a
    misconfigured server would block every media/project delete instead
    of just skipping the (already-inaccessible) storage cleanup.
    """

    def _delete() -> None:
        try:
            get_client().delete_object(Bucket=settings.r2_bucket_name, Key=object_key)
        except Exception:  # noqa: BLE001 — best-effort cleanup must never raise
            pass

    await run_in_threadpool(_delete)


def object_key_from_url(file_url: str) -> str | None:
    """Recovers the R2 object key from a public URL this service
    generated, so a media-delete call can also clean up storage. Returns
    None for URLs that aren't ours (e.g. a `code` media entry, which is a
    plain external repo URL, never uploaded to R2) — callers should treat
    that as "nothing to delete from storage," not an error.
    """
    base = settings.r2_public_base_url.rstrip("/")
    if not base or not file_url.startswith(base + "/"):
        return None
    return file_url[len(base) + 1 :]
