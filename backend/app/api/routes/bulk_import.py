from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.inventory import (
    BulkImportCommitRequest,
    BulkImportCommitResponse,
    BulkImportPreviewResponse,
    BulkImportSkippedRow,
)
from app.services.bulk_import import auto_map_columns, commit_bulk_import
from app.services.spreadsheet import parse_spreadsheet

router = APIRouter(prefix="/bulk-import", tags=["inventory"])


@router.post("/preview", response_model=BulkImportPreviewResponse)
async def preview_bulk_import(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
) -> BulkImportPreviewResponse:
    rows, columns, sheet = await parse_spreadsheet(file)
    if not columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Couldn't find any columns in that file.",
        )

    mapped_columns = auto_map_columns(columns, rows)
    unmatched = [c.source_column for c in mapped_columns if c.status == "manual"]

    warnings = []
    if unmatched:
        warnings.append(
            f"{len(unmatched)} column(s) couldn't be auto-matched — map them manually or "
            f"mark them to skip before continuing: {', '.join(unmatched)}"
        )
    if not any(c.mapped_field == "name" for c in mapped_columns):
        warnings.append(
            "No column was matched to Name — you'll need to map one manually to continue."
        )

    return BulkImportPreviewResponse(
        filename=file.filename or "import.csv",
        rows_detected=len(rows),
        columns_detected=len(columns),
        sheet=sheet,
        columns=mapped_columns,
        rows=rows,
        warnings=warnings,
    )


@router.post(
    "/commit", response_model=BulkImportCommitResponse, status_code=status.HTTP_201_CREATED
)
async def commit_import(
    payload: BulkImportCommitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkImportCommitResponse:
    if "name" not in payload.mapping.values():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one column must be mapped to Name before importing.",
        )
    if not payload.rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows to import.")

    created, skipped, warnings = await commit_bulk_import(
        db, mapping=payload.mapping, rows=payload.rows, created_by=current_user.id
    )

    return BulkImportCommitResponse(
        created=created,
        skipped_rows=[BulkImportSkippedRow(row_index=i, reason=r) for i, r in skipped],
        warnings=warnings,
    )
