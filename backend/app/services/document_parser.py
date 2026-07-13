"""Rule-based section extraction for the "Upload a Document" project
creation path (screens: Add New Project → Upload a Document → Review
Extracted Details).

This is deliberately NOT an LLM/AI extraction step — it's a heading match
against a fixed, known set of section names from the standard Proforce
Project Write-up template, using python-docx (for .docx) and pdfplumber
(for .pdf). If a document's heading is worded differently, merged with
another section, or missing entirely, that field is simply left unmatched
for the user to fill in on the review screen — nothing is inferred or
generated. See PROJECT_TEXT_FIELDS in app/schemas/project.py for the full
field list and app/services/bulk_import.py for the same
alias-list-plus-fuzzy-match pattern used elsewhere in this codebase.

DOCX headings are detected two ways: real Word heading paragraph styles
("Heading 1"..."Heading 9", "Title") when the author used them, and a
fallback of "short, fully-bold paragraph" for documents that just bolded
a section label instead. Content between headings is verbatim from the
document; nothing is summarized or reformatted.

PDF headings are detected more weakly, since pdfplumber's plain text
extraction doesn't preserve bold/font-size information per line the way
python-docx exposes paragraph styles. A PDF line only becomes a heading
candidate if it's short and matches a known field's aliases closely (a
higher score threshold than DOCX to compensate for the missing
formatting signal) — this is a known, documented limitation of the PDF
path, not a bug: PDFs the rule-based matcher can't confidently parse
should fall back to leaving fields blank rather than guessing wrong.

Embedded image extraction only happens for .docx (via the package's own
media relationships) — PDFs don't get image extraction in this phase; per
the approved mockup's own copy, "CAD and code files aren't auto-extracted
— attach separately" applies here too.
"""

import io
import re
import uuid
from dataclasses import dataclass, field

import pdfplumber
from docx import Document
from docx.document import Document as DocxDocument
from docx.opc.constants import RELATIONSHIP_TYPE
from fastapi import HTTPException, UploadFile, status
from rapidfuzz import fuzz, process

from app.models.project import MediaType
from app.schemas.project import DocumentParseResponse, ParsedField, ParsedMedia
from app.services.project_media import upload_staged_image

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25MB — a write-up doc plus a few embedded images

# Heading aliases per field — matched case-insensitively, punctuation
# stripped. Order in PROJECT_TEXT_FIELDS (app/schemas/project.py) is the
# expected document order, but matching itself doesn't require that order.
_FIELD_ALIASES: dict[str, list[str]] = {
    "title": ["project title", "title"],
    "problem_statement": ["problem statement", "problem", "the problem"],
    "abstract": ["abstract", "summary", "overview"],
    "specifications": ["specifications", "specification", "technical specifications", "specs"],
    "requirement": ["requirement", "requirements", "acceptance criteria"],
    "next_steps": ["next steps", "next step", "immediate next steps"],
    "note": ["note", "notes", "remarks", "internal notes"],
}

DOCX_MATCH_THRESHOLD = 78.0  # formatting already signals "this is a heading"
PDF_MATCH_THRESHOLD = 85.0  # no formatting signal — require a closer text match

# A heading-candidate line/paragraph shouldn't read like a sentence.
_MAX_HEADING_LENGTH = 60

# Images this small are almost always a logo, bullet icon, or page-header
# graphic embedded in the template rather than real project content.
_MIN_EMBEDDED_IMAGE_BYTES = 3 * 1024

_IMAGE_CONTENT_TYPE_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/x-wmf": "wmf",
    "image/x-emf": "emf",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().rstrip(":").strip().lower()


def _best_field_for_heading(text: str, *, threshold: float) -> str | None:
    normalized = _normalize(text)
    if not normalized or len(normalized) > _MAX_HEADING_LENGTH:
        return None

    for field_name, aliases in _FIELD_ALIASES.items():
        if normalized in aliases:
            return field_name

    best_field: str | None = None
    best_score = 0.0
    for field_name, aliases in _FIELD_ALIASES.items():
        match = process.extractOne(normalized, aliases, scorer=fuzz.token_sort_ratio)
        if match and match[1] > best_score:
            best_field, best_score = field_name, match[1]
    return best_field if best_score >= threshold else None


@dataclass
class _Capture:
    heading_text: str
    page: int | None
    lines: list[str] = field(default_factory=list)


def _finalize_fields(
    captures: dict[str, _Capture],
) -> dict[str, ParsedField]:
    fields: dict[str, ParsedField] = {}
    for field_name in _FIELD_ALIASES:
        capture = captures.get(field_name)
        if capture is None:
            fields[field_name] = ParsedField(value=None, matched=False)
            continue
        value = "\n".join(line for line in capture.lines if line).strip()
        fields[field_name] = ParsedField(
            value=value or None,
            matched=True,
            heading=capture.heading_text,
            page=capture.page,
        )
    return fields


def _is_bold_heading_paragraph(paragraph) -> bool:
    text = paragraph.text.strip()
    if not text or len(text) > _MAX_HEADING_LENGTH:
        return False
    runs = [r for r in paragraph.runs if r.text.strip()]
    if not runs:
        return False
    return all(r.bold for r in runs)


