"""Shared Excel/CSV parsing for the Inventory bulk-import wizard and the
BOM checker — both start from "user uploads a spreadsheet, turn it into
plain rows keyed by header name" and diverge from there.
"""

import io

import pandas as pd
from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB — generous for a parts-list spreadsheet


async def parse_spreadsheet(
    file: UploadFile,
) -> tuple[list[dict[str, str | None]], list[str], str | None]:
    """Returns (rows, column_headers, sheet_name).

    Every cell comes back as `str | None` (never a numpy/pandas dtype) so
    downstream code — JSON responses, BOM name matching, bulk-import
    commits — never has to special-case NaN vs float vs str.
    """
    body = await file.read()
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="File is larger than the 15MB limit."
        )
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )

    filename = (file.filename or "").lower()
    sheet_name: str | None = None
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(body), dtype=str, keep_default_na=False)
        elif filename.endswith(".xlsx"):
            excel = pd.ExcelFile(io.BytesIO(body))
            sheet_name = excel.sheet_names[0]
            df = excel.parse(sheet_name, dtype=str, keep_default_na=False)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file type — upload a .csv or .xlsx file.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Couldn't read that file — make sure it's a valid CSV or Excel file.",
        ) from exc

    columns = [str(c).strip() for c in df.columns]
    df.columns = columns

    rows: list[dict[str, str | None]] = []
    for _, row in df.iterrows():
        parsed = {col: (str(val).strip() or None) for col, val in row.items()}
        # `keep_default_na=False` (above) means genuinely blank cells come
        # back as "" -> None rather than NaN, so pandas' own dropna(how=
        # "all") wouldn't catch a fully-blank row — filter those out here
        # instead, on the already-normalized values.
        if any(v is not None for v in parsed.values()):
            rows.append(parsed)

    return rows, columns, sheet_name