def _is_docx_heading_style(paragraph) -> bool:
    style_name = getattr(paragraph.style, "name", None) or ""
    return style_name.startswith("Heading") or style_name == "Title"


async def _parse_docx(raw: bytes) -> tuple[dict[str, ParsedField], list[ParsedMedia], None]:
    document = Document(io.BytesIO(raw))

    captures: dict[str, _Capture] = {}
    current: _Capture | None = None

    for paragraph in document.paragraphs:
        style_heading = _is_docx_heading_style(paragraph)
        bold_heading = (not style_heading) and _is_bold_heading_paragraph(paragraph)
        if style_heading or bold_heading:
            matched_field = _best_field_for_heading(paragraph.text, threshold=DOCX_MATCH_THRESHOLD)
            if matched_field is not None and matched_field not in captures:
                current = _Capture(heading_text=paragraph.text.strip(), page=None)
                captures[matched_field] = current
            elif style_heading:
                # A real Word heading style we don't recognize (or a
                # duplicate of one we already have) unambiguously starts a
                # new, untracked section — its content belongs to a
                # heading we're not tracking, not to the previous one.
                current = None
            # An unmatched *bold-fallback* candidate is ambiguous — it
            # could be a section label worded differently, or just a
            # bolded callout inside body text — so it doesn't end the
            # current capture; the paragraph itself just isn't captured
            # as heading text (and isn't appended as content either).
            continue

        if current is not None and paragraph.text.strip():
            current.lines.append(paragraph.text.strip())

    media = await _extract_docx_images(document)
    return _finalize_fields(captures), media, None


async def _extract_docx_images(document: DocxDocument) -> list[ParsedMedia]:
    media: list[ParsedMedia] = []
    for rel in document.part.rels.values():
        if rel.reltype != RELATIONSHIP_TYPE.IMAGE or rel.is_external:
            continue
        image_part = rel.target_part
        blob = image_part.blob
        if len(blob) < _MIN_EMBEDDED_IMAGE_BYTES:
            continue

        content_type = image_part.content_type or "image/png"
        ext = _IMAGE_CONTENT_TYPE_EXT.get(content_type, "png")
        filename = f"embedded_{uuid.uuid4().hex[:8]}.{ext}"
        file_url = await upload_staged_image(
            body=blob, filename=filename, content_type=content_type
        )
        media.append(ParsedMedia(filename=filename, media_type=MediaType.image, file_url=file_url))
    return media


def _parse_pdf(raw: bytes) -> tuple[dict[str, ParsedField], list[ParsedMedia], int]:
    captures: dict[str, _Capture] = {}
    current: _Capture | None = None
    page_count = 0

    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        page_count = len(pdf.pages)
        for page_number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            for raw_line in text.split("\n"):
                stripped_line = raw_line.strip()
                if not stripped_line:
                    continue

                matched_field = _best_field_for_heading(
                    stripped_line, threshold=PDF_MATCH_THRESHOLD
                )
                if matched_field is not None:
                    if matched_field not in captures:
                        current = _Capture(heading_text=stripped_line, page=page_number)
                        captures[matched_field] = current
                    else:
                        # A repeated/duplicate heading (e.g. a running
                        # header, or the same section title reappearing)
                        # ends the current capture rather than being
                        # swallowed as body content — same rule as _parse_docx.
                        current = None
                    continue

                if current is not None:
                    current.lines.append(stripped_line)

    # PDFs aren't scanned for embedded images in this phase — see module
    # docstring for why.
    return _finalize_fields(captures), [], page_count


async def parse_project_document(file: UploadFile) -> DocumentParseResponse:
    filename = file.filename or "document"
    lower_name = filename.lower()
    if lower_name.endswith(".docx"):
        doc_type = "docx"
    elif lower_name.endswith(".pdf"):
        doc_type = "pdf"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .docx or .pdf project write-ups are supported.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File is larger than the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit.",
        )

    if doc_type == "docx":
        try:
            fields, media, page_count = await _parse_docx(raw)
        except HTTPException:
            # A genuine upstream failure (R2 not configured, R2 upload
            # error) from embedded-image staging — not a bad document.
            # Let it propagate with its real status code instead of being
            # relabeled as a 400 "corrupted file" below.
            raise
        except Exception as exc:  # noqa: BLE001 — a malformed .docx should 400, not 500
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Couldn't read that .docx file — it may be corrupted or not "
                    "a real Word document."
                ),
            ) from exc
    else:
        try:
            fields, media, page_count = _parse_pdf(raw)
        except Exception as exc:  # noqa: BLE001 — a malformed PDF should 400, not 500
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Couldn't read that PDF — it may be corrupted, scanned-image-only, "
                    "or encrypted."
                ),
            ) from exc

    matched_count = sum(1 for f in fields.values() if f.matched)
    return DocumentParseResponse(
        filename=filename,
        doc_type=doc_type,
        page_count=page_count,
        fields=fields,
        matched_count=matched_count,
        total_fields=len(_FIELD_ALIASES),
        media=media,
    )
